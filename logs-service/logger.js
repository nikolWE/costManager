const pino = require('pino');
const Log = require('../models/Log');

/* ---------- PINO LOGGER ---------- */
const logger = pino({
    level: 'info'
});

/* ---------- SAVE LOG TO MONGO ---------- */
async function saveLog({ method, endpoint, status, message }) {
    await Log.create({
        method,
        endpoint,
        status,
        message,
        timestamp: new Date()
    });
}

module.exports = {
    logger,
    saveLog
};
