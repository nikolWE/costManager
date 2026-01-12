const axios = require("axios");
const { ADMIN_URL } = require("./config");
const { waitForService } = require("./helpers");
/*
 * Test Configuration:
 * Increase the default Jest timeout to 60 seconds.
 * This prevents tests from failing due to slow service startup or network latency.
 */
jest.setTimeout(60000);
/*
 * Admin Service Test Suite:
 * Defines the scope of tests for the administrative microservice.
 */
describe("admin-service", () => {
    /*
     * Pre-test Hook:
     * Before running any tests, we wait for the target service to be reachable.
     * This ensures we don't get false negatives if the container is still booting.
     */
    beforeAll(async () => {
        await waitForService(ADMIN_URL);
    });
    /*
     * Health Check Test:
     * Verifies that the /health endpoint is responsive.
     * Expects a standard HTTP 200 OK status code.
     */
    test("GET /health -> 200", async () => {
        const res = await axios.get(ADMIN_URL + "/health");
        expect(res.status).toBe(200);
    });
    /*
     * About Info Test:
     * Checks the /api/about endpoint for correct behavior.
     * Validates both the HTTP status (200) and that the response body is a valid object.
     */
    test("GET /api/about -> 200 and JSON", async () => {
        const res = await axios.get(ADMIN_URL + "/api/about");
        expect(res.status).toBe(200);
        expect(typeof res.data).toBe("object");
    });
});