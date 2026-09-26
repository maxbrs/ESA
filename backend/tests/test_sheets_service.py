import json
import pytest
from unittest.mock import MagicMock, call
from backend.services.sheets import SheetsService
from backend.models import ProfileCreate, ProfileUpdate, AccountCreate, TransactionCreate
from backend.tests.conftest import make_mock_worksheet


@pytest.fixture
def service(mock_spreadsheet):
    # Pre-existing sheets so _ensure_initialized does nothing
    profiles_ws = make_mock_worksheet("profiles", [])
    accounts_ws = make_mock_worksheet("accounts", [])
    mock_spreadsheet.worksheets.return_value = [profiles_ws, accounts_ws]
    mock_spreadsheet.worksheet.side_effect = lambda t: profiles_ws if t == "profiles" else accounts_ws
    return SheetsService(mock_spreadsheet)


# --- Profiles ---

def test_get_all_profiles_empty(service, mock_spreadsheet):
    result = service.get_all_profiles()
    assert result == []


def test_create_profile(service, mock_spreadsheet):
    ws = make_mock_worksheet("profiles", [])
    mock_spreadsheet.worksheet.side_effect = None  # clear side_effect so return_value takes effect
    mock_spreadsheet.worksheet.return_value = ws
    result = service.create_profile(ProfileCreate(name="Maxime", emoji="🧔"))
    assert result.name == "Maxime"
    assert result.emoji == "🧔"
    assert len(result.id) == 8
    ws.append_row.assert_called_once()


def test_update_profile_not_found(service, mock_spreadsheet):
    ws = make_mock_worksheet("profiles", [])
    mock_spreadsheet.worksheet.return_value = ws
    with pytest.raises(ValueError, match="not found"):
        service.update_profile("bad_id", ProfileUpdate(name="X", emoji="❓"))


def test_delete_profile_blocked_when_in_account(service, mock_spreadsheet):
    accounts_ws = make_mock_worksheet("accounts", [
        {"id": "a1", "name": "House", "currency": "NOK", "color": "#fff",
         "profile_weights": json.dumps({"p1": 1.0}), "updated_at": "2026-09-23"}
    ])
    profiles_ws = make_mock_worksheet("profiles", [
        {"id": "p1", "name": "Maxime", "emoji": "🧔", "updated_at": "2026-09-23"}
    ])
    mock_spreadsheet.worksheet.side_effect = lambda t: profiles_ws if t == "profiles" else accounts_ws
    with pytest.raises(ValueError, match="used in account"):
        service.delete_profile("p1")


# --- Transactions ---

def test_create_transaction_expense_signed_negative(service, mock_spreadsheet):
    accounts_ws = make_mock_worksheet("accounts", [
        {"id": "a1", "name": "House", "currency": "NOK", "color": "#fff",
         "profile_weights": json.dumps({"p1": 0.5, "p2": 0.5}), "updated_at": "2026-09-23"}
    ])
    house_ws = make_mock_worksheet("House", [])
    mock_spreadsheet.worksheet.side_effect = lambda t: accounts_ws if t == "accounts" else house_ws

    txn = service.create_transaction("a1", TransactionCreate(
        type="expense", description="Groceries", amount=200.0,
        date="2026-09-20", created_by="p1",
        weights={"p1": 0.5, "p2": 0.5}
    ))
    assert txn.amount == -200.0


def test_create_transaction_refill_stays_positive(service, mock_spreadsheet):
    accounts_ws = make_mock_worksheet("accounts", [
        {"id": "a1", "name": "House", "currency": "NOK", "color": "#fff",
         "profile_weights": json.dumps({"p1": 1.0}), "updated_at": "2026-09-23"}
    ])
    house_ws = make_mock_worksheet("House", [])
    mock_spreadsheet.worksheet.side_effect = lambda t: accounts_ws if t == "accounts" else house_ws

    txn = service.create_transaction("a1", TransactionCreate(
        type="refill", description="Maxime deposit", amount=500.0,
        date="2026-09-21", created_by="p1",
        weights={"p1": 1.0}
    ))
    assert txn.amount == 500.0
