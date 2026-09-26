import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock
from backend.main import app
from backend.dependencies import get_sheets_service
from backend.services.sheets import SheetsService
from backend.models import Transaction


@pytest.fixture(autouse=True)
def mock_sheets():
    mock = MagicMock(spec=SheetsService)
    app.dependency_overrides[get_sheets_service] = lambda: mock
    yield mock
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


SAMPLE_TXN = Transaction(
    id="t1", type="expense", description="Groceries", amount=-200.0,
    date="2026-09-20", created_by="p1",
    weights={"p1": 0.5, "p2": 0.5}, updated_at="2026-09-23"
)


def test_list_transactions(client, mock_sheets):
    mock_sheets.get_transactions.return_value = [SAMPLE_TXN]
    r = client.get("/api/accounts/a1/transactions")
    assert r.status_code == 200
    assert r.json()[0]["amount"] == -200.0


def test_create_transaction(client, mock_sheets):
    mock_sheets.create_transaction.return_value = SAMPLE_TXN
    r = client.post("/api/accounts/a1/transactions", json={
        "type": "expense", "description": "Groceries",
        "amount": 200.0, "date": "2026-09-20",
        "created_by": "p1", "weights": {"p1": 0.5, "p2": 0.5}
    })
    assert r.status_code == 201
    assert r.json()["amount"] == -200.0  # signed by service


def test_create_transaction_negative_amount_rejected(client, mock_sheets):
    r = client.post("/api/accounts/a1/transactions", json={
        "type": "expense", "description": "X",
        "amount": -50.0,  # negative — must be rejected
        "date": "2026-09-20", "created_by": "p1",
        "weights": {"p1": 1.0}
    })
    assert r.status_code == 422


def test_create_transaction_invalid_weights(client, mock_sheets):
    r = client.post("/api/accounts/a1/transactions", json={
        "type": "expense", "description": "X",
        "amount": 50.0, "date": "2026-09-20", "created_by": "p1",
        "weights": {"p1": 0.4, "p2": 0.4}  # sums to 0.8
    })
    assert r.status_code == 422


def test_update_transaction(client, mock_sheets):
    mock_sheets.update_transaction.return_value = SAMPLE_TXN
    r = client.put("/api/accounts/a1/transactions/t1", json={"description": "Updated"})
    assert r.status_code == 200


def test_update_transaction_not_found(client, mock_sheets):
    mock_sheets.update_transaction.side_effect = ValueError("not found")
    r = client.put("/api/accounts/a1/transactions/bad", json={"description": "X"})
    assert r.status_code == 404


def test_delete_transaction(client, mock_sheets):
    r = client.delete("/api/accounts/a1/transactions/t1")
    assert r.status_code == 204


def test_delete_transaction_not_found(client, mock_sheets):
    mock_sheets.delete_transaction.side_effect = ValueError("not found")
    r = client.delete("/api/accounts/a1/transactions/bad")
    assert r.status_code == 404
