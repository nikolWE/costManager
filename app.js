require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');

const User = require('./models/User');
const Cost = require('./models/Cost');

const app = express();
app.use(express.json());


app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find(); // מביא את כל המשתמשים
        res.json(users);
    } catch (err) {
        res.status(500).json({
            id: 2,
            message: err.message
        });
    }
});

app.get('/api/users/:id', async (req, res) => {
    try {
        const userId = Number(req.params.id);

        const user = await User.findOne({ id: userId });
        if (!user) {
            return res.status(404).json({
                id: 1,
                message: 'User not found'
            });
        }

        const costs = await Cost.find({ userid: userId });
        const total = costs.reduce((sum, cost) => sum + cost.sum, 0);

        res.json({
            id: user.id,
            first_name: user.first_name,
            last_name: user.last_name,
            total: total
        });

    } catch (err) {
        res.status(500).json({
            id: 2,
            message: err.message
        });
    }
});

app.post('/api/add', async (req, res) => {
    try {
        const { id, first_name, last_name, birthday } = req.body;

        // בדיקה בסיסית
        if (!id || !first_name || !last_name || !birthday) {
            return res.status(400).json({
                id: 400,
                message: 'Missing required fields'
            });
        }

        const user = await User.create({
            id,
            first_name,
            last_name,
            birthday
        });

        res.json(user);

    } catch (err) {
        res.status(500).json({
            id: 1,
            message: err.message
        });
    }
});


app.post('/api/add', async (req, res) => {
    try {
        const { description, category, userid, sum, date } = req.body;

        // בדיקות בסיסיות
        if (!description || !category || !userid || !sum) {
            return res.status(400).json({
                id: 400,
                message: 'Missing required fields'
            });
        }

        const cost = await Cost.create({
            description,
            category,
            userid,
            sum,
            date: date ? new Date(date) : undefined
        });

        res.json(cost);

    } catch (err) {
        res.status(500).json({
            id: 1,
            message: err.message
        });
    }
});

app.get('/api/report', async (req, res) => {
    try {
        const costs = await Cost.find();
        const users = await User.find();

        const report = {};

        for (const cost of costs) {
            const month = cost.date.getFullYear() + '-' + String(cost.date.getMonth() + 1).padStart(2, '0');

            if (!report[month]) {
                report[month] = {};
            }

            if (!report[month][cost.userid]) {
                const user = users.find(u => u.id === cost.userid);

                report[month][cost.userid] = {
                    id: cost.userid,
                    first_name: user?.first_name || 'Unknown',
                    last_name: user?.last_name || 'Unknown',
                    total: 0
                };
            }

            report[month][cost.userid].total += cost.sum;
        }

        // להפוך לאובייקט נקי (array במקום object פנימי)
        const finalReport = {};
        for (const month in report) {
            finalReport[month] = Object.values(report[month]);
        }

        res.json(finalReport);
    } catch (err) {
        res.status(500).json({
            id: 1,
            message: err.message
        });
    }
});



mongoose.connect(process.env.MONGODB_URI).then(()=> {
    console.log('MongoDB connected');
})
    .catch(err => {
        console.log('MongoDB connection fail',err);
    });

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

});


