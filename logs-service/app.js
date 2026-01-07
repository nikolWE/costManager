require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');

const Log = require('./models/Log');

const app = express();
app.use(express.json());

/* =========================
   MongoDB connection
========================= */
mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('MongoDB connected (logs-service)');
    })
    .catch(err => {
        console.error('MongoDB connection failed', err);
    });

/* =========================
   Health check
========================= */
app.get('/health', (req, res) => {
    res.json({ status: 'logs-service ok' });
});

/* =========================
   GET /api/logs
   List all logs
========================= */
app.get('/api/logs', async (req, res) => {
    try {
        const logs = await Log.find().lean();
        res.json(logs);
    } catch (err) {
        res.status(500).json({
            id: 2,
            message: err.message
        });
    }
});

/* =========================
   POST /api/logs
   Add a log (from other services)
========================= */
app.post('/api/logs', async (req, res) => {
    try {
        const { service, method, endpoint, status, message } = req.body;

        if (!method || !endpoint || !status) {
            return res.status(400).json({
                id: 400,
                message: 'Missing required log fields'
            });
        }

        const log = await Log.create({
            service,
            method,
            endpoint,
            status,
            message,
            timestamp: new Date()
        });

        res.status(201).json(log);
    } catch (err) {
        res.status(500).json({
            id: 1,
            message: err.message
        });
    }
});

/* =========================
   Server listen
========================= */
const PORT = process.env.PORT || 3002;

app.listen(PORT, () => {
    console.log(`Logs service running on port ${PORT}`);
});
