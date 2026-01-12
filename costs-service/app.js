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
        /*
         * Input Extraction:
         * Explicitly casting numbers to ensure type safety before processing.
         */
        const userid = Number(req.body.userid);
        const sum = Number(req.body.sum);
        const category = req.body.category;
        const description = req.body.description;
        /*
         * Date Handling:
         * Defaults to current time (Date.now).
         * If a custom date is provided, it goes through strict validation.
         */
        let createdAt = new Date();

        if (req.body.createdAt != null && req.body.createdAt !== '') {
            const parsed = parseStrictDate(req.body.createdAt);

            if (!parsed.ok) {
                await writeLog('POST', '/api/add', 400);
                return res.status(400).json({
                    id: 400,
                    message: 'createdAt is invalid (YYYY-MM-DD)',
                });
            }
            createdAt = parsed.date;
        }
        /*
         * Field Validation:
         * Checks for missing values or invalid number formats (NaN).
         * Ensures data integrity before reaching the database.
         */
        if (Number.isNaN(userid) || Number.isNaN(sum) || !category || !description || description.trim() === '')
        {
            await writeLog('POST', '/api/add', 400);
            return res.status(400).json({
                id: 400,
                message: 'Missing required fields',
            });
        }
        // userid must be positive
        if (userid < 1) {
            await writeLog('POST', '/api/add', 400);
            return res.status(400).json({
                id: 400,
                message: 'userid must be a number >= 1'
            });
        }
        /*
         * Validation - Logic:
         * Ensure the sum is a positive number.
         * We do not allow zero or negative expenses in this system.
         */
        if (sum <= 0) {
            await writeLog('POST', '/api/add', 400);
            return res.status(400).json({
                id: 400,
                message: 'sum must be greater than 0'
            });
        }
        /*
         * User Validation (Microservice Call):
         * Checks if the user exists by querying the external users-service.
         * Fails if the configuration URL is missing.
         */
        if (!process.env.USERS_URL) {
            await writeLog('POST', '/api/add', 500);
            return res.status(500).json({
                id: 2,
                message: 'USERS_URL is not configured'
            });
        }
        try {
            // We only need to know if user exists
            await axios.get(process.env.USERS_URL + '/api/users/' + userid);
        } catch (e) {
            /*
             * Axios Error Handling:
             * Distinguishes between a 404 (User not found) and other errors
             * (Network issues, service down) to return the correct status code.
             */
            if (e.response && e.response.status === 404) {
                await writeLog('POST', '/api/add', 400);
                return res.status(400).json({
                    id: 400,
                    message: 'User does not exist'
                });
            }
            // other errors (users-service down, etc.)
            await writeLog('POST', '/api/add', 500);
            return res.status(500).json({
                id: 2,
                message: 'Failed to validate user'
            });
        }
        /*
         * DB Insertion:
         * Creates the document in MongoDB using the Mongoose model.
         * Returns 201 Created on success.
         */
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
        /*
         * Global Error Handler:
         * Catches any unexpected errors in the try block and returns a 500 status.
         */
        await writeLog('POST', '/api/add', 500);
        return res.status(500).json({
            id: 1,
            message: err.message,
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
        /*
         * Query Parameter Validation:
         * Ensures all necessary parameters are present and are valid numbers.
         */
        if (Number.isNaN(userid) || Number.isNaN(year) || Number.isNaN(month)) {
            return res.status(400).json({
                id: 400,
                message: 'id, year, month are required and must be numbers'
            });
        }
        if (month < 1 || month > 12) {
            return res.status(400).json({ id: 400, message: 'month must be 1-12' });
        }
        /*
         * Past Month Detection:
         * Calculates if the requested report is strictly in the past.
         * This determines if we can use the cached report or must calculate fresh data.
         */
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;

        const isPast = (year < currentYear) || (year === currentYear && month < currentMonth);
        /*
         * Cache Lookup (Computed Pattern):
         * If it's a past month, try to find a pre-computed report.
         * If found, return it immediately to save processing power.
         */
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
        /*
         * Report Calculation:
         * Define the start and end dates for the database query.
         * 'start' is the 1st of the month, 'end' is the 1st of the NEXT month.
         */
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 1);

        const costsDocs = await Cost.find({
            userid: userid,
            createdAt: { $gte: start, $lt: end }
        }).lean();
        /*
         * Category Management:
         * Merges hardcoded fixed categories with any dynamic categories
         * found in the retrieved documents to ensure complete coverage.
         */
        const FIXED_CATEGORIES = ['food', 'health', 'housing', 'sports', 'education'];
        const dynamicCategories = [...new Set(costsDocs.map(c => c.category))];

        const categories = [
            ...FIXED_CATEGORIES,
            ...dynamicCategories.filter(c => !FIXED_CATEGORIES.includes(c))
        ];
        /*
         * Grouping Initialization:
         * Creates an empty array for every category to prepare for
         * sorting the cost items.
         */
        const grouped = {};
        categories.forEach(cat => {
            grouped[cat] = [];
        });
        /*
         * Data Transformation:
         * Iterates over raw cost documents and pushes simplified objects
         * (sum, description, day) into their respective category buckets.
         */
        costsDocs.forEach(c => {
            if (!grouped[c.category]) grouped[c.category] = [];  // Safety check
            grouped[c.category].push({
                sum: c.sum,
                description: c.description,
                day: new Date(c.createdAt).getDate()
            });
        });
        /*
         * Final Formatting:
         * Maps the grouped object into the array structure required by the API spec.
         */
        const costsArr = categories.map(cat => ({
            [cat]: grouped[cat]
        }));

        const reportJson = {
            userid,
            year,
            month,
            costs: costsArr
        };
        /*
         * Cache Update (Computed Pattern):
         * If this was a past month (and wasn't in cache initially),
         * save the calculated report to the DB for future requests.
         */
        if (isPast) {
            await Report.updateOne(
                { userid, year, month },
                { $set: { costs: costsArr } },
                { upsert: true }
            );
        }
        return res.json(reportJson);
    } catch (err) {
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
            return res.status(400).json({ id: 400, message: 'Invalid userid' });
        }
        /*
         * MongoDB Aggregation Pipeline:
         * 1. Match documents by userid.
         * 2. Group all matching docs and sum their 'sum' field.
         */
        const result = await Cost.aggregate([
            { $match: { userid } },
            { $group: { _id: null, total: { $sum: '$sum' } } }
        ]);

        const total = result.length ? result[0].total : 0;

        // Return the total along with userid for context.
        return res.json({ userid, total });
    } catch (err) {
        return res.status(500).json({ id: 2, message: err.message });
    }
});
/*
 * Server Startup:
 * Listens on the configured PORT (default 3001).
 * Logs a message when the server is ready.
 */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Costs service running on port ${PORT}`);
});