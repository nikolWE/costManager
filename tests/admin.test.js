const axios = require("axios");
const { ADMIN_URL } = require("./config");
const { waitForService } = require("./helpers");

jest.setTimeout(60000);

describe("admin-service", () => {
    beforeAll(async () => {
        await waitForService(ADMIN_URL);
    });

    test("GET /health -> 200", async () => {
        const res = await axios.get(ADMIN_URL + "/health");
        expect(res.status).toBe(200);
    });

    test("GET /api/about -> 200 and JSON", async () => {
        const res = await axios.get(ADMIN_URL + "/api/about");
        expect(res.status).toBe(200);
        expect(typeof res.data).toBe("object");
    });
});
