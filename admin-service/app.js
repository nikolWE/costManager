require('dotenv').config();

const express = require('express');
const axios = require('axios');
/*
 * admin-service
 * Responsibilities:
 * - Provide developers team information.
 * - Minimal service used mostly for demonstration.
 */
const app = express();
app.use(express.json());
/*
 * Log Writer Helper:
 * Sends logs to the central logs-service.
 * This ensures consistency across the entire microservices architecture.
 */
async function writeLog(method, endpoint, status) {
    try {
        if (!process.env.LOGS_URL) return;
        /*
         * Async Request:
         * We send the log asynchronously to avoid blocking the response.
         * The timestamp is generated at the moment of logging.
         */
        await axios.post(process.env.LOGS_URL + '/api/logs', {
            service: 'admin',
            method,
            endpoint,
            status,
            timestamp: new Date()
        });
    } catch (e) {
        /*
         * Fault Tolerance:
         * If the logging service is down, we silently ignore the error
         * so the admin service keeps functioning for the user.
         */
    }
}
/*
 * Health Check:
 * Returns 200 OK if the service is up.
 * Used by external monitoring tools.
 */
app.get('/health', (req, res) => {
    res.json({ status: 'admin service ok' });
});
/*
 * GET /api/about
 * Logic:
 * Returns a hardcoded list of the developers.
 * No input parameters are required for this endpoint.
 */
app.get('/api/about', async (req, res) => {
    try {
        const team = [
            { first_name: 'Nikol', last_name: 'Weintraub' },
            { first_name: 'Adam', last_name: 'Kovalenko' },
            { first_name: 'Neomi', last_name: 'Cohen Tsemach' }
        ];
        /*
         * Successful Response:
         * Log the access to the logs-service and return the JSON data.
         */
        await writeLog('GET', '/api/about', 200);
        res.json(team);

    } catch (err) {
        /*
         * Error Handling:
         * Even though hardcoded data rarely fails, we keep a try-catch
         * block for good practice and unforeseen server errors.
         */
        await writeLog('GET', '/api/about', 500);
        res.status(500).json({ id: 1, message: err.message });
    }
});
/*
 * Server Startup:
 * Configures the port and starts listening for incoming requests.
 */
const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
    console.log(`Admin service running on port ${PORT}`);
});