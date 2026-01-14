/*
 * Project-specific exception class for the Users Service.
 * This object is used to throw detailed information about malfunctions,
 * including a custom message and an error ID/Code.
 */
class UserException extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}
module.exports = UserException;