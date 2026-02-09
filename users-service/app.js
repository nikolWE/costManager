require('dotenv').config();
/*
 * External Dependencies:
 * - express: Web framework for the API.
 * - mongoose: ODM for MongoDB interaction.
 * - axios: HTTP client for communicating with other microservices.
 */
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
/*
 * users-service
 * Responsibilities:
 * - Manage users collection.
 * - Retrieve user details.
 * - Fetch total user costs by calling costs-service.
 * - Send logs to logs-service.
 */
const User = require('./models/User');
/*
 * App Initialization:
 * Create the Express app and configure middleware
 * to parse JSON request bodies.
 */
const app = express();
app.use(express.json());
/*
 * writeLog Helper:
 * Asynchronously sends logs to the central logs-service.
 * Wraps the call in a try-catch to ensure that logging failures
 * do not crash the main application flow.
 */
const writeLog = async (method, endpoint, status) => {
    try {
        /* If logs-service is not configured, skip logging */
        if (!process.env.LOGS_URL) return;
        /* Send log entry to logs-service */
        await axios.post(process.env.LOGS_URL + '/api/logs', {
            service: 'users',
            method,
            endpoint,
            status,
            timestamp: new Date()
        });
    } catch (e) {
        /* Do not crash the service if logs-service is unavailable */
    }
};
/*
 * Database Connection:
 * Connects to MongoDB using the URI from environment variables.
 * Logs success or failure to the console for monitoring.
 */
mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('MongoDB connected (users-service)');
    })
    .catch((err) => {
        console.error('MongoDB connection error (users-service):', err);
    });
/*
 * GET /health
 * Health Check Endpoint:
 * Returns 200 OK to indicate the service is running.
 * Used by load balancers or container orchestrators.
 */
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});
/*
 * POST /api/add
 * User Creation:
 * Entry point for adding new users to the database.
 * Requires strict validation of input fields.
 */
app.post('/api/add', async (req, res) => {
    try {
        const { id, first_name, last_name, birthday } = req.body || {};
        /*
         * Validation - ID:
         * Ensure the ID is a valid non-negative number.
         * Returns 400 Bad Request if validation fails.
         */
        const idNum = Number(id);

        if (Number.isNaN(idNum) || idNum < 1) {
            await writeLog('POST', '/api/add', 400);
            return res.status(400).json({
                id: 400,
                message: 'id must be a number bigger or equal to 0'
            });
        }
        /*
         * Validation - Missing Fields:
         * Check if any required field is undefined or empty.
         * We need id, names, and birthday to proceed.
         */
        if (!id || !first_name || !last_name || !birthday) {
            await writeLog('POST', '/api/add', 400);
            return res.status(400).json({
                id: 400,
                message: 'Missing required fields'
            });
        }
        /*
         * Date Handling:
         * Append a specific time (T12:00:00) to the date string to prevent
         * timezone offsets from shifting the date to the previous day.
         */
        const birthDate = new Date(birthday + 'T12:00:00');

        if (Number.isNaN(birthDate.getTime())) {
            /*
         * Validation - Future Date:
         * Check if the provided birthday is in the future.
         * A user cannot be born after the current date.
         */
            if (birthDate > new Date()) {
                await writeLog('POST', '/api/add', 400);
                return res.status(400).json({
                    id: 400,
                    message: 'Birthday cannot be in the future'
                });
            }
            await writeLog('POST', '/api/add', 400);
            return res.status(400).json({
                id: 400,
                message: 'Invalid birthday format. Use YYYY-MM-DD'
            });
        }
        /*
         * DB Insertion:
         * Create the user document in MongoDB.
         * If successful, return 201 Created.
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
         * Duplicate Key Error:
         * Code 11000 indicates a unique index violation (duplicate ID).
         * Return 409 Conflict in this specific case.
         */
        if (err && err.code === 11000) {
            await writeLog('POST', '/api/add', 409);
            return res.status(409).json({
                id: 409,
                message: 'User already exists'
            });
        }

        // General server error
        await writeLog('POST', '/api/add', 500);
        return res.status(500).json({
            id: 1,
            message: err.message
        });
    }
});
/*
 * GET /api/users
 * Bulk Retrieval:
 * Fetches all user documents from the collection.
 * Uses .lean() for better performance (returns plain JS objects).
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
 * Detailed User View:
 * Returns user details combined with their total calculated costs.
 * Requires inter-service communication with 'costs-service'.
 */
app.get('/api/users/:id', async (req, res) => {
    try {
        const userId = Number(req.params.id);

        if (Number.isNaN(userId)) {
            await writeLog('GET', '/api/users/:id', 400);
            return res.status(400).json({ id: 400, message: 'Invalid user id' });
        }
        /* Fetch user from database */
        const user = await User.findOne({ id: userId }).lean();
        if (!user) {
            await writeLog('GET', '/api/users/:id', 404);
            return res.status(404).json({ id: 1, message: 'User not found' });
        }
        /*
         * External Dependency Check:
         * Before calling costs-service, verify the URL is configured.
         * This prevents runtime crashes due to missing environment variables.
         */
        if (!process.env.COSTS_URL) {
            await writeLog('GET', '/api/users/:id', 500);
            return res.status(500).json({ id: 2, message: 'COSTS_URL is not configured' });
        }
        /*
         * Aggregation Logic:
         * Call costs-service to get the sum of expenses for this user.
         * We use a specific endpoint designed for total calculation.
         */
        const totalResponse = await axios.get(process.env.COSTS_URL + '/api/total', {
            params: { userid: userId }
        });

        const total = Number(totalResponse.data && totalResponse.data.total) || 0;

        await writeLog('GET', '/api/users/:id', 200);
        /*
         * Response Composition:
         * Merge local user data with the fetched total cost.
         */
        return res.json({
            id: user.id,
            first_name: user.first_name,
            last_name: user.last_name,
            total: total
        });
    } catch (err) {
        /* Handle unexpected errors: log the failure and return HTTP 500 */
        await writeLog('GET', '/api/users/:id', 500);
        return res.status(500).json({ id: 2, message: err.message });
    }
});
/*
 * Server Startup:
 * Listen on the configured port (default 3000).
 * Log a confirmation message when the server is ready.
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('Users service running on port ' + PORT);
});