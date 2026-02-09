require('dotenv').config();
/*
 * Service Dependencies:
 * - express: Web framework for handling HTTP requests.
 * - mongoose: ODM for interacting with MongoDB.
 * - Log: Custom Mongoose model for the log structure.
 */
const express = require('express');
const mongoose = require('mongoose');
const Log = require('./models/Log');
/*
 * logs-service
 * Responsibilities:
 * - Receive logs from other services.
 * - Store logs in MongoDB.
 */
const app = express();
/*
 * Middleware Configuration:
 * Parse incoming requests with JSON payloads.
 * This is crucial since other services will send logs as JSON.
 */
app.use(express.json());
/*
 * MongoDB Connection:
 * Connects to the database using the URI defined in .env.
 * Logs success or failure to the console to help with debugging startup issues.
 */
mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('MongoDB connected (logs-service)');
    })
    .catch(err => {
        console.error('MongoDB connection failed', err);
    });
/*
 * Health Check Endpoint:
 * Simple probe used by infrastructure (like Docker or K8s)
 * to verify that the service is up and responding.
 */
app.get('/health', (req, res) => {
    res.json({ status: 'logs-service ok' });
});
/*
 * GET /api/logs
 * Retrieval Handler:
 * Fetches all log entries from the database.
 * Uses .lean() for better performance as we return plain JSON.
 */
app.get('/api/logs', async (req, res) => {
    try {
        const logs = await Log.find().lean();
        res.json(logs);
    } catch (err) {
        /*
         * Error Handling:
         * Returns a 500 Internal Server Error if the DB read fails.
         */
        res.status(500).json({
            id: 2,
            message: err.message
        });
    }
});
/*
 * POST /api/logs
 * Log Ingestion:
 * Accepts log data from other microservices (e.g., costs-service).
 */
app.post('/api/logs', async (req, res) => {
    try {
        const { service, method, endpoint, status, message } = req.body;
        /*
         * Validation Logic:
         * Ensure critical fields (method, endpoint, status) are present.
         * Returns 400 Bad Request if data is incomplete.
         */
        if (!service || !method || !endpoint || !status) {
            return res.status(400).json({
                id: 400,
                message: 'Missing required log fields'
            });
        }
        /*
         * Database Persistence:
         * Creates the new log entry in MongoDB.
         * We generate a new Date() here to mark the exact storage time.
         */
        const log = await Log.create({
            service,
            method,
            endpoint,
            status,
            message,
            timestamp: new Date()
        });
        res.status(201).json(log);

    }
        /*
         * Error Handling:
         * Catch unexpected errors and return a 500 status with the error message.
         */
    catch (err) {
        res.status(500).json({
            id: 1,
            message: err.message
        });
    }
});
/*
 * Server Startup:
 * Configures the port (defaulting to 3002) and starts listening.
 * Logs a confirmation message once the server is ready.
 */
const PORT = process.env.PORT || 3002;

app.listen(PORT, () => {
    console.log(`Logs service running on port ${PORT}`);
});