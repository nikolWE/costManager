const axios = require("axios");
const { USERS_URL, TEST_USER_ID } = require("./config");
const { waitForService, requestSafe, assertErrorShape } = require("./helpers");

describe("users-service", () => {
    beforeAll(async () => {
        await waitForService(USERS_URL);
    });

    test("GET /health -> 200", async () => {
        const res = await axios.get(USERS_URL + "/health");
        expect(res.status).toBe(200);
    });

    test("GET /api/users -> 200 and array + basic fields", async () => {
        const res = await axios.get(USERS_URL + "/api/users");
        expect(res.status).toBe(200);
        expect(Array.isArray(res.data)).toBe(true);

        if (res.data.length > 0) {
            expect(res.data[0]).toHaveProperty("id");
            expect(res.data[0]).toHaveProperty("first_name");
            expect(res.data[0]).toHaveProperty("last_name");
            expect(res.data[0]).toHaveProperty("birthday");
        }
    });

    test("GET /api/users/:id -> 200 and includes total", async () => {
        const res = await axios.get(USERS_URL + `/api/users/${TEST_USER_ID}`);
        expect(res.status).toBe(200);
        expect(res.data).toHaveProperty("id");
        expect(res.data).toHaveProperty("first_name");
        expect(res.data).toHaveProperty("last_name");
        expect(res.data).toHaveProperty("total");
    });

    test("POST /api/add missing fields -> 400 {id,message}", async () => {
        const out = await requestSafe(axios.post(USERS_URL + "/api/add", { id: 999999 }));
        expect(out.status).toBe(400);
        assertErrorShape(out.data);
    });

    test("GET /api/users/:id non-existing user -> error", async () => {
        const nonExistingId = 999999999;
        const out = await requestSafe(axios.get(USERS_URL + `/api/users/${nonExistingId}`));
        expect(out.status).toBeGreaterThanOrEqual(400);
        assertErrorShape(out.data);
    });

});
