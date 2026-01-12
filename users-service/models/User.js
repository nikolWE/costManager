const mongoose = require('mongoose');
/*
 * User Model Definition:
 * Represents a user entity within the system.
 * Unlike the default MongoDB '_id', this schema uses a custom 'id' field
 * as the primary identifier for application logic.
 */
const userSchema = new mongoose.Schema({
    /*
     * Custom ID:
     * A unique numerical identifier for the user.
     * Required and must be unique across the collection to prevent duplicates.
     */
    id: {
        type: Number,
        required: true,
        unique: true
    },
    /*
     * Personal Information:
     * 'first_name' and 'last_name' store the user's display name.
     * Both fields are mandatory for creating a valid user profile.
     */
    first_name: {
        type: String,
        required: true
    },
    last_name: {
        type: String,
        required: true
    },
    /*
     * Date of Birth:
     * Stored as a standard Date object.
     * This allows for easy age calculation and formatting later on.
     */
    birthday: {
        type: Date,
        required: true
    }
});
/*
 * Model Export:
 * Compiles the schema into a Mongoose model named 'User'.
 * This model will be used to create, query, and manage user documents.
 */
module.exports = mongoose.model('User', userSchema);