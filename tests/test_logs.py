import requests
from config import LOGS_URL
from conftest import wait_for_service

def test_logs_health():
    wait_for_service(LOGS_URL)
    r = requests.get(LOGS_URL + "/health", timeout=10)
    assert r.status_code == 200

def test_get_logs_returns_json():
    wait_for_service(LOGS_URL)
    r = requests.get(LOGS_URL + "/api/logs", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list), "Expected logs list (array)"

def test_post_log_then_logs_list_increases_or_contains_entry():
    wait_for_service(LOGS_URL)

    # get current logs count (best effort)
    r1 = requests.get(LOGS_URL + "/api/logs", timeout=10)
    assert r1.status_code == 200
    before = r1.json()
    assert isinstance(before, list)

    # post a log entry
    payload = {
        "service": "tests",
        "endpoint": "/api/logs",
        "method": "POST",
        "message": "pytest log entry"
    }
    rp = requests.post(LOGS_URL + "/api/logs", json=payload, timeout=10)
    assert rp.status_code in (200, 201)

    # fetch again
    r2 = requests.get(LOGS_URL + "/api/logs", timeout=10)
    assert r2.status_code == 200
    after = r2.json()
    assert isinstance(after, list)

    # Not all implementations guarantee ordering/instant consistency,
    # so accept either count increase OR existence of a matching message.
    if len(after) == len(before):
        assert any(("pytest log entry" in str(x)) for x in after), "Posted log not found in logs list"
    else:
        assert len(after) >= len(before)
