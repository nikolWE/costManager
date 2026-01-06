const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
    method: String,        // GET / POST
    endpoint: String,      // /api/add , /api/report וכו'
    status: Number,        // 200 / 400 / 500
    timestamp: Date,       // מתי זה קרה
    message: String        // תיאור חופשי (אופציונלי)
});

module.exports = mongoose.model('Log', logSchema);
