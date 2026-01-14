require('dotenv').config();
/*
 * External Dependencies
 */
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');

/*
 * Internal Dependencies
 */
const User = require('./models/User');
const UserException = require('./userException'); // <--- הוספנו את זה

const app = express();
app.use(express.json());

/*
 * writeLog Helper
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
        // Silent fail for logs
    }
};

/*
 * Database Connection
 */
mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB connected (users-service)'))
    .catch((err) => console.error('MongoDB connection error (users-service):', err));

/*
 * GET /health
 */
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

/*
 * POST /api/add
 */
app.post('/api/add', async (req, res) => {
    try {
        const { id, first_name, last_name, birthday } = req.body || {};

        // Validation - ID
        const idNum = Number(id);
        if (Number.isNaN(idNum) || idNum < 1) {
            await writeLog('POST', '/api/add', 400);
            throw new UserException('id must be a number bigger or equal to 0', 400);
        }

        // Validation - Missing Fields
        if (!id || !first_name || !last_name || !birthday) {
            await writeLog('POST', '/api/add', 400);
            throw new UserException('Missing required fields', 400);
        }

        // Validation - Date
        const birthDate = new Date(birthday + 'T12:00:00'); // Fix timezone issue

        if (Number.isNaN(birthDate.getTime())) {
            await writeLog('POST', '/api/add', 400);
            throw new UserException('Invalid birthday format. Use YYYY-MM-DD', 400);
        }

        // Validation - Future Date
        if (birthDate > new Date()) {
            await writeLog('POST', '/api/add', 400);
            throw new UserException('Birthday cannot be in the future', 400);
        }

        // DB Insertion
        const user = await User.create({
            id: idNum,
            first_name,
            last_name,
            birthday: birthDate
        });

        await writeLog('POST', '/api/add', 201);
        return res.status(201).json(user);

    } catch (err) {
        // טיפול בשגיאות שלנו (UserException)
        if (err instanceof UserException) {
            return res.status(err.status).json({
                id: err.status,
                message: err.message
            });
        }

        // טיפול בשגיאת כפילות של מונגו (Duplicate Key)
        if (err && err.code === 11000) {
            await writeLog('POST', '/api/add', 409);
            return res.status(409).json({
                id: 409,
                message: 'User already exists'
            });
        }

        // שגיאה כללית
        await writeLog('POST', '/api/add', 500);
        return res.status(500).json({
            id: 1, // לפי הקונבנציה של שגיאת שרת כללית
            message: err.message
        });
    }
});

/*
 * GET /api/users
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
 */
app.get('/api/users/:id', async (req, res) => {
    try {
        const userId = Number(req.params.id);

        if (Number.isNaN(userId)) {
            await writeLog('GET', '/api/users/:id', 400);
            throw new UserException('Invalid user id', 400);
        }

        const user = await User.findOne({ id: userId }).lean();
        if (!user) {
            await writeLog('GET', '/api/users/:id', 404);
            // כאן אנחנו זורקים שגיאה שתגיע ל-catch למטה
            throw new UserException('User not found', 404);
        }

        if (!process.env.COSTS_URL) {
            await writeLog('GET', '/api/users/:id', 500);
            // זו שגיאת שרת פנימית, אז זורקים 500
            throw new UserException('COSTS_URL is not configured', 500);
        }

        // קריאה ל-costs service
        // נשתמש ב-try/catch פנימי קטן כדי שאם השרת השני נפל, לא נחזיר 500 אלא נטפל בזה
        let total = 0;
        try {
            const totalResponse = await axios.get(process.env.COSTS_URL + '/api/total', {
                params: { userid: userId }
            });
            total = Number(totalResponse.data && totalResponse.data.total) || 0;
        } catch (axiosErr) {
            // אם ה-costs service נפל או החזיר שגיאה, אנחנו יכולים להחליט:
            // אפשרות א': להכשיל את כל הבקשה (throw)
            // אפשרות ב': להחזיר total = 0 ולהמשיך (יותר עמיד)
            // כרגע נשאיר total = 0 ונרשום לוג אזהרה
            console.error('Failed to fetch costs:', axiosErr.message);
        }

        await writeLog('GET', '/api/users/:id', 200);

        return res.json({
            id: user.id,
            first_name: user.first_name,
            last_name: user.last_name,
            total: total
        });

    } catch (err) {
        if (err instanceof UserException) {
            // מחקנו את הבדיקה המיוחדת ל-404. עכשיו כולם מקבלים JSON.
            return res.status(err.status).json({
                id: err.status,
                message: err.message
            });
        }

        await writeLog('GET', '/api/users/:id', 500);
        return res.status(500).json({ id: 2, message: err.message });
    }
});

/*
 * Server Startup
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('Users service running on port ' + PORT);
});