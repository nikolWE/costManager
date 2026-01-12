import time
import requests

def _get_json_safe(resp: requests.Response):
    try:
        return resp.json()
    except Exception:
        return None

def assert_error_shape(resp: requests.Response):
    """
    The spec requires that error JSON includes at minimum: { id, message }.
    This helper checks that shape when response is JSON.
    """
    data = _get_json_safe(resp)
    assert data is not None, f"Expected JSON error body, got: {resp.text}"
    assert "id" in data, f"Missing 'id' in error JSON: {data}"
    assert "message" in data, f"Missing 'message' in error JSON: {data}"

def wait_for_service(base_url: str, path: str = "/health", timeout_sec: int = 30):
    """
    Wait until service responds (helps reduce flakiness on Render cold start).
    """
    start = time.time()
    last_err = None
    while time.time() - start < timeout_sec:
        try:
            r = requests.get(base_url + path, timeout=10)
            if r.status_code < 500:
                return
        except Exception as e:
            last_err = e
        time.sleep(1)
    raise RuntimeError(f"Service not ready: {base_url}{path}. Last error: {last_err}")
