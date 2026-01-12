const axios = require("axios");
const { COSTS_URL, TEST_USER_ID, TEST_YEAR, TEST_MONTH } = require("./config");
const { waitForService, requestSafe, assertErrorShape } = require("./helpers");

describe("costs-service", () => {
    beforeAll(async () => {
        await waitForService(COSTS_URL);
    });

    test("GET /health -> 200", async () => {
        const res = await axios.get(COSTS_URL + "/health");
        expect(res.status).toBe(200);
    });

    test("POST /api/add -> 200/201 (valid cost)", async () => {
        const payload = {
            userid: TEST_USER_ID,
            description: "milk",
            category: "food",
            sum: 8
        };
        const out = await requestSafe(axios.post(COSTS_URL + "/api/add", payload));
        expect([200, 201]).toContain(out.status);
        expect(out.data).toHaveProperty("userid");
        expect(out.data).toHaveProperty("category");
        expect(out.data).toHaveProperty("sum");
    });

    test("POST /api/add missing fields -> 400 {id,message}", async () => {
        const out = await requestSafe(axios.post(COSTS_URL + "/api/add", { userid: TEST_USER_ID }));
        expect(out.status).toBe(400);
        assertErrorShape(out.data);
    });

    test("GET /api/report missing params -> 400 {id,message}", async () => {
        const out = await requestSafe(axios.get(COSTS_URL + "/api/report"));
        expect(out.status).toBe(400);
        assertErrorShape(out.data);
    });

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

    test("GET /api/total -> 200 and has total", async () => {
        const res = await axios.get(COSTS_URL + `/api/total?userid=${TEST_USER_ID}`);
        expect(res.status).toBe(200);
        expect(res.data).toHaveProperty("total");
    });
    test("POST /api/add empty category -> 400 {id,message}", async () => {
        const payload = {
            userid: TEST_USER_ID,
            description: "test",
            category: "",
            sum: 10
        };

        const out = await requestSafe(axios.post(COSTS_URL + "/api/add", payload));
        expect(out.status).toBe(400);
        assertErrorShape(out.data);
    });

});
