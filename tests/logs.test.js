const axios = require("axios");
const { LOGS_URL } = require("./config");
const { waitForService, requestSafe, assertErrorShape } = require("./helpers");

jest.setTimeout(60000);

describe("logs-service", () => {
    beforeAll(async () => {
        await waitForService(LOGS_URL);
    });

    test("GET /health -> 200", async () => {
        const res = await axios.get(LOGS_URL + "/health");
        expect(res.status).toBe(200);
    });

    test("GET /api/logs -> 200 and array", async () => {
        const res = await axios.get(LOGS_URL + "/api/logs");
        expect(res.status).toBe(200);
        expect(Array.isArray(res.data)).toBe(true);
    });

    test("POST /api/logs -> 201 and returns created log", async () => {
        const payload = {
            service: "jest-tests",
            method: "POST",
            endpoint: "/api/logs",
            status: 201,
            message: "Hello from Jest tests"
        };

        const out = await requestSafe(axios.post(LOGS_URL + "/api/logs", payload));
        expect(out.status).toBe(201);

        // Validate returned log object
        expect(out.data).toHaveProperty("method", "POST");
        expect(out.data).toHaveProperty("endpoint", "/api/logs");
        expect(out.data).toHaveProperty("status");
        expect(out.data).toHaveProperty("timestamp");
    });

    test("POST /api/logs missing required fields -> 400 {id,message}", async () => {
        // Missing 'status' on purpose
        const payload = {
            service: "jest-tests",
            method: "POST",
            endpoint: "/api/logs",
            message: "Missing status"
        };

        const out = await requestSafe(axios.post(LOGS_URL + "/api/logs", payload));
        expect(out.status).toBe(400);
        assertErrorShape(out.data);
        expect(out.data.message).toMatch(/Missing required log fields/i);
    });
});
