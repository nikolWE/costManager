const mongoose = require('mongoose');
/*
 * Cost Model
 * Represents a single cost item.
 * Each document describes one expense made by a user.
 */
const costSchema = new mongoose.Schema({
    /* * String Fields:
     * 'description' explains what the expense was for.
     * 'category' groups expenses (e.g., food, health, ect.).
     */
    description: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true
    },
    /*
     * User Identification:
     * 'userid' is required to link the cost to a specific user.
     * This allows filtering costs per user later on.
     */
    userid: {
        type: Number,
        required: true
    },
    sum: {
        type: Number, /* Javascript numbers are always double (64-bit floating point). */
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
/*
 * Data Sanitization (JSON):
 * Configure the toJSON option to modify the output.
 * We remove internal database fields (_id, __v) for cleaner API responses.
 */
costSchema.set('toJSON', {
    transform: function (doc, ret) {
        delete ret._id;
        delete ret.__v;
        return ret;
    }
});
/*
 * Data Sanitization (Object):
 * Apply the same transformation when converting to a plain Object.
 * This ensures consistency across different data handling methods.
 */
costSchema.set('toObject', {
    transform: function (doc, ret) {
        delete ret._id;
        delete ret.__v;
        return ret;
    }
});
/*
 * Model Export:
 * Create and export the 'Cost' model based on the schema.
 * This interface will be used to query and save data to MongoDB.
 */
module.exports = mongoose.model('Cost', costSchema);