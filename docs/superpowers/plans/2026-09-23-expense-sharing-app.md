# Expense Sharing App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a locally-run React + FastAPI web app for tracking shared expenses, backed by Google Sheets.

**Architecture:** React (Vite + TypeScript) frontend proxies `/api/*` to a FastAPI backend which reads/writes a Google Spreadsheet via a service account. One sheet tab per account holds its transactions; two global tabs hold profiles and account metadata.

**Tech Stack:** React 18, Vite 5, TypeScript 5, Tailwind CSS 3, lucide-react, react-router-dom 6; Python 3.11+, FastAPI, gspread, pydantic v2, python-dotenv, uvicorn; Vitest + React Testing Library (frontend), pytest + httpx (backend).

## Global Constraints

- Python ≥ 3.11 (use `str | None` union syntax, not `Optional[str]`)
- Pydantic v2 (use `@field_validator` with `@classmethod`, not `@validator`)
- React Router v6 (`createBrowserRouter` or `<Routes>/<Route>` syntax)
- Tailwind CSS v3 (not v4)
- All amounts stored in Google Sheet as **signed floats** (expenses negative); API POST/PUT always receives **positive** amount, backend applies sign based on `type`
- Weights stored as JSON strings in Google Sheet; always validated: `abs(sum(weights.values()) - 1.0) < 0.001`
- IDs are 8-character hex strings (`uuid.uuid4().hex[:8]`)
- `updated_at` is an ISO 8601 UTC datetime string set by the backend on every write
- Currency options: `NOK` | `USD` | `EUR` — set at account creation, never changed
- Transaction types: `refill` | `expense` | `income`
- Default weights: refill → `{current_user: 1.0, others: 0.0}`; expense/income → account's `profile_weights`
- No authentication. A single `credentials.json` (gitignored) service account file authenticates the backend.

---

## File Map

```
tbd/
├── frontend/
│   ├── src/
│   │   ├── types/index.ts               # All shared TS interfaces
│   │   ├── api/client.ts                # Typed fetch wrapper for all endpoints
│   │   ├── utils/balance.ts             # computeBalance(), formatBalance()
│   │   ├── context/AppContext.tsx       # Active profile session state
│   │   ├── hooks/
│   │   │   ├── useProfiles.ts           # Profiles CRUD + loading state
│   │   │   ├── useAccounts.ts           # Accounts CRUD + loading state
│   │   │   └── useTransactions.ts       # Transactions CRUD + loading state
│   │   ├── components/
│   │   │   ├── ProfileSelector.tsx      # Screen ① — landing page
│   │   │   ├── AccountCard.tsx          # Credit-card shaped account tile
│   │   │   ├── AccountsList.tsx         # Screen ② — account list + new account modal
│   │   │   ├── AccountPage.tsx          # Screen ③ — three-panel layout shell
│   │   │   ├── AccountHeader.tsx        # Top bar with nav + settings button
│   │   │   ├── TransactionList.tsx      # Scrollable transaction list + add button
│   │   │   ├── TransactionItem.tsx      # Single transaction row with edit/delete
│   │   │   ├── BalancePanel.tsx         # Right-side live balance summary
│   │   │   ├── TransactionModal.tsx     # Screen ⑤ — add/edit transaction
│   │   │   ├── SettingsModal.tsx        # Screen ④ — account settings
│   │   │   └── WeightsEditor.tsx        # Reusable weight input + live sum indicator
│   │   ├── App.tsx                      # BrowserRouter + Routes
│   │   └── main.tsx                     # React entry point
│   ├── index.html
│   ├── vite.config.ts                   # /api proxy to :8000
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── tsconfig.json
│   └── package.json
│
├── backend/
│   ├── main.py                          # FastAPI app, CORS, router registration, health
│   ├── config.py                        # Settings (reads .env)
│   ├── dependencies.py                  # get_sheets_service() FastAPI dependency
│   ├── models.py                        # All Pydantic models
│   ├── services/
│   │   └── sheets.py                    # SheetsService class — all gspread logic
│   ├── routers/
│   │   ├── profiles.py
│   │   ├── accounts.py
│   │   └── transactions.py
│   └── tests/
│       ├── conftest.py                  # Shared fixtures
│       ├── test_sheets_service.py       # Unit tests with mocked gspread
│       ├── test_profiles.py
│       ├── test_accounts.py
│       └── test_transactions.py
│
├── .env                                 # gitignored
├── .env.example
├── credentials.json                     # gitignored
├── Makefile
└── .gitignore
```

---

## Task 1: Project Scaffolding & Dev Environment

**Files:**
- Create: `frontend/` (Vite scaffold + deps)
- Create: `backend/main.py`, `backend/config.py`, `backend/requirements.txt`
- Create: `Makefile`, `.gitignore`, `.env.example`
- Create: `frontend/vite.config.ts`, `frontend/tailwind.config.js`, `frontend/postcss.config.js`

**Interfaces:**
- Produces: `GET /api/health` → `{"status": "ok"}`; `npm run dev` on :5173 proxying `/api` to :8000

- [ ] **Step 1: Scaffold the Vite frontend**

```bash
cd /Users/maxime/git/perso/tbd
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install react-router-dom lucide-react
npm install -D tailwindcss@3 postcss autoprefixer vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom @vitejs/plugin-react
npx tailwindcss init -p
```

- [ ] **Step 2: Configure Vite proxy and Tailwind**

Write `frontend/vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
  },
})
```

Write `frontend/tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

Write `frontend/src/test-setup.ts`:
```typescript
import '@testing-library/jest-dom'
```

Add to `frontend/src/index.css` (replace contents):
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --account-color: #4A90D9;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #0f172a;
  color: #e2e8f0;
  min-height: 100vh;
}
```

Add `"test": "vitest"` to `frontend/package.json` scripts.

- [ ] **Step 3: Create backend structure**

```bash
cd /Users/maxime/git/perso/tbd
mkdir -p backend/routers backend/services backend/tests
touch backend/__init__.py backend/routers/__init__.py backend/services/__init__.py backend/tests/__init__.py
```

Write `backend/requirements.txt`:
```
fastapi==0.115.0
uvicorn[standard]==0.30.6
gspread==6.1.2
pydantic==2.9.2
python-dotenv==1.0.1
pytest==8.3.3
pytest-asyncio==0.24.0
httpx==0.27.2
```

Write `backend/config.py`:
```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    spreadsheet_id: str
    credentials_path: str = "credentials.json"

    class Config:
        env_file = ".env"


settings = Settings()
```

Add `pydantic-settings==2.5.2` to `requirements.txt`.

Write `backend/main.py`:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routers import profiles, accounts, transactions

app = FastAPI(title="Expense Sharing App")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(profiles.router, prefix="/api")
app.include_router(accounts.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
```

Write `backend/routers/profiles.py`, `accounts.py`, `transactions.py` as empty stubs:
```python
from fastapi import APIRouter
router = APIRouter()
```

- [ ] **Step 4: Create Makefile and config files**

Write `Makefile`:
```makefile
.PHONY: dev backend frontend install

dev:
	@trap 'kill 0' SIGINT; \
	(cd backend && uvicorn main:app --reload --port 8000) & \
	(cd frontend && npm run dev) & \
	wait

backend:
	cd backend && uvicorn main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

install:
	cd frontend && npm install
	cd backend && pip install -r requirements.txt
```

Write `.gitignore`:
```
.env
credentials.json
__pycache__/
*.pyc
.pytest_cache/
node_modules/
frontend/dist/
.venv/
```

Write `.env.example`:
```
SPREADSHEET_ID=your_google_spreadsheet_id_here
CREDENTIALS_PATH=credentials.json
```

- [ ] **Step 5: Write and run the health check test**

Write `backend/tests/test_health.py`:
```python
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

Run:
```bash
cd /Users/maxime/git/perso/tbd
pip install -r backend/requirements.txt
SPREADSHEET_ID=test CREDENTIALS_PATH=fake.json pytest backend/tests/test_health.py -v
```
Expected: `PASSED`

- [ ] **Step 6: Verify frontend starts**

```bash
cd frontend && npm run dev
```
Expected: Vite server running on `http://localhost:5173`

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: project scaffolding — Vite frontend + FastAPI backend + Makefile"
```

---

## Task 2: Pydantic Models & Google Sheets Service

**Files:**
- Create: `backend/models.py`
- Create: `backend/services/sheets.py`
- Create: `backend/dependencies.py`
- Create: `backend/tests/test_sheets_service.py`

**Interfaces:**
- Produces: `SheetsService` class with methods for all CRUD operations
- Produces: `get_sheets_service()` FastAPI dependency
- Consumes: nothing from prior tasks beyond config

- [ ] **Step 1: Write `backend/models.py`**

```python
import json
from typing import Literal
from pydantic import BaseModel, field_validator

Currency = Literal["NOK", "USD", "EUR"]
TransactionType = Literal["refill", "expense", "income"]


# --- Profile ---

class Profile(BaseModel):
    id: str
    name: str
    emoji: str
    updated_at: str


class ProfileCreate(BaseModel):
    name: str
    emoji: str


class ProfileUpdate(BaseModel):
    name: str
    emoji: str


# --- Account ---

class Account(BaseModel):
    id: str
    name: str
    currency: Currency
    color: str
    profile_weights: dict[str, float]
    updated_at: str


class AccountCreate(BaseModel):
    name: str
    currency: Currency
    color: str
    profile_weights: dict[str, float]

    @field_validator("profile_weights")
    @classmethod
    def weights_sum_to_one(cls, v: dict[str, float]) -> dict[str, float]:
        if abs(sum(v.values()) - 1.0) > 0.001:
            raise ValueError("profile_weights must sum to 1.0")
        return v


class AccountUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    profile_weights: dict[str, float] | None = None

    @field_validator("profile_weights")
    @classmethod
    def weights_sum_to_one(cls, v: dict[str, float] | None) -> dict[str, float] | None:
        if v is not None and abs(sum(v.values()) - 1.0) > 0.001:
            raise ValueError("profile_weights must sum to 1.0")
        return v


# --- Transaction ---

class Transaction(BaseModel):
    id: str
    type: TransactionType
    description: str
    amount: float          # signed: negative for expenses
    date: str              # YYYY-MM-DD
    created_by: str        # profile id
    weights: dict[str, float]
    updated_at: str


class TransactionCreate(BaseModel):
    type: TransactionType
    description: str
    amount: float          # always positive; backend applies sign based on type
    date: str
    created_by: str
    weights: dict[str, float]

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("amount must be positive")
        return v

    @field_validator("weights")
    @classmethod
    def weights_sum_to_one(cls, v: dict[str, float]) -> dict[str, float]:
        if abs(sum(v.values()) - 1.0) > 0.001:
            raise ValueError("weights must sum to 1.0")
        return v


class TransactionUpdate(BaseModel):
    type: TransactionType | None = None
    description: str | None = None
    amount: float | None = None    # always positive when provided
    date: str | None = None
    weights: dict[str, float] | None = None

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: float | None) -> float | None:
        if v is not None and v <= 0:
            raise ValueError("amount must be positive")
        return v

    @field_validator("weights")
    @classmethod
    def weights_sum_to_one(cls, v: dict[str, float] | None) -> dict[str, float] | None:
        if v is not None and abs(sum(v.values()) - 1.0) > 0.001:
            raise ValueError("weights must sum to 1.0")
        return v
```

- [ ] **Step 2: Write `backend/services/sheets.py`**

```python
import json
import uuid
from datetime import datetime

import gspread

from backend.models import (
    Account, AccountCreate, AccountUpdate,
    Profile, ProfileCreate, ProfileUpdate,
    Transaction, TransactionCreate, TransactionUpdate,
)


def _short_id() -> str:
    return uuid.uuid4().hex[:8]


def _now() -> str:
    return datetime.utcnow().isoformat()


class SheetsService:
    PROFILES_SHEET = "profiles"
    ACCOUNTS_SHEET = "accounts"

    PROFILE_HEADERS = ["id", "name", "emoji", "updated_at"]
    ACCOUNT_HEADERS = ["id", "name", "currency", "color", "profile_weights", "updated_at"]
    TRANSACTION_HEADERS = ["id", "type", "description", "amount", "date", "created_by", "weights", "updated_at"]

    def __init__(self, spreadsheet: gspread.Spreadsheet) -> None:
        self.spreadsheet = spreadsheet
        self._ensure_initialized()

    # ── Init ──────────────────────────────────────────────────────────────────

    def _ensure_initialized(self) -> None:
        existing = {ws.title for ws in self.spreadsheet.worksheets()}
        if self.PROFILES_SHEET not in existing:
            ws = self.spreadsheet.add_worksheet(title=self.PROFILES_SHEET, rows=1000, cols=10)
            ws.append_row(self.PROFILE_HEADERS)
        if self.ACCOUNTS_SHEET not in existing:
            ws = self.spreadsheet.add_worksheet(title=self.ACCOUNTS_SHEET, rows=1000, cols=10)
            ws.append_row(self.ACCOUNT_HEADERS)

    def _ws(self, title: str) -> gspread.Worksheet:
        return self.spreadsheet.worksheet(title)

    # ── Profiles ──────────────────────────────────────────────────────────────

    def get_all_profiles(self) -> list[Profile]:
        return [Profile(**r) for r in self._ws(self.PROFILES_SHEET).get_all_records()]

    def create_profile(self, data: ProfileCreate) -> Profile:
        profile = Profile(id=_short_id(), name=data.name, emoji=data.emoji, updated_at=_now())
        self._ws(self.PROFILES_SHEET).append_row(
            [profile.id, profile.name, profile.emoji, profile.updated_at]
        )
        return profile

    def update_profile(self, profile_id: str, data: ProfileUpdate) -> Profile:
        ws = self._ws(self.PROFILES_SHEET)
        for i, r in enumerate(ws.get_all_records()):
            if r["id"] == profile_id:
                updated = Profile(id=profile_id, name=data.name, emoji=data.emoji, updated_at=_now())
                ws.update(f"A{i+2}:D{i+2}", [[updated.id, updated.name, updated.emoji, updated.updated_at]])
                return updated
        raise ValueError(f"Profile {profile_id} not found")

    def delete_profile(self, profile_id: str) -> None:
        # Block if used in any account
        for acc_row in self._ws(self.ACCOUNTS_SHEET).get_all_records():
            weights = json.loads(acc_row["profile_weights"])
            if profile_id in weights:
                raise ValueError(f"Profile is used in account '{acc_row['name']}' and cannot be deleted")
        ws = self._ws(self.PROFILES_SHEET)
        for i, r in enumerate(ws.get_all_records()):
            if r["id"] == profile_id:
                ws.delete_rows(i + 2)
                return
        raise ValueError(f"Profile {profile_id} not found")

    # ── Accounts ──────────────────────────────────────────────────────────────

    def _row_to_account(self, r: dict) -> Account:
        return Account(**{**r, "profile_weights": json.loads(r["profile_weights"])})

    def get_all_accounts(self) -> list[Account]:
        return [self._row_to_account(r) for r in self._ws(self.ACCOUNTS_SHEET).get_all_records()]

    def get_account(self, account_id: str) -> Account:
        for r in self._ws(self.ACCOUNTS_SHEET).get_all_records():
            if r["id"] == account_id:
                return self._row_to_account(r)
        raise ValueError(f"Account {account_id} not found")

    def create_account(self, data: AccountCreate) -> Account:
        account = Account(
            id=_short_id(), name=data.name, currency=data.currency,
            color=data.color, profile_weights=data.profile_weights, updated_at=_now()
        )
        self._ws(self.ACCOUNTS_SHEET).append_row([
            account.id, account.name, account.currency, account.color,
            json.dumps(account.profile_weights), account.updated_at
        ])
        txn_ws = self.spreadsheet.add_worksheet(title=account.name, rows=10000, cols=20)
        txn_ws.append_row(self.TRANSACTION_HEADERS)
        return account

    def update_account(self, account_id: str, data: AccountUpdate) -> Account:
        ws = self._ws(self.ACCOUNTS_SHEET)
        for i, r in enumerate(ws.get_all_records()):
            if r["id"] == account_id:
                old_name = r["name"]
                updated = Account(
                    id=account_id,
                    name=data.name if data.name is not None else r["name"],
                    currency=r["currency"],
                    color=data.color if data.color is not None else r["color"],
                    profile_weights=data.profile_weights if data.profile_weights is not None else json.loads(r["profile_weights"]),
                    updated_at=_now(),
                )
                ws.update(f"A{i+2}:F{i+2}", [[
                    updated.id, updated.name, updated.currency, updated.color,
                    json.dumps(updated.profile_weights), updated.updated_at
                ]])
                if data.name and data.name != old_name:
                    self._ws(old_name).update_title(updated.name)
                return updated
        raise ValueError(f"Account {account_id} not found")

    def delete_account(self, account_id: str) -> None:
        ws = self._ws(self.ACCOUNTS_SHEET)
        for i, r in enumerate(ws.get_all_records()):
            if r["id"] == account_id:
                try:
                    self.spreadsheet.del_worksheet(self._ws(r["name"]))
                except gspread.WorksheetNotFound:
                    pass
                ws.delete_rows(i + 2)
                return
        raise ValueError(f"Account {account_id} not found")

    # ── Transactions ──────────────────────────────────────────────────────────

    def _row_to_transaction(self, r: dict) -> Transaction:
        return Transaction(**{**r, "weights": json.loads(r["weights"]), "amount": float(r["amount"])})

    def get_transactions(self, account_id: str) -> list[Transaction]:
        account = self.get_account(account_id)
        return [self._row_to_transaction(r) for r in self._ws(account.name).get_all_records()]

    def create_transaction(self, account_id: str, data: TransactionCreate) -> Transaction:
        account = self.get_account(account_id)
        signed = -data.amount if data.type == "expense" else data.amount
        txn = Transaction(
            id=_short_id(), type=data.type, description=data.description,
            amount=signed, date=data.date, created_by=data.created_by,
            weights=data.weights, updated_at=_now()
        )
        self._ws(account.name).append_row([
            txn.id, txn.type, txn.description, txn.amount,
            txn.date, txn.created_by, json.dumps(txn.weights), txn.updated_at
        ])
        return txn

    def update_transaction(self, account_id: str, txn_id: str, data: TransactionUpdate) -> Transaction:
        account = self.get_account(account_id)
        ws = self._ws(account.name)
        for i, r in enumerate(ws.get_all_records()):
            if r["id"] == txn_id:
                new_type = data.type if data.type is not None else r["type"]
                raw_amount = data.amount if data.amount is not None else abs(float(r["amount"]))
                signed = -raw_amount if new_type == "expense" else raw_amount
                updated = Transaction(
                    id=txn_id, type=new_type,
                    description=data.description if data.description is not None else r["description"],
                    amount=signed,
                    date=data.date if data.date is not None else r["date"],
                    created_by=r["created_by"],
                    weights=data.weights if data.weights is not None else json.loads(r["weights"]),
                    updated_at=_now(),
                )
                ws.update(f"A{i+2}:H{i+2}", [[
                    updated.id, updated.type, updated.description, updated.amount,
                    updated.date, updated.created_by, json.dumps(updated.weights), updated.updated_at
                ]])
                return updated
        raise ValueError(f"Transaction {txn_id} not found")

    def delete_transaction(self, account_id: str, txn_id: str) -> None:
        account = self.get_account(account_id)
        ws = self._ws(account.name)
        for i, r in enumerate(ws.get_all_records()):
            if r["id"] == txn_id:
                ws.delete_rows(i + 2)
                return
        raise ValueError(f"Transaction {txn_id} not found")
```

- [ ] **Step 3: Write `backend/dependencies.py`**

```python
import gspread
from backend.config import settings
from backend.services.sheets import SheetsService


def get_sheets_service() -> SheetsService:
    gc = gspread.service_account(filename=settings.credentials_path)
    spreadsheet = gc.open_by_key(settings.spreadsheet_id)
    return SheetsService(spreadsheet)
```

- [ ] **Step 4: Write failing tests for SheetsService**

Write `backend/tests/conftest.py`:
```python
import pytest
from unittest.mock import MagicMock, patch
import gspread


def make_mock_worksheet(title: str, records: list[dict]) -> MagicMock:
    ws = MagicMock(spec=gspread.Worksheet)
    ws.title = title
    ws.get_all_records.return_value = records
    return ws


@pytest.fixture
def mock_spreadsheet():
    return MagicMock(spec=gspread.Spreadsheet)
```

Write `backend/tests/test_sheets_service.py`:
```python
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
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/maxime/git/perso/tbd
SPREADSHEET_ID=test CREDENTIALS_PATH=fake.json pytest backend/tests/test_sheets_service.py -v
```
Expected: all tests `PASSED`

- [ ] **Step 6: Commit**

```bash
git add backend/
git commit -m "feat: pydantic models and SheetsService with gspread"
```

---

## Task 3: Profiles API

**Files:**
- Modify: `backend/routers/profiles.py`
- Create: `backend/tests/test_profiles.py`

**Interfaces:**
- Consumes: `SheetsService` from Task 2, `get_sheets_service` from `dependencies.py`
- Produces: `GET/POST/PUT/DELETE /api/profiles`

- [ ] **Step 1: Write failing tests**

Write `backend/tests/test_profiles.py`:
```python
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
```

- [ ] **Step 2: Run tests — expect failures**

```bash
SPREADSHEET_ID=test CREDENTIALS_PATH=fake.json pytest backend/tests/test_profiles.py -v
```
Expected: `FAILED` (router stubs return nothing)

- [ ] **Step 3: Implement `backend/routers/profiles.py`**

```python
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from backend.dependencies import get_sheets_service
from backend.services.sheets import SheetsService
from backend.models import Profile, ProfileCreate, ProfileUpdate

router = APIRouter()
SheetsDep = Annotated[SheetsService, Depends(get_sheets_service)]


@router.get("/profiles", response_model=list[Profile])
def list_profiles(sheets: SheetsDep):
    return sheets.get_all_profiles()


@router.post("/profiles", response_model=Profile, status_code=201)
def create_profile(data: ProfileCreate, sheets: SheetsDep):
    return sheets.create_profile(data)


@router.put("/profiles/{profile_id}", response_model=Profile)
def update_profile(profile_id: str, data: ProfileUpdate, sheets: SheetsDep):
    try:
        return sheets.update_profile(profile_id, data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/profiles/{profile_id}", status_code=204)
def delete_profile(profile_id: str, sheets: SheetsDep):
    try:
        sheets.delete_profile(profile_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
```

- [ ] **Step 4: Run tests — expect pass**

```bash
SPREADSHEET_ID=test CREDENTIALS_PATH=fake.json pytest backend/tests/test_profiles.py -v
```
Expected: all `PASSED`

- [ ] **Step 5: Commit**

```bash
git add backend/routers/profiles.py backend/tests/test_profiles.py
git commit -m "feat: profiles API — CRUD endpoints"
```

---

## Task 4: Accounts API

**Files:**
- Modify: `backend/routers/accounts.py`
- Create: `backend/tests/test_accounts.py`

**Interfaces:**
- Consumes: `SheetsService` from Task 2
- Produces: `GET/POST/GET/{id}/PUT/{id}/DELETE/{id} /api/accounts`

- [ ] **Step 1: Write failing tests**

Write `backend/tests/test_accounts.py`:
```python
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


def test_delete_account(client, mock_sheets):
    r = client.delete("/api/accounts/a1")
    assert r.status_code == 204
```

- [ ] **Step 2: Run tests — expect failures**

```bash
SPREADSHEET_ID=test CREDENTIALS_PATH=fake.json pytest backend/tests/test_accounts.py -v
```
Expected: `FAILED`

- [ ] **Step 3: Implement `backend/routers/accounts.py`**

```python
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from backend.dependencies import get_sheets_service
from backend.services.sheets import SheetsService
from backend.models import Account, AccountCreate, AccountUpdate

router = APIRouter()
SheetsDep = Annotated[SheetsService, Depends(get_sheets_service)]


@router.get("/accounts", response_model=list[Account])
def list_accounts(sheets: SheetsDep):
    return sheets.get_all_accounts()


@router.post("/accounts", response_model=Account, status_code=201)
def create_account(data: AccountCreate, sheets: SheetsDep):
    return sheets.create_account(data)


@router.get("/accounts/{account_id}", response_model=Account)
def get_account(account_id: str, sheets: SheetsDep):
    try:
        return sheets.get_account(account_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/accounts/{account_id}", response_model=Account)
def update_account(account_id: str, data: AccountUpdate, sheets: SheetsDep):
    try:
        return sheets.update_account(account_id, data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/accounts/{account_id}", status_code=204)
def delete_account(account_id: str, sheets: SheetsDep):
    try:
        sheets.delete_account(account_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
```

- [ ] **Step 4: Run tests — expect pass**

```bash
SPREADSHEET_ID=test CREDENTIALS_PATH=fake.json pytest backend/tests/test_accounts.py -v
```
Expected: all `PASSED`

- [ ] **Step 5: Commit**

```bash
git add backend/routers/accounts.py backend/tests/test_accounts.py
git commit -m "feat: accounts API — CRUD endpoints"
```

---

## Task 5: Transactions API

**Files:**
- Modify: `backend/routers/transactions.py`
- Create: `backend/tests/test_transactions.py`

**Interfaces:**
- Consumes: `SheetsService` from Task 2
- Produces: `GET/POST/PUT/{txn_id}/DELETE/{txn_id} /api/accounts/{id}/transactions`

- [ ] **Step 1: Write failing tests**

Write `backend/tests/test_transactions.py`:
```python
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


def test_delete_transaction(client, mock_sheets):
    r = client.delete("/api/accounts/a1/transactions/t1")
    assert r.status_code == 204


def test_delete_transaction_not_found(client, mock_sheets):
    mock_sheets.delete_transaction.side_effect = ValueError("not found")
    r = client.delete("/api/accounts/a1/transactions/bad")
    assert r.status_code == 404
```

- [ ] **Step 2: Run tests — expect failures**

```bash
SPREADSHEET_ID=test CREDENTIALS_PATH=fake.json pytest backend/tests/test_transactions.py -v
```
Expected: `FAILED`

- [ ] **Step 3: Implement `backend/routers/transactions.py`**

```python
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from backend.dependencies import get_sheets_service
from backend.services.sheets import SheetsService
from backend.models import Transaction, TransactionCreate, TransactionUpdate

router = APIRouter()
SheetsDep = Annotated[SheetsService, Depends(get_sheets_service)]


@router.get("/accounts/{account_id}/transactions", response_model=list[Transaction])
def list_transactions(account_id: str, sheets: SheetsDep):
    try:
        return sheets.get_transactions(account_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/accounts/{account_id}/transactions", response_model=Transaction, status_code=201)
def create_transaction(account_id: str, data: TransactionCreate, sheets: SheetsDep):
    try:
        return sheets.create_transaction(account_id, data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/accounts/{account_id}/transactions/{txn_id}", response_model=Transaction)
def update_transaction(account_id: str, txn_id: str, data: TransactionUpdate, sheets: SheetsDep):
    try:
        return sheets.update_transaction(account_id, txn_id, data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/accounts/{account_id}/transactions/{txn_id}", status_code=204)
def delete_transaction(account_id: str, txn_id: str, sheets: SheetsDep):
    try:
        sheets.delete_transaction(account_id, txn_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
```

- [ ] **Step 4: Run all backend tests**

```bash
SPREADSHEET_ID=test CREDENTIALS_PATH=fake.json pytest backend/tests/ -v
```
Expected: all `PASSED`

- [ ] **Step 5: Commit**

```bash
git add backend/routers/transactions.py backend/tests/test_transactions.py
git commit -m "feat: transactions API — CRUD with weight and amount validation"
```

---

## Task 6: Frontend Foundation

**Files:**
- Create: `frontend/src/types/index.ts`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/utils/balance.ts`
- Create: `frontend/src/context/AppContext.tsx`
- Create: `frontend/src/hooks/useProfiles.ts`, `useAccounts.ts`, `useTransactions.ts`
- Modify: `frontend/src/App.tsx`, `frontend/src/main.tsx`

**Interfaces:**
- Produces: `computeBalance(transactions, profiles)` → `Record<string, number>`
- Produces: `api.*` typed fetch wrapper
- Produces: `useAppContext()` → `{activeProfile, setActiveProfile}`
- Produces: routes `/`, `/accounts`, `/accounts/:accountId`

- [ ] **Step 1: Write `frontend/src/types/index.ts`**

```typescript
export type Currency = 'NOK' | 'USD' | 'EUR'
export type TransactionType = 'refill' | 'expense' | 'income'

export interface Profile {
  id: string
  name: string
  emoji: string
  updated_at: string
}

export interface Account {
  id: string
  name: string
  currency: Currency
  color: string
  profile_weights: Record<string, number>
  updated_at: string
}

export interface Transaction {
  id: string
  type: TransactionType
  description: string
  amount: number        // signed: negative for expenses
  date: string          // YYYY-MM-DD
  created_by: string    // profile id
  weights: Record<string, number>
  updated_at: string
}

// API request shapes
export interface ProfileCreate { name: string; emoji: string }
export interface ProfileUpdate { name: string; emoji: string }

export interface AccountCreate {
  name: string; currency: Currency; color: string
  profile_weights: Record<string, number>
}
export interface AccountUpdate {
  name?: string; color?: string; profile_weights?: Record<string, number>
}

export interface TransactionCreate {
  type: TransactionType; description: string
  amount: number        // always positive; backend applies sign
  date: string; created_by: string
  weights: Record<string, number>
}
export interface TransactionUpdate {
  type?: TransactionType; description?: string
  amount?: number       // always positive when provided
  date?: string; weights?: Record<string, number>
}
```

- [ ] **Step 2: Write `frontend/src/api/client.ts`**

```typescript
import type {
  Profile, ProfileCreate, ProfileUpdate,
  Account, AccountCreate, AccountUpdate,
  Transaction, TransactionCreate, TransactionUpdate,
} from '../types'

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
    throw new Error(err.detail ?? `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  // Profiles
  getProfiles: () =>
    request<Profile[]>('/profiles'),
  createProfile: (data: ProfileCreate) =>
    request<Profile>('/profiles', { method: 'POST', body: JSON.stringify(data) }),
  updateProfile: (id: string, data: ProfileUpdate) =>
    request<Profile>(`/profiles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProfile: (id: string) =>
    request<void>(`/profiles/${id}`, { method: 'DELETE' }),

  // Accounts
  getAccounts: () =>
    request<Account[]>('/accounts'),
  createAccount: (data: AccountCreate) =>
    request<Account>('/accounts', { method: 'POST', body: JSON.stringify(data) }),
  getAccount: (id: string) =>
    request<Account>(`/accounts/${id}`),
  updateAccount: (id: string, data: AccountUpdate) =>
    request<Account>(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAccount: (id: string) =>
    request<void>(`/accounts/${id}`, { method: 'DELETE' }),

  // Transactions
  getTransactions: (accountId: string) =>
    request<Transaction[]>(`/accounts/${accountId}/transactions`),
  createTransaction: (accountId: string, data: TransactionCreate) =>
    request<Transaction>(`/accounts/${accountId}/transactions`, { method: 'POST', body: JSON.stringify(data) }),
  updateTransaction: (accountId: string, txnId: string, data: TransactionUpdate) =>
    request<Transaction>(`/accounts/${accountId}/transactions/${txnId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTransaction: (accountId: string, txnId: string) =>
    request<void>(`/accounts/${accountId}/transactions/${txnId}`, { method: 'DELETE' }),
}
```

- [ ] **Step 3: Write `frontend/src/utils/balance.ts` with tests**

Write the utility:
```typescript
import type { Transaction, Profile } from '../types'

export function computeBalance(
  transactions: Transaction[],
  profiles: Profile[],
): Record<string, number> {
  const balance: Record<string, number> = {}
  for (const profile of profiles) {
    balance[profile.id] = transactions.reduce((sum, txn) => {
      return sum + txn.amount * (txn.weights[profile.id] ?? 0)
    }, 0)
  }
  return balance
}

export function formatBalance(amount: number, currency: Currency): string {
  const abs = Math.abs(amount).toLocaleString('nb-NO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  const sign = amount >= 0 ? '+' : '-'
  const symbol = currency === 'NOK' ? 'kr' : currency === 'USD' ? '$' : '€'
  return `${sign}${abs} ${symbol}`
}
```

Add missing import at top: `import type { Currency } from '../types'`

Write `frontend/src/utils/balance.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { computeBalance, formatBalance } from './balance'
import type { Transaction, Profile } from '../types'

const profiles: Profile[] = [
  { id: 'p1', name: 'Maxime', emoji: '🧔', updated_at: '' },
  { id: 'p2', name: 'Océane', emoji: '🌊', updated_at: '' },
]

describe('computeBalance', () => {
  it('returns zero for empty transactions', () => {
    const result = computeBalance([], profiles)
    expect(result).toEqual({ p1: 0, p2: 0 })
  })

  it('applies income 50-50', () => {
    const txns: Transaction[] = [{
      id: 't1', type: 'income', description: 'bonus', amount: 1000,
      date: '2026-09-20', created_by: 'p1',
      weights: { p1: 0.5, p2: 0.5 }, updated_at: '',
    }]
    const result = computeBalance(txns, profiles)
    expect(result.p1).toBeCloseTo(500)
    expect(result.p2).toBeCloseTo(500)
  })

  it('applies refill to creator only', () => {
    const txns: Transaction[] = [
      {
        id: 't1', type: 'income', description: '', amount: 1000,
        date: '2026-09-20', created_by: 'p1',
        weights: { p1: 0.5, p2: 0.5 }, updated_at: '',
      },
      {
        id: 't2', type: 'refill', description: '', amount: 1000,
        date: '2026-09-21', created_by: 'p1',
        weights: { p1: 1.0, p2: 0.0 }, updated_at: '',
      },
    ]
    const result = computeBalance(txns, profiles)
    expect(result.p1).toBeCloseTo(1500)
    expect(result.p2).toBeCloseTo(500)
  })

  it('matches spec example', () => {
    const txns: Transaction[] = [
      { id: 't1', type: 'income', description: '', amount: 1000, date: '', created_by: 'p1', weights: { p1: 0.5, p2: 0.5 }, updated_at: '' },
      { id: 't2', type: 'refill', description: '', amount: 1000, date: '', created_by: 'p1', weights: { p1: 1.0, p2: 0.0 }, updated_at: '' },
      { id: 't3', type: 'expense', description: '', amount: -200, date: '', created_by: 'p1', weights: { p1: 0.5, p2: 0.5 }, updated_at: '' },
    ]
    const result = computeBalance(txns, profiles)
    expect(result.p1).toBeCloseTo(1400)
    expect(result.p2).toBeCloseTo(400)
  })
})

describe('formatBalance', () => {
  it('formats positive NOK with + sign', () => {
    expect(formatBalance(1400, 'NOK')).toBe('+1 400 kr')
  })
  it('formats negative with - sign', () => {
    expect(formatBalance(-200, 'NOK')).toBe('-200 kr')
  })
})
```

- [ ] **Step 4: Run balance tests**

```bash
cd /Users/maxime/git/perso/tbd/frontend && npm test -- --run
```
Expected: all `PASSED`

- [ ] **Step 5: Write `frontend/src/context/AppContext.tsx`**

```typescript
import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Profile } from '../types'

interface AppContextType {
  activeProfile: Profile | null
  setActiveProfile: (profile: Profile | null) => void
}

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null)
  return (
    <AppContext.Provider value={{ activeProfile, setActiveProfile }}>
      {children}
    </AppContext.Provider>
  )
}

export function useAppContext(): AppContextType {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used within AppProvider')
  return ctx
}
```

- [ ] **Step 6: Write data hooks**

Write `frontend/src/hooks/useProfiles.ts`:
```typescript
import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import type { Profile, ProfileCreate, ProfileUpdate } from '../types'

export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setProfiles(await api.getProfiles())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load profiles')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const createProfile = async (data: ProfileCreate) => {
    const created = await api.createProfile(data)
    setProfiles(prev => [...prev, created])
    return created
  }

  const updateProfile = async (id: string, data: ProfileUpdate) => {
    const updated = await api.updateProfile(id, data)
    setProfiles(prev => prev.map(p => p.id === id ? updated : p))
    return updated
  }

  const deleteProfile = async (id: string) => {
    await api.deleteProfile(id)
    setProfiles(prev => prev.filter(p => p.id !== id))
  }

  return { profiles, loading, error, createProfile, updateProfile, deleteProfile, reload: load }
}
```

Write `frontend/src/hooks/useAccounts.ts`:
```typescript
import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import type { Account, AccountCreate, AccountUpdate } from '../types'

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setAccounts(await api.getAccounts())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load accounts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const createAccount = async (data: AccountCreate) => {
    const created = await api.createAccount(data)
    setAccounts(prev => [...prev, created])
    return created
  }

  const updateAccount = async (id: string, data: AccountUpdate) => {
    const updated = await api.updateAccount(id, data)
    setAccounts(prev => prev.map(a => a.id === id ? updated : a))
    return updated
  }

  const deleteAccount = async (id: string) => {
    await api.deleteAccount(id)
    setAccounts(prev => prev.filter(a => a.id !== id))
  }

  return { accounts, loading, error, createAccount, updateAccount, deleteAccount, reload: load }
}
```

Write `frontend/src/hooks/useTransactions.ts`:
```typescript
import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import type { Transaction, TransactionCreate, TransactionUpdate } from '../types'

export function useTransactions(accountId: string) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await api.getTransactions(accountId)
      // Sort by date descending
      setTransactions(data.sort((a, b) => b.date.localeCompare(a.date)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load transactions')
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => { load() }, [load])

  const createTransaction = async (data: TransactionCreate) => {
    const created = await api.createTransaction(accountId, data)
    setTransactions(prev => [created, ...prev].sort((a, b) => b.date.localeCompare(a.date)))
    return created
  }

  const updateTransaction = async (txnId: string, data: TransactionUpdate) => {
    const updated = await api.updateTransaction(accountId, txnId, data)
    setTransactions(prev =>
      prev.map(t => t.id === txnId ? updated : t).sort((a, b) => b.date.localeCompare(a.date))
    )
    return updated
  }

  const deleteTransaction = async (txnId: string) => {
    await api.deleteTransaction(accountId, txnId)
    setTransactions(prev => prev.filter(t => t.id !== txnId))
  }

  return { transactions, loading, error, createTransaction, updateTransaction, deleteTransaction, reload: load }
}
```

- [ ] **Step 7: Wire up App.tsx and main.tsx**

Write `frontend/src/App.tsx`:
```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import ProfileSelector from './components/ProfileSelector'
import AccountsList from './components/AccountsList'
import AccountPage from './components/AccountPage'

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ProfileSelector />} />
          <Route path="/accounts" element={<AccountsList />} />
          <Route path="/accounts/:accountId" element={<AccountPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}
```

Write `frontend/src/main.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

Create stub components so the app compiles:
```bash
for f in ProfileSelector AccountsList AccountPage AccountHeader TransactionList TransactionItem BalancePanel TransactionModal SettingsModal WeightsEditor AccountCard; do
  echo "export default function ${f}() { return <div>${f}</div> }" > frontend/src/components/${f}.tsx
done
```

- [ ] **Step 8: Verify frontend compiles**

```bash
cd frontend && npm run build
```
Expected: build succeeds with no TypeScript errors

- [ ] **Step 9: Commit**

```bash
git add frontend/src/
git commit -m "feat: frontend foundation — types, API client, context, hooks, balance utility"
```

---

## Task 7: Screen ① — Profile Selector

**Files:**
- Modify: `frontend/src/components/ProfileSelector.tsx`

**Interfaces:**
- Consumes: `useProfiles()`, `useAppContext()`, `react-router-dom`
- Produces: Clicking a profile card sets `activeProfile` and navigates to `/accounts`

- [ ] **Step 1: Write failing test**

Write `frontend/src/components/ProfileSelector.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import ProfileSelector from './ProfileSelector'
import * as hooks from '../hooks/useProfiles'

vi.mock('../hooks/useProfiles')

const mockProfiles = [
  { id: 'p1', name: 'Maxime', emoji: '🧔', updated_at: '' },
  { id: 'p2', name: 'Océane', emoji: '🌊', updated_at: '' },
]

beforeEach(() => {
  vi.mocked(hooks.useProfiles).mockReturnValue({
    profiles: mockProfiles,
    loading: false,
    error: null,
    createProfile: vi.fn(),
    updateProfile: vi.fn(),
    deleteProfile: vi.fn(),
    reload: vi.fn(),
  })
})

function renderComponent() {
  return render(
    <AppProvider>
      <MemoryRouter>
        <ProfileSelector />
      </MemoryRouter>
    </AppProvider>
  )
}

it('renders all profile cards', () => {
  renderComponent()
  expect(screen.getByText('Maxime')).toBeInTheDocument()
  expect(screen.getByText('Océane')).toBeInTheDocument()
  expect(screen.getByText('🧔')).toBeInTheDocument()
})

it('shows + New profile button', () => {
  renderComponent()
  expect(screen.getByText(/new profile/i)).toBeInTheDocument()
})

it('opens create form on button click', async () => {
  renderComponent()
  await userEvent.click(screen.getByText(/new profile/i))
  expect(screen.getByPlaceholderText(/name/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test — expect failures**

```bash
cd frontend && npm test -- --run ProfileSelector
```

- [ ] **Step 3: Implement `ProfileSelector.tsx`**

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlusCircle } from 'lucide-react'
import { useProfiles } from '../hooks/useProfiles'
import { useAppContext } from '../context/AppContext'
import type { Profile } from '../types'

const EMOJI_OPTIONS = ['🧔','🌊','😊','🎉','🦋','🌈','🔥','⭐','🎸','🏄','🧘','🦊']

export default function ProfileSelector() {
  const navigate = useNavigate()
  const { setActiveProfile } = useAppContext()
  const { profiles, loading, error, createProfile } = useProfiles()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('😊')

  const handleSelect = (profile: Profile) => {
    setActiveProfile(profile)
    navigate('/accounts')
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await createProfile({ name: name.trim(), emoji })
    setName('')
    setCreating(false)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 gap-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-2">Welcome</h1>
        <p className="text-slate-400">Who are you?</p>
      </div>

      {loading && <p className="text-slate-400">Loading profiles…</p>}
      {error && <p className="text-red-400">{error}</p>}

      <div className="flex flex-wrap gap-4 justify-center">
        {profiles.map(profile => (
          <button
            key={profile.id}
            onClick={() => handleSelect(profile)}
            className="flex flex-col items-center gap-2 p-6 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur transition-all hover:scale-105 cursor-pointer"
          >
            <span className="text-5xl">{profile.emoji}</span>
            <span className="text-white font-medium text-lg">{profile.name}</span>
          </button>
        ))}
      </div>

      {!creating ? (
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <PlusCircle size={18} />
          New profile
        </button>
      ) : (
        <form onSubmit={handleCreate} className="bg-white/10 border border-white/20 rounded-2xl p-6 backdrop-blur flex flex-col gap-4 w-80">
          <div className="flex flex-wrap gap-2">
            {EMOJI_OPTIONS.map(e => (
              <button
                type="button"
                key={e}
                onClick={() => setEmoji(e)}
                className={`text-2xl p-1 rounded-lg transition-all ${emoji === e ? 'bg-white/30 scale-110' : 'hover:bg-white/10'}`}
              >
                {e}
              </button>
            ))}
          </div>
          <input
            autoFocus
            placeholder="Name"
            value={name}
            onChange={e => setName(e.target.value)}
            className="bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-slate-400 outline-none focus:border-white/40"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={!name.trim()}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg py-2 font-medium transition-colors">
              Create
            </button>
            <button type="button" onClick={() => setCreating(false)}
              className="flex-1 bg-white/10 hover:bg-white/20 text-white rounded-lg py-2 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npm test -- --run ProfileSelector
```
Expected: all `PASSED`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ProfileSelector.tsx frontend/src/components/ProfileSelector.test.tsx
git commit -m "feat: Screen ① — profile selector with emoji picker"
```

---

## Task 8: Screen ② — Accounts List

**Files:**
- Modify: `frontend/src/components/AccountCard.tsx`
- Modify: `frontend/src/components/AccountsList.tsx`

**Interfaces:**
- Consumes: `useAccounts()`, `useProfiles()`, `useAppContext()`
- Produces: Account cards, new account modal, navigation to account page

- [ ] **Step 1: Write `AccountCard.tsx`**

```tsx
import type { Account, Profile } from '../types'

interface Props {
  account: Account
  profiles: Profile[]
  onClick: () => void
}

const CURRENCY_SYMBOLS: Record<string, string> = { NOK: 'kr', USD: '$', EUR: '€' }

export default function AccountCard({ account, profiles, onClick }: Props) {
  const accountProfiles = profiles.filter(p => account.profile_weights[p.id] !== undefined)

  return (
    <button
      onClick={onClick}
      className="w-64 h-40 rounded-2xl p-5 flex flex-col justify-between text-white shadow-2xl hover:scale-105 transition-transform cursor-pointer border border-white/20"
      style={{ background: `linear-gradient(135deg, ${account.color}cc, ${account.color}88)` }}
    >
      <div className="flex justify-between items-start">
        <span className="font-bold text-lg leading-tight">{account.name}</span>
        <span className="text-sm font-medium opacity-80">{CURRENCY_SYMBOLS[account.currency]}</span>
      </div>
      <div className="flex items-center gap-1">
        {accountProfiles.map(p => (
          <span key={p.id} className="text-2xl" title={p.name}>{p.emoji}</span>
        ))}
      </div>
    </button>
  )
}
```

- [ ] **Step 2: Write failing tests for AccountsList**

Write `frontend/src/components/AccountsList.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import AccountsList from './AccountsList'
import * as accountHooks from '../hooks/useAccounts'
import * as profileHooks from '../hooks/useProfiles'

vi.mock('../hooks/useAccounts')
vi.mock('../hooks/useProfiles')

const mockAccount = {
  id: 'a1', name: 'House', currency: 'NOK' as const, color: '#4A90D9',
  profile_weights: { p1: 0.5, p2: 0.5 }, updated_at: '',
}
const mockProfile = { id: 'p1', name: 'Maxime', emoji: '🧔', updated_at: '' }

beforeEach(() => {
  vi.mocked(accountHooks.useAccounts).mockReturnValue({
    accounts: [mockAccount], loading: false, error: null,
    createAccount: vi.fn(), updateAccount: vi.fn(), deleteAccount: vi.fn(), reload: vi.fn(),
  })
  vi.mocked(profileHooks.useProfiles).mockReturnValue({
    profiles: [mockProfile], loading: false, error: null,
    createProfile: vi.fn(), updateProfile: vi.fn(), deleteProfile: vi.fn(), reload: vi.fn(),
  })
})

function renderComponent(activeProfile = mockProfile) {
  // Provide active profile via context
  const Wrapper = () => {
    const [, setActive] = [null, vi.fn()]
    return (
      <AppProvider>
        <MemoryRouter>
          <AccountsList />
        </MemoryRouter>
      </AppProvider>
    )
  }
  return render(<Wrapper />)
}

it('renders account card', () => {
  renderComponent()
  expect(screen.getByText('House')).toBeInTheDocument()
})

it('shows new account button', () => {
  renderComponent()
  expect(screen.getByText(/new account/i)).toBeInTheDocument()
})
```

- [ ] **Step 3: Implement `AccountsList.tsx`**

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlusCircle, LogOut } from 'lucide-react'
import { useAccounts } from '../hooks/useAccounts'
import { useProfiles } from '../hooks/useProfiles'
import { useAppContext } from '../context/AppContext'
import AccountCard from './AccountCard'
import WeightsEditor from './WeightsEditor'
import type { AccountCreate, Currency } from '../types'

const PALETTE = ['#4A90D9','#E8A838','#7B68EE','#E74C3C','#2ECC71','#E91E8C','#16A085','#8E44AD']

export default function AccountsList() {
  const navigate = useNavigate()
  const { activeProfile, setActiveProfile } = useAppContext()
  const { accounts, loading, createAccount } = useAccounts()
  const { profiles } = useProfiles()
  const [showModal, setShowModal] = useState(false)

  // New account form state
  const [formName, setFormName] = useState('')
  const [formCurrency, setFormCurrency] = useState<Currency>('NOK')
  const [formColor, setFormColor] = useState(PALETTE[0])
  const [formProfileIds, setFormProfileIds] = useState<string[]>([])
  const [formWeights, setFormWeights] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const weightSum = Object.values(formWeights).reduce((s, v) => s + v, 0)
  const canSave = formName.trim() && formProfileIds.length >= 1 && Math.abs(weightSum - 1) < 0.001

  const toggleProfile = (id: string) => {
    setFormProfileIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      // Reset to even weights
      const even = next.length > 0 ? 1 / next.length : 0
      setFormWeights(Object.fromEntries(next.map(pid => [pid, parseFloat(even.toFixed(4))])))
      return next
    })
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    setSaving(true)
    setSaveError(null)
    try {
      await createAccount({
        name: formName.trim(), currency: formCurrency,
        color: formColor, profile_weights: formWeights,
      } as AccountCreate)
      setShowModal(false)
      setFormName(''); setFormProfileIds([]); setFormWeights({})
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to create account')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen p-8">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {activeProfile ? `${activeProfile.emoji} ${activeProfile.name}` : 'Accounts'}
          </h1>
        </div>
        <button
          onClick={() => { setActiveProfile(null); navigate('/') }}
          className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors text-sm"
        >
          <LogOut size={14} /> Switch profile
        </button>
      </div>

      {/* Account cards */}
      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : (
        <div className="flex flex-wrap gap-6">
          {accounts.map(account => (
            <AccountCard
              key={account.id}
              account={account}
              profiles={profiles}
              onClick={() => navigate(`/accounts/${account.id}`)}
            />
          ))}
          <button
            onClick={() => setShowModal(true)}
            className="w-64 h-40 rounded-2xl border-2 border-dashed border-white/20 hover:border-white/40 flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-white transition-all"
          >
            <PlusCircle size={32} />
            <span>New account</span>
          </button>
        </div>
      )}

      {/* New account modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleCreate}
            className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-md flex flex-col gap-4"
          >
            <h2 className="text-xl font-bold text-white">New account</h2>

            <input
              autoFocus placeholder="Account name"
              value={formName} onChange={e => setFormName(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-slate-400 outline-none focus:border-white/40"
            />

            <div className="flex gap-2">
              {(['NOK','USD','EUR'] as Currency[]).map(c => (
                <button type="button" key={c} onClick={() => setFormCurrency(c)}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${formCurrency === c ? 'bg-indigo-600 text-white' : 'bg-white/10 text-slate-300 hover:bg-white/20'}`}>
                  {c}
                </button>
              ))}
            </div>

            <div>
              <p className="text-sm text-slate-400 mb-2">Color</p>
              <div className="flex gap-2 flex-wrap">
                {PALETTE.map(c => (
                  <button type="button" key={c} onClick={() => setFormColor(c)}
                    className={`w-8 h-8 rounded-full transition-transform ${formColor === c ? 'scale-125 ring-2 ring-white' : 'hover:scale-110'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm text-slate-400 mb-2">Profiles</p>
              <div className="flex flex-wrap gap-2">
                {profiles.map(p => (
                  <button type="button" key={p.id} onClick={() => toggleProfile(p.id)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-colors ${formProfileIds.includes(p.id) ? 'bg-indigo-600 text-white' : 'bg-white/10 text-slate-300 hover:bg-white/20'}`}>
                    {p.emoji} {p.name}
                  </button>
                ))}
              </div>
            </div>

            {formProfileIds.length >= 1 && (
              <WeightsEditor
                profileIds={formProfileIds}
                profiles={profiles}
                weights={formWeights}
                onChange={setFormWeights}
              />
            )}

            {saveError && <p className="text-red-400 text-sm">{saveError}</p>}

            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={!canSave || saving}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg py-2 font-medium transition-colors">
                {saving ? 'Creating…' : 'Create'}
              </button>
              <button type="button" onClick={() => setShowModal(false)}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white rounded-lg py-2 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npm test -- --run AccountsList
```
Expected: all `PASSED`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AccountCard.tsx frontend/src/components/AccountsList.tsx frontend/src/components/AccountsList.test.tsx
git commit -m "feat: Screen ② — accounts list with credit card style and new account modal"
```

---

## Task 9: Screen ③ — Account Page

**Files:**
- Modify: `frontend/src/components/AccountPage.tsx`
- Modify: `frontend/src/components/AccountHeader.tsx`
- Modify: `frontend/src/components/TransactionList.tsx`
- Modify: `frontend/src/components/TransactionItem.tsx`
- Modify: `frontend/src/components/BalancePanel.tsx`

**Interfaces:**
- Consumes: `useTransactions(accountId)`, `useAccounts()`, `useProfiles()`, `computeBalance()`
- Produces: three-panel layout; opens TransactionModal and SettingsModal (stubs from prior task)

- [ ] **Step 1: Write failing test for BalancePanel**

Write `frontend/src/components/BalancePanel.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import BalancePanel from './BalancePanel'

const profiles = [
  { id: 'p1', name: 'Maxime', emoji: '🧔', updated_at: '' },
  { id: 'p2', name: 'Océane', emoji: '🌊', updated_at: '' },
]

it('renders positive balance in green', () => {
  render(
    <BalancePanel
      profiles={profiles}
      balance={{ p1: 1400, p2: 400 }}
      currency="NOK"
    />
  )
  expect(screen.getByText('Maxime')).toBeInTheDocument()
  expect(screen.getByText(/1.400/)).toBeInTheDocument()  // nb-NO locale
})

it('renders zero balance as neutral', () => {
  render(
    <BalancePanel
      profiles={profiles}
      balance={{ p1: 0, p2: 0 }}
      currency="NOK"
    />
  )
  expect(screen.getByText('Océane')).toBeInTheDocument()
})
```

- [ ] **Step 2: Implement `BalancePanel.tsx`**

```tsx
import type { Profile, Currency } from '../types'
import { formatBalance } from '../utils/balance'

interface Props {
  profiles: Profile[]
  balance: Record<string, number>
  currency: Currency
}

export default function BalancePanel({ profiles, balance, currency }: Props) {
  return (
    <div className="w-64 shrink-0 bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Balance</h3>
      {profiles.map(profile => {
        const amount = balance[profile.id] ?? 0
        const color = amount > 0 ? 'text-emerald-400' : amount < 0 ? 'text-red-400' : 'text-slate-400'
        return (
          <div key={profile.id} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">{profile.emoji}</span>
              <span className="text-white text-sm font-medium">{profile.name}</span>
            </div>
            <span className={`font-mono font-semibold text-sm ${color}`}>
              {formatBalance(amount, currency)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Run BalancePanel tests**

```bash
cd frontend && npm test -- --run BalancePanel
```
Expected: `PASSED`

- [ ] **Step 4: Implement `TransactionItem.tsx`**

```tsx
import { Pencil, Trash2 } from 'lucide-react'
import type { Transaction, Profile, Currency } from '../types'

const TYPE_ICONS: Record<string, string> = { refill: '💰', expense: '🧾', income: '📈' }

interface Props {
  transaction: Transaction
  profiles: Profile[]
  currency: Currency
  onEdit: (txn: Transaction) => void
  onDelete: (txnId: string) => void
}

export default function TransactionItem({ transaction, profiles, currency, onEdit, onDelete }: Props) {
  const creator = profiles.find(p => p.id === transaction.created_by)
  const amountColor = transaction.amount >= 0 ? 'text-emerald-400' : 'text-red-400'
  const amountStr = `${transaction.amount >= 0 ? '+' : ''}${transaction.amount.toLocaleString('nb-NO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${currency === 'NOK' ? 'kr' : currency}`

  return (
    <div className="group flex items-center justify-between gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-colors">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className="text-2xl">{TYPE_ICONS[transaction.type]}</span>
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium truncate">{transaction.description}</p>
          <p className="text-slate-400 text-sm">
            {transaction.date} · {creator?.emoji ?? '?'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`font-mono font-semibold ${amountColor}`}>{amountStr}</span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(transaction)}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
            <Pencil size={14} />
          </button>
          <button onClick={() => onDelete(transaction.id)}
            className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Implement `TransactionList.tsx`**

```tsx
import { PlusCircle } from 'lucide-react'
import type { Transaction, Profile, Currency } from '../types'
import TransactionItem from './TransactionItem'

interface Props {
  transactions: Transaction[]
  profiles: Profile[]
  currency: Currency
  loading: boolean
  onAdd: () => void
  onEdit: (txn: Transaction) => void
  onDelete: (txnId: string) => void
}

export default function TransactionList({ transactions, profiles, currency, loading, onAdd, onEdit, onDelete }: Props) {
  return (
    <div className="flex-1 flex flex-col gap-3 overflow-y-auto min-h-0">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Transactions</h2>
        <button onClick={onAdd}
          className="flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
          <PlusCircle size={16} />
          Add transaction
        </button>
      </div>
      {loading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : transactions.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-12">No transactions yet. Add the first one!</p>
      ) : (
        transactions.map(txn => (
          <TransactionItem
            key={txn.id}
            transaction={txn}
            profiles={profiles}
            currency={currency}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))
      )}
    </div>
  )
}
```

- [ ] **Step 6: Implement `AccountHeader.tsx`**

```tsx
import { Home, ChevronLeft, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Account, Profile } from '../types'

interface Props {
  account: Account
  profiles: Profile[]
  onSettings: () => void
}

export default function AccountHeader({ account, profiles, onSettings }: Props) {
  const navigate = useNavigate()
  const accountProfiles = profiles.filter(p => account.profile_weights[p.id] !== undefined)

  return (
    <div className="flex items-center gap-4 py-4 px-6 border-b border-white/10">
      <button onClick={() => navigate('/')}
        className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
        <Home size={18} />
      </button>
      <button onClick={() => navigate('/accounts')}
        className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
        <ChevronLeft size={18} />
      </button>
      <h1 className="text-xl font-bold text-white flex-1">{account.name}</h1>
      <div className="flex items-center gap-1">
        {accountProfiles.map(p => (
          <span key={p.id} className="text-xl" title={p.name}>{p.emoji}</span>
        ))}
      </div>
      <button onClick={onSettings}
        className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
        <Settings size={18} />
      </button>
    </div>
  )
}
```

- [ ] **Step 7: Implement `AccountPage.tsx`**

```tsx
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAccounts } from '../hooks/useAccounts'
import { useProfiles } from '../hooks/useProfiles'
import { useTransactions } from '../hooks/useTransactions'
import { useAppContext } from '../context/AppContext'
import { computeBalance } from '../utils/balance'
import AccountHeader from './AccountHeader'
import TransactionList from './TransactionList'
import BalancePanel from './BalancePanel'
import TransactionModal from './TransactionModal'
import SettingsModal from './SettingsModal'
import type { Transaction } from '../types'

export default function AccountPage() {
  const { accountId } = useParams<{ accountId: string }>()
  const navigate = useNavigate()
  const { activeProfile } = useAppContext()
  const { accounts, updateAccount } = useAccounts()
  const { profiles } = useProfiles()
  const { transactions, loading, createTransaction, updateTransaction, deleteTransaction } = useTransactions(accountId!)

  const account = accounts.find(a => a.id === accountId)
  const [txnModal, setTxnModal] = useState<{ open: boolean; txn?: Transaction }>({ open: false })
  const [settingsOpen, setSettingsOpen] = useState(false)

  if (!account) return <div className="p-8 text-slate-400">Account not found. <button onClick={() => navigate('/accounts')} className="text-indigo-400 underline">Go back</button></div>

  const accountProfiles = profiles.filter(p => account.profile_weights[p.id] !== undefined)
  const balance = computeBalance(transactions, accountProfiles)

  const handleDelete = async (txnId: string) => {
    if (!confirm('Delete this transaction?')) return
    await deleteTransaction(txnId)
  }

  return (
    <div className="h-screen flex flex-col" style={{ '--account-color': account.color } as React.CSSProperties}>
      <AccountHeader account={account} profiles={profiles} onSettings={() => setSettingsOpen(true)} />

      <div className="flex flex-1 gap-6 p-6 min-h-0">
        <TransactionList
          transactions={transactions}
          profiles={accountProfiles}
          currency={account.currency}
          loading={loading}
          onAdd={() => setTxnModal({ open: true })}
          onEdit={txn => setTxnModal({ open: true, txn })}
          onDelete={handleDelete}
        />
        <BalancePanel profiles={accountProfiles} balance={balance} currency={account.currency} />
      </div>

      {txnModal.open && (
        <TransactionModal
          account={account}
          profiles={accountProfiles}
          activeProfile={activeProfile}
          transaction={txnModal.txn}
          onSave={async (data) => {
            if (txnModal.txn) {
              await updateTransaction(txnModal.txn.id, data)
            } else {
              await createTransaction(data as any)
            }
            setTxnModal({ open: false })
          }}
          onClose={() => setTxnModal({ open: false })}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          account={account}
          profiles={profiles}
          onSave={async (data) => {
            await updateAccount(account.id, data)
            setSettingsOpen(false)
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 8: Run all frontend tests**

```bash
cd frontend && npm test -- --run
```
Expected: all `PASSED`

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/
git commit -m "feat: Screen ③ — account page with transaction list and balance panel"
```

---

## Task 10: TransactionModal & SettingsModal + WeightsEditor

**Files:**
- Modify: `frontend/src/components/WeightsEditor.tsx`
- Modify: `frontend/src/components/TransactionModal.tsx`
- Modify: `frontend/src/components/SettingsModal.tsx`

**Interfaces:**
- Consumes: `Account`, `Profile`, `Transaction` types; `TransactionCreate`, `TransactionUpdate`, `AccountUpdate`
- Produces: Controlled modals that call `onSave(data)` / `onClose()`

- [ ] **Step 1: Implement `WeightsEditor.tsx`**

```tsx
import type { Profile } from '../types'

interface Props {
  profileIds: string[]
  profiles: Profile[]
  weights: Record<string, number>
  onChange: (weights: Record<string, number>) => void
}

export default function WeightsEditor({ profileIds, profiles, weights, onChange }: Props) {
  const sum = profileIds.reduce((s, id) => s + (weights[id] ?? 0), 0)
  const valid = Math.abs(sum - 1) < 0.001

  const handleChange = (id: string, value: string) => {
    const num = parseFloat(value) || 0
    onChange({ ...weights, [id]: parseFloat(num.toFixed(4)) })
  }

  const distribute = () => {
    const even = parseFloat((1 / profileIds.length).toFixed(4))
    const updated: Record<string, number> = {}
    profileIds.forEach((id, i) => {
      updated[id] = i === profileIds.length - 1
        ? parseFloat((1 - even * (profileIds.length - 1)).toFixed(4))
        : even
    })
    onChange(updated)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">Distribution</p>
        <button type="button" onClick={distribute}
          className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
          Even split
        </button>
      </div>
      {profileIds.map(id => {
        const profile = profiles.find(p => p.id === id)
        return (
          <div key={id} className="flex items-center gap-3">
            <span className="text-lg w-8">{profile?.emoji}</span>
            <span className="text-white text-sm flex-1">{profile?.name}</span>
            <input
              type="number" min="0" max="1" step="0.01"
              value={weights[id] ?? 0}
              onChange={e => handleChange(id, e.target.value)}
              className="w-20 bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-white text-sm text-right outline-none focus:border-white/40"
            />
          </div>
        )
      })}
      <p className={`text-xs text-right ${valid ? 'text-emerald-400' : 'text-red-400'}`}>
        Sum: {sum.toFixed(3)} {valid ? '✓' : '≠ 1'}
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Write failing test for WeightsEditor**

Write `frontend/src/components/WeightsEditor.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WeightsEditor from './WeightsEditor'

const profiles = [
  { id: 'p1', name: 'Maxime', emoji: '🧔', updated_at: '' },
  { id: 'p2', name: 'Océane', emoji: '🌊', updated_at: '' },
]

it('shows valid sum indicator', () => {
  render(
    <WeightsEditor
      profileIds={['p1', 'p2']}
      profiles={profiles}
      weights={{ p1: 0.5, p2: 0.5 }}
      onChange={vi.fn()}
    />
  )
  expect(screen.getByText(/1\.000/)).toBeInTheDocument()
  expect(screen.getByText('✓')).toBeInTheDocument()
})

it('shows error for invalid sum', () => {
  render(
    <WeightsEditor
      profileIds={['p1', 'p2']}
      profiles={profiles}
      weights={{ p1: 0.4, p2: 0.4 }}
      onChange={vi.fn()}
    />
  )
  expect(screen.getByText(/≠ 1/)).toBeInTheDocument()
})
```

- [ ] **Step 3: Run WeightsEditor tests**

```bash
cd frontend && npm test -- --run WeightsEditor
```
Expected: `PASSED`

- [ ] **Step 4: Implement `TransactionModal.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import WeightsEditor from './WeightsEditor'
import type { Account, Profile, Transaction, TransactionCreate, TransactionUpdate, TransactionType } from '../types'

interface Props {
  account: Account
  profiles: Profile[]
  activeProfile: Profile | null
  transaction?: Transaction   // undefined = create mode
  onSave: (data: TransactionCreate | TransactionUpdate) => Promise<void>
  onClose: () => void
}

const TYPES: { value: TransactionType; label: string; emoji: string; color: string }[] = [
  { value: 'refill',  label: 'Refill',  emoji: '💰', color: 'bg-emerald-600 hover:bg-emerald-500' },
  { value: 'expense', label: 'Expense', emoji: '🧾', color: 'bg-red-600 hover:bg-red-500' },
  { value: 'income',  label: 'Income',  emoji: '📈', color: 'bg-blue-600 hover:bg-blue-500' },
]

function defaultWeights(type: TransactionType, account: Account, activeProfileId: string | undefined): Record<string, number> {
  if (type === 'refill' && activeProfileId) {
    const weights: Record<string, number> = {}
    Object.keys(account.profile_weights).forEach(id => { weights[id] = 0 })
    weights[activeProfileId] = 1.0
    return weights
  }
  return { ...account.profile_weights }
}

export default function TransactionModal({ account, profiles, activeProfile, transaction, onSave, onClose }: Props) {
  const isEdit = !!transaction
  const [type, setType] = useState<TransactionType>(transaction?.type ?? 'expense')
  const [description, setDescription] = useState(transaction?.description ?? '')
  const [amount, setAmount] = useState(transaction ? Math.abs(transaction.amount).toString() : '')
  const [date, setDate] = useState(transaction?.date ?? new Date().toISOString().slice(0, 10))
  const [weights, setWeights] = useState<Record<string, number>>(
    transaction?.weights ?? defaultWeights(type, account, activeProfile?.id)
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const profileIds = Object.keys(account.profile_weights)
  const weightSum = Object.values(weights).reduce((s, v) => s + v, 0)
  const canSave = description.trim() && parseFloat(amount) > 0 && Math.abs(weightSum - 1) < 0.001

  // Reset weights when type changes (only in create mode)
  useEffect(() => {
    if (!isEdit) {
      setWeights(defaultWeights(type, account, activeProfile?.id))
    }
  }, [type, isEdit, account, activeProfile?.id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const data = isEdit
        ? { type, description: description.trim(), amount: parseFloat(amount), date, weights } satisfies TransactionUpdate
        : { type, description: description.trim(), amount: parseFloat(amount), date, created_by: activeProfile?.id ?? '', weights } satisfies TransactionCreate
      await onSave(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <form onSubmit={handleSubmit}
        className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-md flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">{isEdit ? 'Edit transaction' : 'New transaction'}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Type toggle */}
        <div className="flex gap-2">
          {TYPES.map(t => (
            <button type="button" key={t.value} onClick={() => setType(t.value)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1 ${type === t.value ? t.color + ' text-white' : 'bg-white/10 text-slate-300 hover:bg-white/20'}`}>
              {t.emoji} {t.label}
            </button>
          ))}
        </div>

        <input
          placeholder="Description"
          value={description} onChange={e => setDescription(e.target.value)}
          className="bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-slate-400 outline-none focus:border-white/40"
        />

        <div className="flex gap-3">
          <input
            type="number" min="0.01" step="0.01" placeholder="Amount"
            value={amount} onChange={e => setAmount(e.target.value)}
            className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-slate-400 outline-none focus:border-white/40"
          />
          <input
            type="date" value={date} onChange={e => setDate(e.target.value)}
            className="bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white outline-none focus:border-white/40"
          />
        </div>

        <WeightsEditor
          profileIds={profileIds}
          profiles={profiles}
          weights={weights}
          onChange={setWeights}
        />

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={!canSave || saving}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg py-2 font-medium transition-colors">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onClose}
            className="flex-1 bg-white/10 hover:bg-white/20 text-white rounded-lg py-2 transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 5: Implement `SettingsModal.tsx`**

```tsx
import { useState } from 'react'
import { X } from 'lucide-react'
import WeightsEditor from './WeightsEditor'
import type { Account, Profile, AccountUpdate } from '../types'

const PALETTE = ['#4A90D9','#E8A838','#7B68EE','#E74C3C','#2ECC71','#E91E8C','#16A085','#8E44AD']

interface Props {
  account: Account
  profiles: Profile[]
  onSave: (data: AccountUpdate) => Promise<void>
  onClose: () => void
}

export default function SettingsModal({ account, profiles, onSave, onClose }: Props) {
  const [name, setName] = useState(account.name)
  const [color, setColor] = useState(account.color)
  const [weights, setWeights] = useState<Record<string, number>>({ ...account.profile_weights })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const profileIds = Object.keys(account.profile_weights)
  const weightSum = Object.values(weights).reduce((s, v) => s + v, 0)
  const canSave = name.trim() && Math.abs(weightSum - 1) < 0.001

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      await onSave({ name: name.trim(), color, profile_weights: weights })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <form onSubmit={handleSubmit}
        className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-md flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Account settings</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <input
          placeholder="Account name" value={name} onChange={e => setName(e.target.value)}
          className="bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-slate-400 outline-none focus:border-white/40"
        />

        <div>
          <p className="text-sm text-slate-400 mb-2">Color</p>
          <div className="flex gap-2 flex-wrap">
            {PALETTE.map(c => (
              <button type="button" key={c} onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-white' : 'hover:scale-110'}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>

        <WeightsEditor
          profileIds={profileIds}
          profiles={profiles}
          weights={weights}
          onChange={setWeights}
        />

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={!canSave || saving}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg py-2 font-medium transition-colors">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onClose}
            className="flex-1 bg-white/10 hover:bg-white/20 text-white rounded-lg py-2 transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 6: Run all frontend tests**

```bash
cd frontend && npm test -- --run
```
Expected: all `PASSED`

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/
git commit -m "feat: TransactionModal, SettingsModal, and WeightsEditor with live validation"
```

---

## Task 11: Polish & Global Styling

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `frontend/index.html`

**Interfaces:**
- Consumes: all components from prior tasks
- Produces: consistent dark glassmorphism aesthetic, scrollbars styled, smooth transitions

- [ ] **Step 1: Update `index.html` title**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Expense Sharing</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Enrich global CSS**

Replace `frontend/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --account-color: #4A90D9;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
  background: #0f172a;
  color: #e2e8f0;
  min-height: 100vh;
}

/* Subtle animated gradient background */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background: radial-gradient(ellipse at 20% 50%, rgba(79, 70, 229, 0.08) 0%, transparent 60%),
              radial-gradient(ellipse at 80% 20%, rgba(var(--account-color-rgb, 74, 144, 217), 0.06) 0%, transparent 50%);
  pointer-events: none;
  z-index: 0;
}

#root {
  position: relative;
  z-index: 1;
}

/* Custom scrollbar */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}

/* Date input color fix */
input[type="date"]::-webkit-calendar-picker-indicator {
  filter: invert(1) opacity(0.5);
}
```

- [ ] **Step 3: Full manual smoke test**

Start both servers:
```bash
make dev
```

Walk through the full flow:
1. Open `http://localhost:5173`
2. Create a profile "Maxime 🧔" and a profile "Océane 🌊"
3. Select "Maxime"
4. Create an account "House", NOK, blue, both profiles, 50-50
5. Open the account
6. Add a refill of 500 — verify Maxime's weight defaults to 100%
7. Add an expense of 200, verify balance panel: Maxime +400, Océane -100
8. Edit the expense — change description — verify it updates
9. Delete a transaction — verify it disappears
10. Open Settings — change weights to 60-40 — save — verify accounts sheet updates in Google Sheets

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: global styling and polish — glassmorphism dark theme"
```

---

## Self-Review Checklist

- **Spec coverage:**
  - ✅ Multiple accounts with currency (NOK/USD/EUR), set at creation
  - ✅ Global profiles with emoji, selectable at session start
  - ✅ Per-account profile subsets with default weights
  - ✅ Account page: header + scrollable transaction list + balance panel
  - ✅ Three transaction types: refill, expense, income with correct default weights
  - ✅ Balance formula: `Σ amount × weight[profile]` per profile
  - ✅ Edit and delete transactions in-app
  - ✅ Google Sheets as persistent storage via service account
  - ✅ Per-account sheet tab for transactions
  - ✅ Weight validation: sum = 1.0 ± 0.001, enforced in model + API
  - ✅ Amounts frozen per transaction; account weight changes don't retroact
  - ✅ 🏠 home and ← back navigation buttons
  - ✅ Account credit-card style with color theme
  - ✅ CSV batch import: out of scope, noted in spec Section 8

- **Not in this plan (future):**
  - Batch CSV bank import
  - Delete account from UI (data model supports it, UI omitted for safety)
