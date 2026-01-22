
require('dotenv').config();

/*
 * External Dependencies:
 * - express: Web framework for handling HTTP requests.
 * - mongoose: ODM for MongoDB schema definition and queries.
 * - axios: HTTP client used for inter-service communication (logs/costs).
 */
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
/*
 * Internal Dependencies:
 * - User: Mongoose model representing the user document structure.
 * - UserException: Custom error class for standardized exception handling.
 */
const User = require('./models/User');
const UserException = require('./userException');

const app = express();
app.use(express.json());

const writeLog = async (method, endpoint, status) => {
    try {
        /*
        * Logging Utility (Async):
        * Sends log data to the centralized 'logs-service'.
        * Wrapped in a try-catch block to ensure that logging failures
        * do not interrupt the main application flow (Fire-and-Forget).
        */
        if (!process.env.LOGS_URL) return;
        await axios.post(process.env.LOGS_URL + '/api/logs', {
            service: 'users',
            method,
            endpoint,
            status,
            timestamp: new Date()
        });
    } catch (e) {
        /* Silent failure: Logging system downtime should not crash the app */
    }
};
/*
 * Database Initialization:
 * Establishes a connection to the MongoDB cluster.
 * Logs the connection status to the console for monitoring purposes.
 */
mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB connected (users-service)'))
    .catch((err) => console.error('MongoDB connection error (users-service):', err));
/*
 * Health Check Endpoint:
 * Simple probe used by load balancers or container orchestrators
 * to verify the service is up and ready to accept traffic.
 */
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});
/*
 * POST /api/add
 * Logic: Creates a new user in the system.
 * Requires comprehensive validation of all input fields before insertion.
 */
app.post('/api/add', async (req, res) => {
    try {
        const { id, first_name, last_name, birthday } = req.body || {};
        /*
         * User ID Validation:
         * Ensure the ID is a valid positive integer.
         * This prevents malformed data or negative IDs from entering the persistence layer.
         */
        const idNum = Number(id);
        if (Number.isNaN(idNum) || idNum < 1) {
            await writeLog('POST', '/api/add', 400);
            throw new UserException('id must be a number bigger or equal to 0', 400);
        }
        /*
         * Field Completeness Check:
         * Verify that all mandatory fields are present in the request body.
         * Partial records are not allowed in this system.
         */
        if (!id || !first_name || !last_name || !birthday) {
            await writeLog('POST', '/api/add', 400);
            throw new UserException('Missing required fields', 400);
        }
        /*
         * Date Normalization:
         * Appending 'T12:00:00' prevents timezone offsets from shifting the date
         * to the previous day (e.g., UTC midnight vs Local Time).
         */
        const birthDate = new Date(birthday + 'T12:00:00');

        if (Number.isNaN(birthDate.getTime())) {
            await writeLog('POST', '/api/add', 400);
            throw new UserException('Invalid birthday format. Use YYYY-MM-DD', 400);
        }
        /*
         * Logical Date Validation:
         * Ensure the user was born in the past.
         * Future dates are logically impossible for a birthday field.
         */
        if (birthDate > new Date()) {
            await writeLog('POST', '/api/add', 400);
            throw new UserException('Birthday cannot be in the future', 400);
        }
        /*
         * Database Persistence:
         * Create the new user document using Mongoose.
         * If successful, return the created object with status 201 (Created).
         */
        const user = await User.create({
            id: idNum,
            first_name,
            last_name,
            birthday: birthDate
        });
        await writeLog('POST', '/api/add', 201);
        return res.status(201).json(user);

    } catch (err) {
        /*
         * Custom Exception Handling:
         * Catch validation errors thrown explicitly by our code.
         * Return the specific status code and message defined in the exception.
         */
        if (err instanceof UserException) {
            return res.status(err.status).json({
                id: err.status,
                message: err.message
            });
        }
        /*
         * MongoDB Duplicate Key Error (E11000):
         * Specifically handle cases where a user with the same ID already exists.
         * Return a 409 Conflict status code.
         */
        if (err && err.code === 11000) {
            await writeLog('POST', '/api/add', 409);
            return res.status(409).json({
                id: 409,
                message: 'User already exists'
            });
        }
        /*
         * Generic Server Error:
         * Fallback for unexpected runtime errors.
         * Return a 500 status code to indicate internal failure.
         */
        await writeLog('POST', '/api/add', 500);
        return res.status(500).json({
            id: 1,
            message: err.message
        });
    }
});
/*
 * GET /api/users
 * Logic: Retrieve all users from the database.
 * Uses .lean() for performance optimization (returns plain JS objects).
 */
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find().lean();
        await writeLog('GET', '/api/users', 200);
        return res.json(users);
    } catch (err) {
        await writeLog('GET', '/api/users', 500);
        return res.status(500).json({ id: 2, message: err.message });
    }
});

/*
 * GET /api/users/:id
 * Logic: Fetch detailed user information including aggregated costs.
 * Requires communication with the external 'costs-service'.
 */
app.get('/api/users/:id', async (req, res) => {
    try {
        const userId = Number(req.params.id);

        if (Number.isNaN(userId)) {
            await writeLog('GET', '/api/users/:id', 400);
            throw new UserException('Invalid user id', 400);
        }
        /*
         * Database Lookup:
         * Attempt to find the user by their custom numeric ID.
         * Explicitly throw a 404 exception if no document matches.
         */
        const user = await User.findOne({ id: userId }).lean();
        if (!user) {
            await writeLog('GET', '/api/users/:id', 404);
            throw new UserException('User not found', 404);
        }
        /*
         * Dependency Check:
         * Ensure the Costs Service URL is configured in the environment.
         * This prevents runtime crashes when attempting the axios call.
         */
        if (!process.env.COSTS_URL) {
            await writeLog('GET', '/api/users/:id', 500);
            throw new UserException('COSTS_URL is not configured', 500);
        }
        /*
         * Microservice Aggregation (Fault Tolerant):
         * Perform a request to the costs-service to get the total expenses.
         * Wrapped in a separate try-catch to allow partial success:
         * if costs-service fails, we return the user with total=0.
         */
        let total = 0;
        try {
            const totalResponse = await axios.get(process.env.COSTS_URL + '/api/total', {
                params: { userid: userId }
            });
            total = Number(totalResponse.data && totalResponse.data.total) || 0;
        } catch (axiosErr) {
            console.error('Failed to fetch costs:', axiosErr.message);
        }
        await writeLog('GET', '/api/users/:id', 200);
        /*
         * Response Composition:
         * Merge the local user data with the fetched total cost.
         */
        return res.json({
            id: user.id,
            first_name: user.first_name,
            last_name: user.last_name,
            total: total
        });
    } catch (err) {
        /*
         * Error Handling Strategy:
         * Return consistent JSON error responses for all exceptions,
         * including 404 Not Found, to maintain API uniformity.
         */
        if (err instanceof UserException) {
            return res.status(err.status).json({
                id: err.status,
                message: err.message
            });
        }
        await writeLog('GET', '/api/users/:id', 500);
        return res.status(500).json({ id: 2, message: err.message });
    }
});
/*
 * Server Startup:
 * Initialize the HTTP server on the specified port.
 */


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('Users service running on port ' + PORT);
});

