const mongoose = require('mongoose');

const costSchema = new mongoose.Schema({
    userid: {
        type: Number,
        required: true
    },
    sum: {
        type: Number,
        required: true
    },
    category: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    day: {
        type: Number,
        required: true
    },
    month: {
        type: Number,
        required: true
    },
    year: {
        type: Number,
        required: true
    }
});

module.exports = mongoose.model('Cost', costSchema);
