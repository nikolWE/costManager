const mongoose = require('mongoose');
/*
 * Report Model
 * Implements the Computed Design Pattern.
 * Stores pre-computed monthly cost reports per user.
 */
const reportSchema = new mongoose.Schema(
    {
        userid: { type: Number, required: true },
        year: { type: Number, required: true },
        month: { type: Number, required: true },
        costs: { type: Array, required: true }
    },
    { timestamps: true }
);
/*
 * Unique index:
 * Ensures a single report per (userid, year, month).
 * This supports caching of computed monthly reports.
 */
reportSchema.index({ userid: 1, year: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('Report', reportSchema);