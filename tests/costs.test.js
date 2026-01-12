const axios = require("axios");
const { COSTS_URL, TEST_USER_ID, TEST_YEAR, TEST_MONTH } = require("./config");
const { waitForService, requestSafe, assertErrorShape } = require("./helpers");
/*
 * Costs Service Test Suite:
 * Validates the core functionality of the costs microservice,
 * including adding costs, generating reports, and calculating totals.
 */
describe("costs-service", () => {
    /*
     * Setup Hook:
     * Ensures the target service is reachable before running any tests.
     * This prevents cascading failures if the service is still starting up.
     */
    beforeAll(async () => {
        await waitForService(COSTS_URL);
    });
    /*
     * Health Check:
     * Verifies that the service responds to the standard probe.
     * Expects HTTP 200 OK.
     */
    test("GET /health -> 200", async () => {
        const res = await axios.get(COSTS_URL + "/health");
        expect(res.status).toBe(200);
    });
    /* Prepare a valid JSON payload with all required fields
     * (userid, description, category, sum).
     */
    test("POST /api/add -> 200/201 (valid cost)", async () => {
        const payload = {
            userid: TEST_USER_ID,
            description: "milk",
            category: "food",
            sum: 8
        };
        /*
         * API Execution:
         * Send the POST request using the 'requestSafe' wrapper
         * to handle potential network errors gracefully.
         */
        const out = await requestSafe(axios.post(COSTS_URL + "/api/add", payload));
        /*
         * Response Validation:
         * Check that the status code is success (200 or 201).
         * Verify that the returned object contains the saved properties.
         */
        expect([200, 201]).toContain(out.status);
        expect(out.data).toHaveProperty("userid");
        expect(out.data).toHaveProperty("category");
        expect(out.data).toHaveProperty("sum");
    });
    /*
     * Negative Test (Missing Data):
     * Deliberately omits required fields to test validation logic.
     * Expects HTTP 400 and a specific error JSON structure.
     */
    test("POST /api/add missing fields -> 400 {id,message}", async () => {
        const out = await requestSafe(axios.post(COSTS_URL + "/api/add", { userid: TEST_USER_ID }));
        expect(out.status).toBe(400);
        assertErrorShape(out.data);
    });
    /*
     * Negative Test (Report Params):
     * Calls the report endpoint without mandatory query parameters.
     * Confirms that the service rejects the request with HTTP 400.
     */
    test("GET /api/report missing params -> 400 {id,message}", async () => {
        const out = await requestSafe(axios.get(COSTS_URL + "/api/report"));
        expect(out.status).toBe(400);
        assertErrorShape(out.data);
    });
    /*
     * Report Generation:
     * Queries for a specific month/year using both 'id' and 'userid'
     * parameters to ensure robustness. Checks for the presence of
     * the 'costs' array in the response.
     */
    test("GET /api/report valid query -> 200 and has costs array", async () => {
        // robust: send both id and userid (some implementations use one of them)
        const url = COSTS_URL + `/api/report?id=${TEST_USER_ID}&userid=${TEST_USER_ID}&year=${TEST_YEAR}&month=${TEST_MONTH}`;
        const res = await axios.get(url);
        expect(res.status).toBe(200);
        expect(res.data).toHaveProperty("year");
        expect(res.data).toHaveProperty("month");
        expect(res.data).toHaveProperty("costs");
        expect(Array.isArray(res.data.costs)).toBe(true);
    });
    /*
     * Total Calculation:
     * Verifies the aggregation endpoint returns the total sum.
     * Checks that the response object contains the 'total' property.
     */
    test("GET /api/total -> 200 and has total", async () => {
        const res = await axios.get(COSTS_URL + `/api/total?userid=${TEST_USER_ID}`);
        expect(res.status).toBe(200);
        expect(res.data).toHaveProperty("total");
    });
    /*
     * Edge Case (Validation):
     * Sends a payload with an empty string for a required field (category).
     * Ensures strict validation prevents saving invalid data.
     */
    test("POST /api/add empty category -> 400 {id,message}", async () => {
        const payload = {
            userid: TEST_USER_ID,
            description: "test",
            category: "",
            sum: 10
        };
        /*
         * Execution & Verification:
         * Send request, expect failure (400), and validate error format.
         */
        const out = await requestSafe(axios.post(COSTS_URL + "/api/add", payload));
        expect(out.status).toBe(400);
        assertErrorShape(out.data);
    });
});