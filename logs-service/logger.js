const pino = require('pino');
const Log = require('./models/Log');
/*
 * Logger Configuration:
 * Initialize the 'pino' logger instance.
 * We set the log level to 'info' to capture standard operational events.
 * This instance is used primarily for console output.
 */
const logger = pino({
    level: 'info'
});
/*
 * Database Persistence:
 * This function handles saving logs to the MongoDB database.
 * It is asynchronous to ensure it doesn't block the main event loop
 * while waiting for the database write operation.
 */
async function saveLog({ method, endpoint, status, message }) {
    /*
     * Document Creation:
     * We destructured the input object to extract specific fields.
     * A new document is created in the 'Log' collection with a
     * fresh timestamp generated at the moment of execution.
     */
    await Log.create({
        method,
        endpoint,
        status,
        message,
        timestamp: new Date()
    });
}
/*
 * Module Exports:
 * Expose both the 'logger' instance (for console) and
 * the 'saveLog' function (for DB) to be used by the application.
 */
module.exports = {
    logger,
    saveLog
};