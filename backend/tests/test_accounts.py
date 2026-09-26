import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock
from backend.main import app
from backend.dependencies import get_sheets_service
from backend.services.sheets import SheetsService
from backend.models import Account


@pytest.fixture(autouse=True)
def mock_sheets():
    mock = MagicMock(spec=SheetsService)
    app.dependency_overrides[get_sheets_service] = lambda: mock
    yield mock
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


SAMPLE_ACCOUNT = Account(
    id="a1", name="House", currency="NOK", color="#4A90D9",
    profile_weights={"p1": 0.5, "p2": 0.5}, updated_at="2026-09-23"
)


def test_list_accounts(client, mock_sheets):
    mock_sheets.get_all_accounts.return_value = [SAMPLE_ACCOUNT]
    r = client.get("/api/accounts")
    assert r.status_code == 200
    assert r.json()[0]["name"] == "House"


def test_create_account(client, mock_sheets):
    mock_sheets.create_account.return_value = SAMPLE_ACCOUNT
    r = client.post("/api/accounts", json={
        "name": "House", "currency": "NOK", "color": "#4A90D9",
        "profile_weights": {"p1": 0.5, "p2": 0.5}
    })
    assert r.status_code == 201
    assert r.json()["id"] == "a1"


def test_create_account_invalid_weights(client, mock_sheets):
    r = client.post("/api/accounts", json={
        "name": "Bad", "currency": "NOK", "color": "#fff",
        "profile_weights": {"p1": 0.6, "p2": 0.6}  # sums to 1.2
    })
    assert r.status_code == 422


def test_get_account(client, mock_sheets):
    mock_sheets.get_account.return_value = SAMPLE_ACCOUNT
    r = client.get("/api/accounts/a1")
    assert r.status_code == 200
    assert r.json()["currency"] == "NOK"


def test_get_account_not_found(client, mock_sheets):
    mock_sheets.get_account.side_effect = ValueError("not found")
    r = client.get("/api/accounts/bad")
    assert r.status_code == 404


def test_update_account(client, mock_sheets):
    mock_sheets.update_account.return_value = SAMPLE_ACCOUNT
    r = client.put("/api/accounts/a1", json={"name": "House 2"})
    assert r.status_code == 200


def test_update_account_not_found(client, mock_sheets):
    mock_sheets.update_account.side_effect = ValueError("not found")
    r = client.put("/api/accounts/bad", json={"name": "X"})
    assert r.status_code == 404


def test_delete_account(client, mock_sheets):
    r = client.delete("/api/accounts/a1")
    assert r.status_code == 204
