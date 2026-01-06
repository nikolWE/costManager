require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Cost = require("../models/Cost"); // או './models/User' לפי המבנה
const axios = require('axios');

const app = express();
app.use(express.json());

async function writeLog(method, endpoint, status) {
    try {
        await axios.post(process.env.LOGS_URL + '/api/logs', {
            service: 'users',
            method,
            endpoint,
            status,
            timestamp: new Date()
        });
    } catch (e) {
        // לא מפילים את השירות אם logs לא זמין
    }
}


mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('MongoDB connected');
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
    });

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.post('/api/add', async (req, res) => {
    try {
        const { id, first_name, last_name, birthday } = req.body;

        if (!id || !first_name || !last_name || !birthday) {
            await writeLog('POST', '/api/add', 400);
            return res.status(400).json({ id: 400, message: 'Missing required fields' });
        }

        const user = await User.create({ id, first_name, last_name, birthday });

        await writeLog('POST', '/api/add', 200);
        res.json(user);
    } catch (err) {
        await writeLog('POST', '/api/add', 500);
        res.status(500).json({ id: 1, message: err.message });
    }
});


app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find();
        await writeLog('GET', '/api/users', 200);
        res.json(users);
    } catch (err) {
        await writeLog('GET', '/api/users', 500);
        res.status(500).json({ id: 2, message: err.message });
    }
});


app.get('/api/users/:id', async (req, res) => {
    try {
        const userId = Number(req.params.id);

        // בדיקה בסיסית
        if (isNaN(userId)) {
            return res.status(400).json({
                id: 400,
                message: 'Invalid user id'
            });
        }

        // חיפוש משתמש
        const user = await User.findOne({ id: userId });
        if (!user) {
            await writeLog('GET', `/api/users/${userId}`, 404);
            return res.status(404).json({
                id: 1,
                message: 'User not found'
            });
        }

        // בקשת report מ-costs-service
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        const reportResponse = await axios.get(
            process.env.COSTS_URL + '/api/report',
            {
                params: {
                    userid: userId,
                    month,
                    year
                }
            }
        );

        // חישוב total מתוך הדו"ח
        let total = 0;
        const costsByCategory = reportResponse.data.costs;

        costsByCategory.forEach(categoryObj => {
            const categoryName = Object.keys(categoryObj)[0];
            const items = categoryObj[categoryName];

            items.forEach(item => {
                total += item.sum;
            });
        });

        await writeLog('GET', `/api/users/${userId}`, 200);

        // תשובה לפי דרישות המטלה
        res.json({
            id: user.id,
            first_name: user.first_name,
            last_name: user.last_name,
            total
        });

    } catch (err) {
        await writeLog('GET', '/api/users/:id', 500);
        res.status(500).json({
            id: 2,
            message: err.message
        });
    }
});


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Users service running on port ${PORT}`);
});
