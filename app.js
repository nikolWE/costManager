require('dotenv').config();

const User = require('./models/User');
const express = require('express');
const mongoose = require('mongoose');
const app = express();

app.use(express.json());

mongoose.connect(process.env.MONGODB_URI).then(()=> {
    console.log('MongoDB connected');
})
    .catch(err => {
        console.log('MongoDB connection fail',err);
    });

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
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


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

});


