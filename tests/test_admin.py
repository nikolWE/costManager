import requests
from config import ADMIN_URL
from conftest import wait_for_service

def test_admin_health():
    wait_for_service(ADMIN_URL)
    r = requests.get(ADMIN_URL + "/health", timeout=10)
    assert r.status_code == 200

def test_about_returns_developers():
    wait_for_service(ADMIN_URL)
    r = requests.get(ADMIN_URL + "/api/about", timeout=10)
    assert r.status_code == 200
    data = r.json()
    # Expected: list of developers or object containing them
    assert isinstance(data, (list, dict)), f"Unexpected about response type: {type(data)}"
