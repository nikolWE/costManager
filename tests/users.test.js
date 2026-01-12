const axios = require("axios");
const { USERS_URL, TEST_USER_ID } = require("./config");
const { waitForService, requestSafe, assertErrorShape } = require("./helpers");
/*
 * Users Service Test Suite:
 * Focuses on user management endpoints.
 * Includes integration checks (like fetching the 'total' field).
 */
describe("users-service", () => {
    /*
     * Service Availability:
     * Wait for the users-service to become ready before running tests.
     * Prevents connection refused errors during startup.
     */
    beforeAll(async () => {
        await waitForService(USERS_URL);
    });
    /*
     * Health Check:
     * Standard probe to ensure the service is running.
     * Expects HTTP 200 OK.
     */
    test("GET /health -> 200", async () => {
        const res = await axios.get(USERS_URL + "/health");
        expect(res.status).toBe(200);
    });
    /*
     * Retrieve All Users:
     * Fetches the list of users and verifies the data structure.
     * Checks that the response is an array.
     */
    test("GET /api/users -> 200 and array + basic fields", async () => {
        const res = await axios.get(USERS_URL + "/api/users");
        expect(res.status).toBe(200);
        expect(Array.isArray(res.data)).toBe(true);
        /*
         * Structure Validation:
         * If users exist, verify they possess the required keys:
         * id, first_name, last_name, and birthday.
         */
        if (res.data.length > 0) {
            expect(res.data[0]).toHaveProperty("id");
            expect(res.data[0]).toHaveProperty("first_name");
            expect(res.data[0]).toHaveProperty("last_name");
            expect(res.data[0]).toHaveProperty("birthday");
        }
    });
    /*
     * Single User Details:
     * Fetches a specific user by ID.
     * Verifies that the 'total' field is present (which implies
     * successful communication with the costs-service).
     */
    test("GET /api/users/:id -> 200 and includes total", async () => {
        const res = await axios.get(USERS_URL + `/api/users/${TEST_USER_ID}`);
        expect(res.status).toBe(200);
        expect(res.data).toHaveProperty("id");
        expect(res.data).toHaveProperty("first_name");
        expect(res.data).toHaveProperty("last_name");
        expect(res.data).toHaveProperty("total");
    });
    /*
     * Input Validation (Add User):
     * Sends an incomplete payload to force a validation error.
     * Expects a 400 Bad Request status and standard error shape.
     */
    test("POST /api/add missing fields -> 400 {id,message}", async () => {
        const out = await requestSafe(axios.post(USERS_URL + "/api/add", { id: 999999 }));
        expect(out.status).toBe(400);
        assertErrorShape(out.data);
    });
    /*
     * Error Handling (Not Found):
     * Requests a user ID that definitely does not exist.
     * Ensures the service returns an appropriate error code (4xx).
     */
    test("GET /api/users/:id non-existing user -> error", async () => {
        const nonExistingId = 999999999;
        const out = await requestSafe(axios.get(USERS_URL + `/api/users/${nonExistingId}`));
        expect(out.status).toBeGreaterThanOrEqual(400);
        assertErrorShape(out.data);
    });
});