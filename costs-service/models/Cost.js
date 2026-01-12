const mongoose = require('mongoose');

/*
 * Cost Model
 * Represents a single cost item.
 * Each document describes one expense made by a user.
 */
const costSchema = new mongoose.Schema({
    description: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true
    },
    userid: {
        type: Number,
        required: true
    },
    sum: {
        type: Number, //although it says in the instructions that we need to use Double, Javascript numbers are always double (64-bit floating point).
        required: true
    },
    /*
     * createdAt:
     * Stores the date and time when the cost item was created.
     * Used for grouping costs by month and year in reports.
     */
    createdAt: {
        type: Date,
        default: Date.now
    }

});

module.exports = mongoose.model('Cost', costSchema);
