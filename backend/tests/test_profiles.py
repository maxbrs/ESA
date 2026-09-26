import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock
from backend.main import app
from backend.dependencies import get_sheets_service
from backend.services.sheets import SheetsService
from backend.models import Profile


@pytest.fixture(autouse=True)
def mock_sheets():
    mock = MagicMock(spec=SheetsService)
    app.dependency_overrides[get_sheets_service] = lambda: mock
    yield mock
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


def test_list_profiles(client, mock_sheets):
    mock_sheets.get_all_profiles.return_value = [
        Profile(id="p1", name="Maxime", emoji="🧔", updated_at="2026-09-23"),
        Profile(id="p2", name="Océane", emoji="🌊", updated_at="2026-09-23"),
    ]
    r = client.get("/api/profiles")
    assert r.status_code == 200
    assert len(r.json()) == 2
    assert r.json()[0]["name"] == "Maxime"


def test_create_profile(client, mock_sheets):
    mock_sheets.create_profile.return_value = Profile(
        id="p3", name="Océane", emoji="🌊", updated_at="2026-09-23"
    )
    r = client.post("/api/profiles", json={"name": "Océane", "emoji": "🌊"})
    assert r.status_code == 201
    assert r.json()["emoji"] == "🌊"


def test_update_profile(client, mock_sheets):
    mock_sheets.update_profile.return_value = Profile(
        id="p1", name="Max", emoji="😎", updated_at="2026-09-23"
    )
    r = client.put("/api/profiles/p1", json={"name": "Max", "emoji": "😎"})
    assert r.status_code == 200
    assert r.json()["name"] == "Max"


def test_update_profile_not_found(client, mock_sheets):
    mock_sheets.update_profile.side_effect = ValueError("not found")
    r = client.put("/api/profiles/bad", json={"name": "X", "emoji": "❓"})
    assert r.status_code == 404


def test_delete_profile(client, mock_sheets):
    r = client.delete("/api/profiles/p1")
    assert r.status_code == 204


def test_delete_profile_in_use(client, mock_sheets):
    mock_sheets.delete_profile.side_effect = ValueError("used in account")
    r = client.delete("/api/profiles/p1")
    assert r.status_code == 400
    assert "used in account" in r.json()["detail"]
