import requests
from config import COSTS_URL, TEST_USER_ID, TEST_YEAR, TEST_MONTH
from conftest import wait_for_service, assert_error_shape

def test_costs_health():
    wait_for_service(COSTS_URL)
    r = requests.get(COSTS_URL + "/health", timeout=10)
    assert r.status_code == 200

def test_add_cost_success():
    wait_for_service(COSTS_URL)
    payload = {
        "userid": TEST_USER_ID,
        "description": "milk",
        "category": "food",
        "sum": 8
    }
    r = requests.post(COSTS_URL + "/api/add", json=payload, timeout=10)
    assert r.status_code in (200, 201)
    data = r.json()
    # must return the added cost item (at minimum)
    assert data.get("userid") == TEST_USER_ID
    assert data.get("category") == "food"
    assert "description" in data
    assert "sum" in data

def test_add_cost_missing_fields_should_error():
    wait_for_service(COSTS_URL)
    r = requests.post(COSTS_URL + "/api/add", json={"userid": TEST_USER_ID}, timeout=10)
    assert r.status_code >= 400
    assert_error_shape(r)

def test_get_report_structure():
    wait_for_service(COSTS_URL)

    # Some implementations expect "id" (spec) and some use "userid".
    # Send both to be robust.
    url = (COSTS_URL + f"/api/report?id={TEST_USER_ID}&userid={TEST_USER_ID}"
           f"&year={TEST_YEAR}&month={TEST_MONTH}")
    r = requests.get(url, timeout=15)
    assert r.status_code == 200
    data = r.json()

    assert "year" in data
    assert "month" in data
    assert "costs" in data
    assert isinstance(data["costs"], list)

def test_get_total_for_user():
    wait_for_service(COSTS_URL)
    r = requests.get(COSTS_URL + f"/api/total?userid={TEST_USER_ID}", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert "total" in data
