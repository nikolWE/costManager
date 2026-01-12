const axios = require("axios");

async function waitForService(baseUrl, path = "/health", timeoutMs = 30000) {
    const start = Date.now();
    let lastErr = null;

    while (Date.now() - start < timeoutMs) {
        try {
            const res = await axios.get(baseUrl + path, { timeout: 10000 });
            if (res.status < 500) return;
        } catch (e) {
            lastErr = e;
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    throw new Error(`Service not ready: ${baseUrl}${path}. Last error: ${lastErr}`);
}

// axios throws on non-2xx, so normalize for tests
async function requestSafe(promise) {
    try {
        const res = await promise;
        return { status: res.status, data: res.data };
    } catch (err) {
        if (err.response) {
            return { status: err.response.status, data: err.response.data };
        }
        throw err;
    }
}

function assertErrorShape(data) {
    expect(data).toBeDefined();
    expect(typeof data).toBe("object");
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("message");
}

module.exports = { waitForService, requestSafe, assertErrorShape };
