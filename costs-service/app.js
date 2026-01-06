require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');

const pino = require('pino');
const pinoHttp = require('pino-http');

const Cost = require('../models/Cost');

const app = express();
app.use(express.json());

/* ---------- LOGGER (PINO) ---------- */
const logger = pino({ level: 'info' });

app.use(
    pinoHttp({
        logger,
        customSuccessMessage(req, res) {
            return `${req.method} ${req.url} ${res.statusCode}`;
        }
    })
);

/* ---------- LOGS SERVICE ---------- */
async function writeLog(method, endpoint, status) {
    try {
        await axios.post(process.env.LOGS_URL + '/api/logs', {
            service: 'costs',
            method,
            endpoint,
            status,
            timestamp: new Date()
        });
    } catch (e) {
        // לא מפילים את השירות אם logs לא זמין
    }
}

/* ---------- DB ---------- */
mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB connected (costs-service)'))
    .catch(err => console.error('MongoDB connection error:', err));

/* ---------- HEALTH ---------- */
app.get('/health', (req, res) => {
    res.json({ status: 'costs service ok' });
});

/* ---------- ADD COST ---------- */
app.post('/api/add', async (req, res) => {
    try {
        const { userid, sum, category, description, day, month, year } = req.body;

        if (!userid || !sum || !category || !description || !day || !month || !year) {
            await writeLog('POST', '/api/add', 400);
            return res.status(400).json({
                id: 400,
                message: 'Missing required fields'
            });
        }

        const cost = await Cost.create({
            userid,
            sum,
            category,
            description,
            day,
            month,
            year
        });

        await writeLog('POST', '/api/add', 200);
        res.json(cost);

    } catch (err) {
        await writeLog('POST', '/api/add', 500);
        res.status(500).json({
            id: 1,
            message: err.message
        });
    }
});

/* ---------- REPORT ---------- */
app.get('/api/report', async (req, res) => {
    try {
        const { userid, month, year } = req.query;

        if (!userid || !month || !year) {
            await writeLog('GET', '/api/report', 400);
            return res.status(400).json({
                id: 400,
                message: 'Missing query parameters'
            });
        }

        const FIXED_CATEGORIES = [
            'food',
            'education',
            'health',
            'housing',
            'sports'
        ];

        const costs = await Cost.find({
            userid: Number(userid),
            month: Number(month),
            year: Number(year)
        });

        const dynamicCategories = [...new Set(costs.map(c => c.category))];

        const ALL_CATEGORIES = [
            ...FIXED_CATEGORIES,
            ...dynamicCategories.filter(c => !FIXED_CATEGORIES.includes(c))
        ];

        const grouped = {};
        ALL_CATEGORIES.forEach(cat => {
            grouped[cat] = [];
        });

        costs.forEach(cost => {
            grouped[cost.category].push({
                sum: cost.sum,
                description: cost.description,
                day: cost.day
            });
        });

        await writeLog('GET', '/api/report', 200);

        res.json({
            userid: Number(userid),
            year: Number(year),
            month: Number(month),
            costs: ALL_CATEGORIES.map(cat => ({
                [cat]: grouped[cat]
            }))
        });

    } catch (err) {
        await writeLog('GET', '/api/report', 500);
        res.status(500).json({
            id: 1,
            message: err.message
        });
    }
});




/* ---------- SERVER ---------- */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Costs service running on port ${PORT}`);
});
