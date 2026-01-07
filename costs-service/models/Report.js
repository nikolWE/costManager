const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
    {
        userid: { type: Number, required: true },
        year: { type: Number, required: true },
        month: { type: Number, required: true },
        costs: { type: Array, required: true }
    },
    { timestamps: true }
);

// אותו משתמש + אותו חודש + אותה שנה => דו"ח אחד
reportSchema.index({ userid: 1, year: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('Report', reportSchema);