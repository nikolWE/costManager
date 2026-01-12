import requests
from config import USERS_URL, TEST_USER_ID
from conftest import wait_for_service, assert_error_shape

def test_users_health():
    wait_for_service(USERS_URL)
    r = requests.get(USERS_URL + "/health", timeout=10)
    assert r.status_code == 200

def test_list_users():
    wait_for_service(USERS_URL)
    r = requests.get(USERS_URL + "/api/users", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)

def test_get_specific_user_includes_total():
    wait_for_service(USERS_URL)
    r = requests.get(USERS_URL + f"/api/users/{TEST_USER_ID}", timeout=10)
    assert r.status_code == 200
    data = r.json()

    # Spec expects: first_name, last_name, id, total
    assert "id" in data
    assert "first_name" in data
    assert "last_name" in data
    assert "total" in data

def test_add_user_missing_fields_should_error():
    wait_for_service(USERS_URL)
    r = requests.post(USERS_URL + "/api/add", json={"id": 999999}, timeout=10)
    assert r.status_code >= 400
    assert_error_shape(r)
