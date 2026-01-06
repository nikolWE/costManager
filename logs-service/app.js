require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const Log = require('../models/Log');

const app = express();
app.use(express.json());

const pinoHttp = require('pino-http');
const { saveLog } = require('./logger');

app.use(
    pinoHttp({
        customLogLevel: () => 'info',
        customSuccessMessage: req => `${req.method} ${req.url}`,
        customErrorMessage: req => `error on ${req.method} ${req.url}`,
        hooks: {
            logMethod(inputArgs, method) {
                const req = inputArgs[0];
                const res = inputArgs[1];

                saveLog({
                    method: req.method,
                    endpoint: req.url,
                    status: res.statusCode,
                    message: 'http request'
                }).catch(() => {});

                method.apply(this, inputArgs);
            }
        }
    })
);

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
   List of all logs
========================= */
app.get('/api/logs', async (req, res) => {
    try {
        const logs = await Log.find();
        res.json(logs);
    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});

/* =========================
   (Optional) POST /api/logs
   Add a log manually
   Useful for tests
========================= */
app.post('/api/logs', async (req, res) => {
    try {
        const { method, endpoint, status, message } = req.body;

        const log = await Log.create({
            method,
            endpoint,
            status,
            message,
            timestamp: new Date()
        });

        res.json(log);
    } catch (err) {
        res.status(500).json({
            error: err.message
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

console.log('logs-service started');
