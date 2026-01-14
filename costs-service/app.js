require('dotenv').config();
/*
 * External Dependencies:
 * - express: Web framework for the API.
 * - mongoose: ODM for MongoDB interaction.
 * - axios: HTTP client for communicating with other microservices (users-service, logs-service).
 */
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
/*
 * costs-service
 * Responsibilities:
 * - Add cost items.
 * - Generate monthly reports.
 * - Implement Computed Design Pattern.
 */
const pino = require('pino');
const pinoHttp = require('pino-http');

const Cost = require('./models/Cost');
const Report = require('./models/Report');
const CostException = require('./costException');

const app = express();
app.use(express.json());
/*
 * Pino Logger Configuration:
 * Sets up the logger with 'info' level.
 * Defines a custom success message format for HTTP requests
 * to keep logs clean and readable.
 */
const logger = pino({ level: 'info' });
app.use(
    pinoHttp({
        logger,
        customSuccessMessage(req, res) {
            return `${req.method} ${req.url} ${res.statusCode}`;
        }
    })
);
/*
 * Date Parsing Helper:
 * Validates strictly formatted date strings (YYYY-MM-DD or YYYY/MM/DD).
 * Returns an object indicating success (ok: true) or failure with a reason.
 */
function parseStrictDate(input) {
    if (input == null || input === '') return { ok: false, reason: 'empty' };
    if (typeof input !== 'string') return { ok: false, reason: 'not_string' };
    /*
     * Regex Validation:
     * Captures Year (group 1), Month (group 2), and Day (group 3).
     * Supports both hyphen (-) and slash (/) separators.
     */
    const m = input.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
    if (!m) return { ok: false, reason: 'bad_format' };

    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    /*
     * Logical Range Validation:
     * Ensures month is between 1-12 and day is between 1-31.
     * Further validation happens via the Date object below.
     */
    if (month < 1 || month > 12) return { ok: false, reason: 'month_range' };
    if (day < 1 || day > 31) return { ok: false, reason: 'day_range' };
    const d = new Date(year, month - 1, day);
    /*
     * Existence Check:
     * JavaScript's Date creates a valid date for Feb 30 (rolling into March).
     * This check ensures the input date matches the created date object exactly.
     */
    const same =
        d.getFullYear() === year &&
        (d.getMonth() + 1) === month &&
        d.getDate() === day;

    if (!same) return { ok: false, reason: 'nonexistent_date' };
    return { ok: true, date: d };
}
/*
 * Log Writer (Async):
 * Sends logs to the centralized 'logs-service'.
 * Designed to be 'fire-and-forget' so it doesn't block the main flow.
 */
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
        /*
         * Error Suppression:
         * If the logs-service is down, we catch the error silently.
         * This prevents the main costs-service from crashing due to logging failures.
         */
    }
}
/*
 * MongoDB Connection:
 * Connects to the database using the URI from environment variables.
 * Logs success or failure to the console for immediate startup feedback.
 */
mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB connected (costs-service)'))
    .catch(err => console.error('MongoDB connection error:', err));
/*
 * Health Check Endpoint:
 * Used by container orchestrators (like Docker/K8s) to verify
 * that the service is up and ready to accept traffic.
 */
app.get('/health', (req, res) => {
    res.json({ status: 'costs service ok' });
});
/*
 * addCost (POST /api/add):
 * Entry point for creating new expenses.
 * Handles parameter extraction, validation, and microservice communication.
 */
app.post('/api/add', async (req, res) => {
    try {
        const userid = Number(req.body.userid);
        const sum = Number(req.body.sum);
        const rawCategory = req.body.category;
        const category = (rawCategory == null) ? '' : String(rawCategory).trim().toLowerCase();
        const description = req.body.description;

        // Date Handling
        let createdAt = new Date();
        if (req.body.createdAt != null && req.body.createdAt !== '') {
            const parsed = parseStrictDate(req.body.createdAt);
            if (!parsed.ok) {
                await writeLog('POST', '/api/add', 400);
                throw new CostException('createdAt is invalid (YYYY-MM-DD)', 400);
            }
            createdAt = parsed.date;
        }

        // Field Validation
        if (Number.isNaN(userid) || Number.isNaN(sum) || !category || !description || description.trim() === '') {
            await writeLog('POST', '/api/add', 400);
            throw new CostException('Missing required fields', 400);
        }

        if (userid < 1) {
            await writeLog('POST', '/api/add', 400);
            throw new CostException('userid must be a number >= 1', 400);
        }

        if (sum <= 0) {
            await writeLog('POST', '/api/add', 400);
            throw new CostException('sum must be greater than 0', 400);
        }

        // User Validation
        if (!process.env.USERS_URL) {
            await writeLog('POST', '/api/add', 500);
            throw new CostException('USERS_URL is not configured', 500);
        }

        try {
            await axios.get(process.env.USERS_URL + '/api/users/' + userid);
        } catch (axiosErr) {
            if (axiosErr.response && axiosErr.response.status === 404) {
                throw new CostException('User does not exist', 404);
            }

            throw new CostException('Failed to validate user', 500);
        }

        // DB Insertion
        const cost = await Cost.create({
            userid,
            sum,
            category,
            description,
            createdAt,
        });

        await writeLog('POST', '/api/add', 201);
        return res.status(201).json(cost);

    } catch (err) {
        if (err instanceof CostException) {
            return res.status(err.id).json({
                id: err.id,
                message: err.message
            });
        }
        await writeLog('POST', '/api/add', 500);
        return res.status(500).json({
            id: 2,
            message: err.message || 'Internal Server Error',
        });
    }
});
/*
 * GET /api/report
 * Computed Design Pattern Implementation:
 * Retrieves monthly reports. If the report is for a past month,
 * it checks the cache (Report model) first before calculating.
 */
app.get('/api/report', async (req, res) => {
    try {
        const userid = Number(req.query.userid ?? req.query.id);
        const year = Number(req.query.year);
        const month = Number(req.query.month);

        if (Number.isNaN(userid) || Number.isNaN(year) || Number.isNaN(month)) {
            throw new CostException('id, year, month are required and must be numbers', 400);
        }
        if (month < 1 || month > 12) {
            throw new CostException('month must be 1-12', 400);
        }
        try {
            // אנחנו שולחים בקשה לשרת היוזרים
            const userRes = await axios.get(`${process.env.USERS_URL}/api/users/${userid}`);

            // --- התיקון החדש: ---
            // גם אם הסטטוס הוא 200, אנחנו בודקים אם הגוף של התשובה ריק!
            // זה תופס מצבים שמונגו מחזיר null והאקספרס מחזיר אותו כ-json תקין.
            if (!userRes.data || (typeof userRes.data === 'object' && Object.keys(userRes.data).length === 0)) {
                throw new CostException('User not found (empty data)', 404);
            }

        } catch (axiosErr) {
            // אם זו השגיאה שאנחנו זרקנו הרגע, תעביר אותה הלאה
            if (axiosErr instanceof CostException) {
                throw axiosErr;
            }

            // אם השרת השני החזיר 404 באמת
            if (axiosErr.response && axiosErr.response.status === 404) {
                throw new CostException('User does not exist', 404);
            }

            // כל שגיאה אחרת בתקשורת
            throw new CostException('Failed to validate user', 500);
        }
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const isPast = (year < currentYear) || (year === currentYear && month < currentMonth);

        // Cache Lookup
        if (isPast) {
            const cached = await Report.findOne({ userid: userid, year, month }).lean();
            if (cached) {
                return res.json({
                    userid: cached.userid,
                    year: cached.year,
                    month: cached.month,
                    costs: cached.costs
                });
            }
        }

        // Report Calculation
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 1);

        const costsDocs = await Cost.find({
            userid: userid,
            createdAt: { $gte: start, $lt: end }
        }).lean();

        const FIXED_CATEGORIES = ['food', 'health', 'housing', 'sports', 'education'];
        const dynamicCategories = [...new Set(costsDocs.map(c => c.category))];

        const categories = [
            ...FIXED_CATEGORIES,
            ...dynamicCategories.filter(c => !FIXED_CATEGORIES.includes(c))
        ];

        const grouped = {};
        categories.forEach(cat => {
            grouped[cat] = [];
        });

        costsDocs.forEach(c => {
            if (!grouped[c.category]) grouped[c.category] = [];
            grouped[c.category].push({
                sum: c.sum,
                description: c.description,
                day: new Date(c.createdAt).getDate()
            });
        });

        const costsArr = categories.map(cat => ({
            [cat]: grouped[cat]
        }));

        const reportJson = {
            userid,
            year,
            month,
            costs: costsArr
        };

        // Cache Update
        if (isPast) {
            await Report.updateOne(
                { userid, year, month },
                { $set: { costs: costsArr } },
                { upsert: true }
            );
        }
        return res.json(reportJson);

    } catch (err) {
        if (err instanceof CostException) {
            return res.status(err.id).json({
                id: err.id,
                message: err.message
            });
        }
        return res.status(500).json({ id: 2, message: err.message });
    }
});
/*
 * GET /api/total
 * Aggregation Endpoint:
 * Calculates the sum of all costs for a specific user.
 * Typically used by the users-service to show total expenses.
 */
app.get('/api/total', async (req, res) => {
    try {
        const userid = Number(req.query.userid ?? req.query.id);

        if (Number.isNaN(userid)) {
            throw new CostException('invalid userid', 400);
        }

        const result = await Cost.aggregate([
            { $match: { userid } },
            { $group: { _id: null, total: { $sum: '$sum' } } }
        ]);

        const total = result.length ? result[0].total : 0;
        return res.json({ userid, total });

    } catch (err) {
        if (err instanceof CostException) {
            return res.status(err.id).json({
                id: err.id,
                message: err.message
            });
        }
        return res.status(500).json({ id: 2, message: err.message });
    }
});

/*
 * Server Startup
 */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Costs service running on port ${PORT}`);
});