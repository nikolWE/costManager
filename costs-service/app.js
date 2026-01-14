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
        /*
         * Parameter Extraction & Normalization:
         * Explicitly cast input fields to ensure type safety (Numbers).
         * String inputs like 'category' are trimmed and lowercased to
         * maintain consistency across the database (e.g., 'Food' -> 'food').
         */
        const userid = Number(req.body.userid);
        const sum = Number(req.body.sum);
        const rawCategory = req.body.category;
        const category = (rawCategory == null) ? '' : String(rawCategory).trim().toLowerCase();
        const description = req.body.description;
        /*
         * Default Timestamp Initialization:
         * Initialize 'createdAt' with the current server time.
         * This default value is used if the user does not provide
         * a specific date for the cost entry.
         */
        let createdAt = new Date();
        if (req.body.createdAt != null && req.body.createdAt !== '') {
            const parsed = parseStrictDate(req.body.createdAt);
            /*
             * Validation Error Handling:
             * If the date parsing fails (returns ok: false), we log the incident
             * as a Bad Request (400) and immediately halt execution by throwing
             * a CostException to be caught by the global error handler.
             */
            if (!parsed.ok) {
                await writeLog('POST', '/api/add', 400);
                throw new CostException('createdAt is invalid (YYYY-MM-DD)', 400);
            }
            createdAt = parsed.date;
        }
        /*
         * General Input Validation:
         * Verify that all mandatory fields (id, sum, category, description)
         * are present and possess valid types before proceeding.
         * This prevents runtime errors during database insertion.
         */
        if (Number.isNaN(userid) || Number.isNaN(sum) || !category || !description || description.trim() === '') {
            await writeLog('POST', '/api/add', 400);
            throw new CostException('Missing required fields', 400);
        }
        /*
         * User ID Constraint Check:
         * IDs must be positive integers. This check validates the logical
         * integrity of the user identifier before attempting any DB lookups.
         */
        if (userid < 1) {
            await writeLog('POST', '/api/add', 400);
            throw new CostException('userid must be a number >= 1', 400);
        }
        /*
         * Financial Logic Validation:
         * Costs cannot be zero or negative. This ensures that the ledger
         * only reflects actual expenses and maintains data consistency.
         */
        if (sum <= 0) {
            await writeLog('POST', '/api/add', 400);
            throw new CostException('sum must be greater than 0', 400);
        }
        /*
         * Service Configuration Check:
         * Before attempting to validate the user, we ensure that the
         * environment variable for the users-service URL is defined.
         * This prevents undefined behavior during the HTTP request.
         */
        if (!process.env.USERS_URL) {
            await writeLog('POST', '/api/add', 500);
            throw new CostException('USERS_URL is not configured', 500);
        }
        /*
        * Inter-Service Communication:
        * We perform a synchronous HTTP GET request to the external users-service.
        * This step verifies integrity by ensuring the user ID actually exists
        * in the system before we allow a cost to be associated with it.
        */
        try {
            await axios.get(process.env.USERS_URL + '/api/users/' + userid);
        } catch (axiosErr) {
            if (axiosErr.response && axiosErr.response.status === 404) {
                throw new CostException('User does not exist', 404);
            }

            throw new CostException('Failed to validate user', 500);
        }
        /*
         * Database Persistence:
         * Once all validations pass (input format, logic, and user existence),
         * we persist the new cost document into the MongoDB collection.
         * The 'create' method handles the insertion and returns the saved object.
         */
        const cost = await Cost.create({
            userid,
            sum,
            category,
            description,
            createdAt,
        });
        /*
         * Finalization & Logging:
         * Log the successful transaction to the centralized logs-service
         * and return a 201 Created status code with the JSON payload.
         */
        await writeLog('POST', '/api/add', 201);
        return res.status(201).json(cost);

    } catch (err) {
        /*
         * Global Exception Handling:
         * Differentiate between known application errors (CostException)
         * and unexpected runtime errors (Database crashes, etc).
         * Known errors return their specific status codes (400, 404).
         */
        if (err instanceof CostException) {
            return res.status(err.id).json({
                id: err.id,
                message: err.message
            });
        }
        /*
         * Critical Failure Handler:
         * Catch any unhandled exceptions, log the critical failure,
         * and return a generic 500 Internal Server Error to the client
         * to prevent leaking sensitive stack trace information.
         */
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
        /*
         * Input Parsing & Validation:
         * Extract query parameters (id, year, month).
         * We support both 'userid' and 'id' as keys for flexibility.
         * Type casting ensures we work with safe Number primitives.
         */
        const userid = Number(req.query.userid ?? req.query.id);
        const year = Number(req.query.year);
        const month = Number(req.query.month);

        if (Number.isNaN(userid) || Number.isNaN(year) || Number.isNaN(month)) {
            throw new CostException('id, year, month are required and must be numbers', 400);
        }
        if (month < 1 || month > 12) {
            throw new CostException('month must be 1-12', 400);
        }
        /*
         * External User Verification:
         * Before processing the report, verify user existence via users-service.
         * This prevents generating reports for non-existent entities.
         */
        try {
            const userRes = await axios.get(`${process.env.USERS_URL}/api/users/${userid}`);
            if (!userRes.data || (typeof userRes.data === 'object' && Object.keys(userRes.data).length === 0)) {
                throw new CostException('User not found (empty data)', 404);
            }
        } catch (axiosErr) {
            /*
             * Error Propagation Strategy:
             * 1. Re-throw our own validation errors.
             * 2. Map upstream 404s to a clear "User does not exist" message.
             * 3. Catch generic network/server failures.
             */
            if (axiosErr instanceof CostException) {
                throw axiosErr;
            }
            if (axiosErr.response && axiosErr.response.status === 404) {
                throw new CostException('User does not exist', 404);
            }
            throw new CostException('Failed to validate user', 500);
        }
        /*
         * Computed Pattern - Temporal Logic:
         * Determine if the requested report is for a past month.
         * Past months are immutable (costs won't change), allowing us
         * to use the cache effectively.
         */
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const isPast = (year < currentYear) || (year === currentYear && month < currentMonth);
        /*
         * Cache Lookup (Read Path):
         * If the report is historical, check the 'reports' collection first.
         * If found, return the pre-computed JSON immediately to save resources.
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
         * Dynamic Data Aggregation:
         * If not in cache (or if it's the current month), calculate from scratch.
         * Define the time window: 1st of the requested month to 1st of next month.
         */
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 1);

        const costsDocs = await Cost.find({
            userid: userid,
            createdAt: { $gte: start, $lt: end }
        }).lean();
        /*
         * Category Normalization:
         * Ensure specific 'FIXED' categories always appear in the report.
         * Merge them with any dynamic categories found in the retrieved documents.
         */
        const FIXED_CATEGORIES = ['food', 'health', 'housing', 'sports', 'education'];
        const dynamicCategories = [...new Set(costsDocs.map(c => c.category))];

        const categories = [
            ...FIXED_CATEGORIES,
            ...dynamicCategories.filter(c => !FIXED_CATEGORIES.includes(c))
        ];
        /*
         * Data Structuring:
         * Initialize buckets for each category and distribute the cost items.
         * This transforms the flat database rows into the hierarchical API format.
         */
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
        /*
         * Final Output Formatting:
         * Convert the grouped object into the required array structure.
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
         * Cache Update (Write Path):
         * If this was a past month (and wasn't cached yet), save the result.
         * The 'upsert' option ensures we either create or update the record.
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
        /*
         * Global Error Handler:
         * Return structured JSON errors for known exceptions (400/404).
         * Fallback to 500 for unexpected runtime errors.
         */
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
        /*
         * Input Parsing & Validation:
         * We accept either 'userid' or 'id' as query parameters for flexibility.
         * A strict numeric check is performed to prevent injection attacks or logical errors.
         */
        const userid = Number(req.query.userid ?? req.query.id);

        if (Number.isNaN(userid)) {
            throw new CostException('invalid userid', 400);
        }
        /*
         * MongoDB Aggregation Pipeline:
         * 1. $match: Filter documents to include only those belonging to the requested user.
         * 2. $group: Aggregate all matching documents into a single result, summing the 'sum' field.
         * This method is more performance-efficient than fetching all docs and looping in JS.
         */
        const result = await Cost.aggregate([
            { $match: { userid } },
            { $group: { _id: null, total: { $sum: '$sum' } } }
        ]);
        /*
         * Result Extraction:
         * The aggregation returns an array. If the user has no costs (or doesn't exist),
         * the array will be empty. We default to 0 to ensure a valid numeric response.
         */
        const total = result.length ? result[0].total : 0;
        return res.json({ userid, total });

    } catch (err) {
        /*
         * Exception Handling:
         * Standardized error response structure.
         * Custom CostExceptions return specific client codes (400),
         * while unexpected runtime errors return a generic 500.
         */
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
 * Server Initialization:
 * Configure the listening port (defaulting to 3001) and start the HTTP server.
 * The console log serves as a readiness probe for the developer or log aggregators.
 */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Costs service running on port ${PORT}`);
});