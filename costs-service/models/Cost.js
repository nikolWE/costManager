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
/*
 * Hide MongoDB internal fields (_id, __v)
 * from JSON and object representations.
 */
costSchema.set('toJSON', {
    transform: function (doc, ret) {
        delete ret._id;
        delete ret.__v;
        return ret;
    }
});

costSchema.set('toObject', {
    transform: function (doc, ret) {
        delete ret._id;
        delete ret.__v;
        return ret;
    }
});

module.exports = mongoose.model('Cost', costSchema);
