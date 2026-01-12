/*
 * Configuration Module:
 * Exports global constants and service URLs used throughout the application.
 * These URLs point to the live services deployed on Render.
 */
module.exports = {
    /*
     * Service Endpoints:
     * Specific URLs for accessing the Costs, Users, Admin, and Logs microservices.
     * Used by the gateway or tests to communicate with the backend.
     */
    COSTS_URL : "https://costs-service-aw7k.onrender.com",
    USERS_URL : "https://users-service-l21v.onrender.com",
    ADMIN_URL : "https://admin-service-c1oo.onrender.com",
    LOGS_URL  : "https://logs-service-7rzi.onrender.com",
    /*
     * Test Constants:
     * Predefined values (User ID, Year, Month) used in test suites
     * to ensure consistent data validation across different test runs.
     */
    TEST_USER_ID: 123123,
    TEST_YEAR: 2026,
    TEST_MONTH: 1
};

