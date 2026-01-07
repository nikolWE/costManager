require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// health (לא חובה אבל נוח)
app.get('/health', (req, res) => {
    res.json({ status: 'admin service ok' });
});

// admin-service/app.js
app.get('/api/about', (req, res) => {
    try {
        res.json([
            { first_name: 'Nikol', last_name: 'Weintraub' },
            { first_name: 'Adam', last_name: 'Kovalenko' },
            { first_name: 'Neomi', last_name: 'Cohen Tsemach' }
        ]);
    } catch (err) {
        res.status(500).json({ id: 1, message: err.message });
    }
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
    console.log(`Admin service running on port ${PORT}`);
});