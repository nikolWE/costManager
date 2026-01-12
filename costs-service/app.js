require('dotenv').config();

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
 * Pino logger.
 * Log level: info.
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
function parseStrictDate(input) {
    if (input == null || input === '') return { ok: false, reason: 'empty' };
    if (typeof input !== 'string') return { ok: false, reason: 'not_string' };

    const m = input.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
    if (!m) return { ok: false, reason: 'bad_format' };

    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);

    if (month < 1 || month > 12) return { ok: false, reason: 'month_range' };
    if (day < 1 || day > 31) return { ok: false, reason: 'day_range' };

    const d = new Date(year, month - 1, day);

    const same =
        d.getFullYear() === year &&
        (d.getMonth() + 1) === month &&
        d.getDate() === day;

    if (!same) return { ok: false, reason: 'nonexistent_date' };

    return { ok: true, date: d };
}
/*
 * Write log to logs-service.
 * Never fails the request if logs-service is down.
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
         *Won't crash the service if logs-service is unavailable
         */
    }
}

/*
 * MongoDB connection.
 * If the connection fails, the service will not start.
 */
mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB connected (costs-service)'))
    .catch(err => console.error('MongoDB connection error:', err));

/*
 * Health check.
 * Returns 200 OK if the service is up and running.
 */
app.get('/health', (req, res) => {
    res.json({ status: 'costs service ok' });
});

/*
 * addCost:
 * Creates a new cost item.
 * Required fields: userid, sum, category, description.
 * Optional field: createdAt which defaults to the current date or if you decide you can pick your own date
 * using the format YYYY/MM/DD.
 * Note: the date format is YYYY-MM-DD, but the service expects YYYY/MM/DD.
 * This is because the service is running in a container and the date format is different from the host machine,
 * so the service needs to convert the date from YYYY-MM-DD to YYYY/MM/DD.
 * If you want to use your own date format, you can use the createdAt field, but remember that the service expects
 */
app.post('/api/add', async (req, res) => {
    try {
        const userid = Number(req.body.userid);
        const sum = Number(req.body.sum);
        const category = req.body.category;
        const description = req.body.description;

        /*
         * If the user sends a date we'll use it, otherwise we'll use the current date.
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


        if (
            Number.isNaN(userid) ||
            Number.isNaN(sum) ||
            !category ||
            !description
        ) {
            await writeLog('POST', '/api/add', 400);
            return res.status(400).json({
                id: 400,
                message: 'Missing required fields',
            });
        }

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
        await writeLog('POST', '/api/add', 500);
        return res.status(500).json({
            id: 1,
            message: err.message,
        });
    }
});



/*
 * GET /api/report
 * Computed Design Pattern:
 * Cached monthly reports are reused for past months.
 */
app.get('/api/report', async (req, res) => {
    try {
        console.log("REPORT ROUTE HIT ✅", {
            useridRaw: req.query.userid,
            idRaw: req.query.id,
            yearRaw: req.query.year,
            monthRaw: req.query.month,
            types: {
                userid: typeof req.query.userid,
                id: typeof req.query.id,
                year: typeof req.query.year,
                month: typeof req.query.month
            }
        });
        const userid = Number(req.query.userid ?? req.query.id);
        const year = Number(req.query.year);
        const month = Number(req.query.month);

        if (Number.isNaN(userid) || Number.isNaN(year) || Number.isNaN(month)) {
            return res.status(400).json({
                id: 400,
                message: 'id, year, month are required and must be numbers'
            });
        }
        if (month < 1 || month > 12) {
            return res.status(400).json({ id: 400, message: 'month must be 1-12' });
        }

        // האם החודש המבוקש הוא בעבר?
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;

        const isPast = (year < currentYear) || (year === currentYear && month < currentMonth);

        /*
        * if it's a past month, checks cache first.
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

        // מחשבים דו"ח מה-Costs
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 1);

        const costsDocs = await Cost.find({
            userid: userid,
            createdAt: { $gte: start, $lt: end }
        }).lean();

    /*
    * Fixed categories according to the design document.
    */
        const FIXED_CATEGORIES = ['food', 'health', 'housing', 'sports', 'education'];
        /*
        * all the unique categories in the costsDocs.
         */
        const dynamicCategories = [...new Set(costsDocs.map(c => c.category))];

        /*
        * all the unique categories in the FIXED_CATEGORIES and the dynamicCategories combined.
         */
        const categories = [
            ...FIXED_CATEGORIES,
            ...dynamicCategories.filter(c => !FIXED_CATEGORIES.includes(c))
        ];

        /*
        * creating an empty object for each category.
        */
        const grouped = {};
        categories.forEach(cat => {
            grouped[cat] = [];
        });

        /*
        * filling each category with the corresponding costs.
         */
        costsDocs.forEach(c => {
            if (!grouped[c.category]) grouped[c.category] = [];  // ביטחון
            grouped[c.category].push({
                sum: c.sum,
                description: c.description,
                day: new Date(c.createdAt).getDate()
            });
        });

        /*
         * using the prompet that the design document require.
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
        * if it's a past month, saves the report to the database.'
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
 * Returns total costs for a given user.
 * Used by users-service.
 */
app.get('/api/total', async (req, res) => {
    try {
        const userid = Number(req.query.userid ?? req.query.id);

        if (Number.isNaN(userid)) {
            return res.status(400).json({ id: 400, message: 'Invalid userid' });
        }

        const result = await Cost.aggregate([
            { $match: { userid } },
            { $group: { _id: null, total: { $sum: '$sum' } } }
        ]);

        const total = result.length ? result[0].total : 0;

        // מחזירים userid (כמו שאתה מצפה), ועדיין משאירים total ברור
        return res.json({ userid, total });
    } catch (err) {
        return res.status(500).json({ id: 2, message: err.message });
    }
});





/*
 * Server listen.
 */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Costs service running on port ${PORT}`);
});
