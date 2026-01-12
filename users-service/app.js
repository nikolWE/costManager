require('dotenv').config();

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
 * Express app usage.
 */
const app = express();
app.use(express.json());

/*
 * writeLog:
 * Sends log to logs-service.
 * Never fails the request if logs-service is down.
 */
const writeLog = async (method, endpoint, status) => {
    try {
        if (!process.env.LOGS_URL) return;

        await axios.post(process.env.LOGS_URL + '/api/logs', {
            service: 'users',
            method,
            endpoint,
            status,
            timestamp: new Date()
        });
    } catch (e) {
        // Do not crash the service if logs-service is unavailable
    }
};

/*
 * MongoDB connection and messages that give indecision about the status.
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
* Returns 200 OK if the service is up and running.
 */
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

/*
 * POST /api/add
 * Creates a new user.
 * Required fields: id, first_name, last_name, birthday.
 */
app.post('/api/add', async (req, res) => {
    try {
        const { id, first_name, last_name, birthday } = req.body || {};

        if (!id || !first_name || !last_name || !birthday) {
            await writeLog('POST', '/api/add', 400);
            return res.status(400).json({
                id: 400,
                message: 'Missing required fields'
            });
        }
        const birthDate = new Date(birthday + 'T12:00:00');

        if (Number.isNaN(birthDate.getTime())) {
            await writeLog('POST', '/api/add', 400);
            return res.status(400).json({
                id: 400,
                message: 'Invalid birthday format. Use YYYY-MM-DD'
            });
        }
        const user = await User.create({
            id: Number(id),
            first_name,
            last_name,
            birthday: birthDate
        });

        await writeLog('POST', '/api/add', 201);
        return res.status(201).json(user);

    } catch (err) {
        if (err && err.code === 11000) {
            await writeLog('POST', '/api/add', 409);
            return res.status(409).json({
                id: 409,
                message: 'User already exists'
            });
        }

        await writeLog('POST', '/api/add', 500);
        return res.status(500).json({
            id: 1,
            message: err.message
        });
    }
});


/*
 * GET /api/users
 * Returns all users.
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
 * Returns user details and total costs.
 * Calls costs-service (/api/total) to calculate total spending.
 */
app.get('/api/users/:id', async (req, res) => {
    try {
        const userId = Number(req.params.id);

        if (Number.isNaN(userId)) {
            await writeLog('GET', '/api/users/:id', 400);
            return res.status(400).json({ id: 400, message: 'Invalid user id' });
        }

        const user = await User.findOne({ id: userId }).lean();
        if (!user) {
            await writeLog('GET', '/api/users/:id', 404);
            return res.status(404).json({ id: 1, message: 'User not found' });
        }

        if (!process.env.COSTS_URL) {
            await writeLog('GET', '/api/users/:id', 500);
            return res.status(500).json({ id: 2, message: 'COSTS_URL is not configured' });
        }

        // Ask costs-service for total (helper endpoint in costs-service)
        const totalResponse = await axios.get(process.env.COSTS_URL + '/api/total', {
            params: { userid: userId }
        });

        const total = Number(totalResponse.data && totalResponse.data.total) || 0;

        await writeLog('GET', '/api/users/:id', 200);

        return res.json({
            id: user.id,
            first_name: user.first_name,
            last_name: user.last_name,
            total: total
        });
    } catch (err) {
        await writeLog('GET', '/api/users/:id', 500);
        return res.status(500).json({ id: 2, message: err.message });
    }
});

/*
 * Server listen
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('Users service running on port ' + PORT);
});
