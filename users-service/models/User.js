const mongoose = require('mongoose');
/*
 * User Model
 * Represents a user in the system.
 * Fields:
 * - id: application-level user identifier (not MongoDB _id)
 * - first_name, last_name: user personal details
 * - birthday: date of birth
 */
const userSchema = new mongoose.Schema({
    id: {
        type: Number,
        required: true,
        unique: true
    },
    first_name: {
        type: String,
        required: true
    },
    last_name: {
        type: String,
        required: true
    },
    birthday: {
        type: Date,
        required: true
    }
});

module.exports = mongoose.model('User', userSchema);