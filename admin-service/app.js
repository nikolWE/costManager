require('dotenv').config();
const express = require('express');
const axios = require('axios');
/*
 * admin-service
 * Responsibilities:
 * - Provide developers team information.
 */

const app = express();
app.use(express.json());

/*
 * Health check.
 * Returns 200 OK if the service is up and running.
 */
app.get('/health', (req, res) => {
    res.json({ status: 'admin service ok' });
});

/*
 * GET /api/about
 * Returns developers team names.
 * Data is hardcoded to keep database empty.
 */
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

/*
 * Server listen.
 */
const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
    console.log(`Admin service running on port ${PORT}`);
});