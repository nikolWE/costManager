const axios = require("axios");
/*
 * Service Availability Waiter:
 * Continuously polls a service's health endpoint to check if it's ready.
 * Useful in CI/CD or local tests where services might take time to boot.
 */
async function waitForService(baseUrl, path = "/health", timeoutMs = 30000) {
    const start = Date.now();
    let lastErr = null;
    /*
     * Polling Loop:
     * Keeps trying until the timeout expires.
     * We send a GET request with a short timeout (10s) per attempt.
     */
    while (Date.now() - start < timeoutMs) {
        try {
            const res = await axios.get(baseUrl + path, { timeout: 10000 });
            // If status is 200-499, the service is technically reachable (up).
            if (res.status < 500) return;
        } catch (e) {
            lastErr = e;
        }
        /*
         * Backoff Strategy:
         * Wait for 1 second before the next attempt to avoid flooding the network.
         */
        await new Promise(r => setTimeout(r, 1000));
    }
    /*
     * Timeout Failure:
     * If the loop finishes without success, throw an error with context.
     */
    throw new Error(`Service not ready: ${baseUrl}${path}. Last error: ${lastErr}`);
}
/*
 * Axios Request Wrapper:
 * Standard Axios throws exceptions on non-2xx status codes.
 * This helper catches those errors and returns a normalized object
 * { status, data } to make writing assertions easier.
 */
async function requestSafe(promise) {
    try {
        const res = await promise;
        return { status: res.status, data: res.data };
    } catch (err) {
        /*
         * Error Normalization:
         * If the error has a response (HTTP 4xx/5xx), return it safely.
         * If it's a network error (no response), re-throw it.
         */
        if (err.response) {
            return { status: err.response.status, data: err.response.data };
        }
        throw err;
    }
}
/*
 * Error Schema Validator:
 * Verifies that the API error response matches the expected project format:
 * { id: <number>, message: <string> }
 */
function assertErrorShape(data) {
    expect(data).toBeDefined();
    expect(typeof data).toBe("object");
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("message");
}

module.exports = { waitForService, requestSafe, assertErrorShape };