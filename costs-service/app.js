require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');

const pino = require('pino');
const pinoHttp = require('pino-http');

const Cost = require('./models/Cost');
const Report = require('./models/Report');

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
        const userid = Number(req.body.userid);
        const sum = Number(req.body.sum);
        const category = req.body.category;
        const description = req.body.description;

        // אם המשתמש שלח תאריך – משתמשים בו, אחרת תאריך נוכחי של השרת
        const createdAt = req.body.createdAt
            ? new Date(req.body.createdAt)
            : new Date();

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



/* ---------- REPORT ---------- */
app.get('/api/report', async (req, res) => {
    try {
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

        // אם זה בעבר - מנסים להביא מה-cache
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

// קטגוריות קבועות (אם המרצה רוצה שתמיד יופיעו)
        const FIXED_CATEGORIES = ['food', 'health', 'housing', 'sports', 'education'];

// כל הקטגוריות שמופיעות בפועל בנתונים של החודש
        const dynamicCategories = [...new Set(costsDocs.map(c => c.category))];

// מאחדים: קודם הקבועות, ואז הדינמיות (בלי כפילויות)
        const categories = [
            ...FIXED_CATEGORIES,
            ...dynamicCategories.filter(c => !FIXED_CATEGORIES.includes(c))
        ];

// יוצרים אובייקט ריק לכל קטגוריה
        const grouped = {};
        categories.forEach(cat => {
            grouped[cat] = [];
        });

// ממלאים לפי הנתונים האמיתיים
        costsDocs.forEach(c => {
            if (!grouped[c.category]) grouped[c.category] = [];  // ביטחון
            grouped[c.category].push({
                sum: c.sum,
                description: c.description,
                day: new Date(c.createdAt).getDate()
            });
        });

// הפורמט שהמטלה דורשת
        const costsArr = categories.map(cat => ({
            [cat]: grouped[cat]
        }));


        const reportJson = {
            userid,
            year,
            month,
            costs: costsArr
        };

        // אם זה בעבר - שומרים cache
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





/* ---------- SERVER ---------- */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Costs service running on port ${PORT}`);
});
