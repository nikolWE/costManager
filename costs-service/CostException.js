/*
 * Project-specific exception class for the Costs Service.
 * This object is used to throw detailed information about malfunctions,
 * including a custom message and an error ID/Code.
 */
class CostException {
    constructor(message, id = 400) {
        this.message = message;
        this.id = id;
        this.name = "CostException";
    }
}

module.exports = CostException;