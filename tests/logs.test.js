const axios = require("axios");
const { LOGS_URL } = require("./config");
const { waitForService, requestSafe, assertErrorShape } = require("./helpers");
/*
 * Test Configuration:
 * Extend the default timeout to 60s to accommodate network delays
 * or slow service startups in the test environment.
 */
jest.setTimeout(60000);
/*
 * Logs Service Test Suite:
 * Validates the logging microservice's ability to store and retrieve logs.
 */
describe("logs-service", () => {
    /*
     * Initialization:
     * Ensure the logs-service is fully up and running (responsive on /health)
     * before attempting to run any functional tests.
     */
    beforeAll(async () => {
        await waitForService(LOGS_URL);
    });
    /*
     * Health Check:
     * Basic probe to confirm the service is reachable.
     */
    test("GET /health -> 200", async () => {
        const res = await axios.get(LOGS_URL + "/health");
        expect(res.status).toBe(200);
    });
    /*
     * Retrieve Logs:
     * Verify that fetching the log history returns a successful status
     * and a valid array structure (even if empty).
     */
    test("GET /api/logs -> 200 and array", async () => {
        const res = await axios.get(LOGS_URL + "/api/logs");
        expect(res.status).toBe(200);
        expect(Array.isArray(res.data)).toBe(true);
    });
    /*
     * Create Log Entry (Success):
     * Construct a valid log object with all necessary fields
     * (service, method, endpoint, status, message).
     */
    test("POST /api/logs -> 201 and returns created log", async () => {
        const payload = {
            service: "jest-tests",
            method: "POST",
            endpoint: "/api/logs",
            status: 201,
            message: "Hello from Jest tests"
        };
        /*
         * Execution & Status Check:
         * Send the POST request via requestSafe helper.
         * Expect HTTP 201 (Created) as the response code.
         */
        const out = await requestSafe(axios.post(LOGS_URL + "/api/logs", payload));
        expect(out.status).toBe(201);
        /*
         * Payload Validation:
         * Confirm that the server returns the saved object,
         * including the automatically generated 'timestamp'.
         */
        // Validate returned log object
        expect(out.data).toHaveProperty("method", "POST");
        expect(out.data).toHaveProperty("endpoint", "/api/logs");
        expect(out.data).toHaveProperty("status");
        expect(out.data).toHaveProperty("timestamp");
    });
    /*
     * Create Log Entry (Failure):
     * Intentionally omit the 'status' field to trigger a validation error.
     * This ensures the API protects against incomplete data.
     */
    test("POST /api/logs missing required fields -> 400 {id,message}", async () => {
        // Missing 'status' on purpose
        const payload = {
            service: "jest-tests",
            method: "POST",
            endpoint: "/api/logs",
            message: "Missing status"
        };
        /*
         * Error Handling Assertion:
         * Expect HTTP 400 (Bad Request).
         * Use helper to verify the error JSON structure matches the project standard.
         */
        const out = await requestSafe(axios.post(LOGS_URL + "/api/logs", payload));
        expect(out.status).toBe(400);
        assertErrorShape(out.data);
        expect(out.data.message).toMatch(/Missing required log fields/i);
    });
});