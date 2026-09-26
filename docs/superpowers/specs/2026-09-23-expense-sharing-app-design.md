# Expense Sharing App — Design Spec
**Date:** 2026-09-23  
**Status:** Approved  
**Working name:** TBD

---

## 1. Overview

A locally-run web application for tracking and sharing expenses across groups of people — inspired by Tricount. Multiple "accounts" (e.g. "House expenses", "Road trip") each hold a list of transactions split across a set of named profiles. A live balance panel shows each person's running total at all times.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| Backend | Python 3.11+ + FastAPI + gspread |
| Data store | Google Sheets (via service account) |
| Dev runner | Makefile (`make dev` starts both servers) |

**Architecture:**
```
[Browser]
   ↕ HTTP (Vite proxies /api/* → localhost:8000)
[React + Vite + TypeScript]  ←→  [FastAPI + gspread]  ←→  [Google Sheets]
```

No authentication layer. A service account JSON key (`credentials.json`, gitignored) grants the backend read/write access to the spreadsheet. Secrets live in `.env` (also gitignored).

---

## 3. Data Model

One Google Spreadsheet contains **2 global tabs** + **one tab per account**.

### 3.1 `profiles` tab

| id | name | emoji | updated_at |
|---|---|---|---|
| p1 | Maxime | 🧔 | 2026-09-23 |
| p2 | Océane | 🌊 | 2026-09-23 |

### 3.2 `accounts` tab *(global index)*

| id | name | currency | color | profile_weights | updated_at |
|---|---|---|---|---|---|
| a1 | House | NOK | #4A90D9 | `{"p1":0.5,"p2":0.5}` | 2026-09-23 |
| a2 | Road trip | NOK | #E8A838 | `{"p1":0.6,"p2":0.4}` | 2026-09-23 |

- `currency`: one of `NOK`, `USD`, `EUR` — set at creation, never changed
- `color`: hex value chosen from a curated palette at account creation
- `profile_weights`: JSON map of `{profile_id: weight}`. Must sum to 1.0. Represents the default distribution for new expense/income transactions in this account.

### 3.3 Per-account transaction tab *(one tab per account)*

Tab is named after the account (e.g. `House`, `Road trip`).

| id | type | description | amount | date | created_by | weights | updated_at |
|---|---|---|---|---|---|---|---|
| t1 | expense | Groceries | -200 | 2026-09-20 | p1 | `{"p1":0.5,"p2":0.5}` | 2026-09-23 |
| t2 | refill | Maxime deposit | 500 | 2026-09-21 | p1 | `{"p1":1.0,"p2":0.0}` | 2026-09-23 |
| t3 | income | Refund IKEA | 150 | 2026-09-22 | p2 | `{"p1":0.5,"p2":0.5}` | 2026-09-23 |

**Field notes:**
- `type`: one of `refill`, `expense`, `income`
- `amount`: always signed — expenses are negative, refills and incomes are positive
- `date`: the actual transaction date (user-entered), not the record creation date
- `created_by`: profile id of the profile active at time of entry
- `weights`: JSON map, frozen at creation time. Validated: `abs(sum(weights.values()) - 1.0) < 0.001`
- `updated_at`: last write timestamp (set by backend on create or edit)

**Default weights by transaction type:**

| Type | Default weights |
|---|---|
| `refill` | `{current_user: 1.0, all_others: 0.0}` |
| `expense` | account's `profile_weights` |
| `income` | account's `profile_weights` |

Weights can be manually overridden per transaction. The backend always validates sum = 1 before writing, regardless of type.

---

## 4. Balance Calculation

Computed on the frontend from the full transaction list. No dedicated endpoint needed.

```
balance(profile) = Σ transaction.amount × transaction.weights[profile.id]
                   over all transactions in the account
```

- **Positive balance** → person is owed money (they've contributed more than their share)
- **Negative balance** → person owes money
- **Zero** → perfectly balanced

### Example

| Event | Maxime | Océane |
|---|---|---|
| Income +1000, weights 50/50 | +500 | +500 |
| Refill +1000 by Maxime (M=1.0, O=0.0) | **+1500** | +500 |
| Expense −200, weights 50/50 | **+1400** | **+400** |

---

## 5. UI & Navigation

### Screen ① — Profile selector *(landing page)*

- Centered layout
- Each global profile shown as a card: emoji + name
- Click to "become" that profile for the session
- `+ New profile` button (name + emoji picker)
- Session state stored in React context (`AppContext`)

### Screen ② — Accounts list

- Top bar: `Hello, Maxime 🧔` + `Switch profile` link
- Account cards styled as **credit cards**: rounded corners, depth shadow, account color as background, account name + currency + participating profile emojis displayed on face
- `+ New account` button → modal: name, currency selector (NOK/USD/EUR), color palette picker, profile selection with weight inputs (live sum indicator)

### Screen ③ — Account page *(main working surface)*

```
┌──────────────────────────────────────────────────────────────┐
│  🏠  ←  House expenses   🧔 🌊   ⚙ Settings                 │
├─────────────────────────────────────┬────────────────────────┤
│                                     │                        │
│  TRANSACTION LIST (scrollable)      │  BALANCE PANEL         │
│  ────────────────                   │  ──────────────        │
│  🧾 Groceries         −200 NOK      │  🧔 Maxime  +1 400     │
│     2026-09-20 · by 🧔              │  🌊 Océane    +400     │
│                                     │                        │
│  💰 Maxime deposit    +500 NOK      │                        │
│     2026-09-21 · by 🧔              │                        │
│                                     │                        │
│  [+ Add transaction]                │                        │
└─────────────────────────────────────┴────────────────────────┘
```

- **Header**: account name, profile emoji pills, `🏠` home button (→ ①), `←` back button (→ ②), `⚙ Settings`
- **Transaction list**: sorted by date descending. Each row: type icon · description · amount (signed, color-coded green/red) · date · creator emoji. On hover: `✏️` edit and `🗑` delete actions.
- **Balance panel**: always visible, updates instantly. Positive balances in green, negative in red.

### Screen ④ — Settings modal

- Edit account name
- Edit `color` (color palette)
- Per-profile default weight inputs with live sum indicator (`0.5 + 0.5 = 1.0 ✓`)
- Add/remove profiles from account
- `Save` button (disabled if weights don't sum to 1)

### Screen ⑤ — Add / Edit transaction modal

- **Type toggle**: `💰 Refill` / `🧾 Expense` / `📈 Income` — color-coded, visually distinct
- Description (text input)
- Amount (always entered as positive — sign handled automatically by type)
- Date picker (defaults to today)
- **Weights editor**: one numeric input per profile, live running total (`0.5 + 0.5 = 1.0 ✓`)
  - Pre-filled with type defaults (see Section 3.3)
- `Save` button (disabled until weights valid and required fields filled)
- In edit mode: pre-populated with existing values

---

## 6. API Design

Base URL: `http://localhost:8000/api` (proxied transparently by Vite)

### Profiles

```
GET    /api/profiles                              → list all profiles
POST   /api/profiles                              → create {name, emoji}
PUT    /api/profiles/{profile_id}                 → edit {name, emoji}
DELETE /api/profiles/{profile_id}                 → delete profile (blocked if profile belongs to any account — UI shows an error)
```

### Accounts

```
GET    /api/accounts                              → list all accounts
POST   /api/accounts                              → create {name, currency, color, profile_weights}
GET    /api/accounts/{account_id}                 → get account details
PUT    /api/accounts/{account_id}                 → update {name, color, profile_weights}
DELETE /api/accounts/{account_id}                 → delete account + its sheet tab
```

### Transactions

```
GET    /api/accounts/{account_id}/transactions              → list all transactions
POST   /api/accounts/{account_id}/transactions              → add transaction
PUT    /api/accounts/{account_id}/transactions/{txn_id}     → edit transaction
DELETE /api/accounts/{account_id}/transactions/{txn_id}     → delete transaction
```

---

## 7. Project Structure

```
tbd/
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.ts            # fetch wrapper for all API calls
│   │   ├── components/
│   │   │   ├── ProfileSelector.tsx  # Screen ①
│   │   │   ├── AccountCard.tsx      # Credit-card styled component
│   │   │   ├── AccountsList.tsx     # Screen ②
│   │   │   ├── AccountPage.tsx      # Screen ③ layout shell
│   │   │   ├── AccountHeader.tsx
│   │   │   ├── TransactionList.tsx
│   │   │   ├── TransactionItem.tsx
│   │   │   ├── TransactionModal.tsx # Screen ⑤
│   │   │   ├── BalancePanel.tsx
│   │   │   └── SettingsModal.tsx    # Screen ④
│   │   ├── context/
│   │   │   └── AppContext.tsx       # active profile, session state
│   │   ├── hooks/
│   │   │   ├── useProfiles.ts
│   │   │   ├── useAccounts.ts
│   │   │   └── useTransactions.ts
│   │   ├── utils/
│   │   │   └── balance.ts           # balance calculation
│   │   ├── types/
│   │   │   └── index.ts             # shared TypeScript interfaces
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── vite.config.ts               # proxies /api/* → localhost:8000
│   ├── tsconfig.json
│   └── package.json
│
├── backend/
│   ├── main.py                      # FastAPI app, CORS, router registration
│   ├── routers/
│   │   ├── profiles.py
│   │   ├── accounts.py
│   │   └── transactions.py
│   ├── services/
│   │   └── sheets.py                # all gspread logic
│   ├── models.py                    # Pydantic request/response models
│   ├── config.py                    # reads .env
│   └── requirements.txt
│
├── .env                             # gitignored — SPREADSHEET_ID, CREDENTIALS_PATH
├── credentials.json                 # gitignored — Google service account key
├── Makefile                         # `make dev` starts both servers
└── .gitignore
```

---

## 8. Out of Scope (for now)

- **Batch CSV import from bank** — noted as a future feature, to be designed separately
- **Multi-device sync** — the Google Sheet naturally provides this, but no real-time push (page refresh required)
- **Changing account currency** after creation — not supported by design
- **Changing profile weights retroactively** — done manually in the Google Sheet if ever needed
- **Offline mode** — app requires internet access for Google Sheets API

---

## 9. Setup Notes (for README)

1. Create a Google Cloud project, enable the Sheets API, create a service account, download `credentials.json`
2. Create a Google Spreadsheet, share it with the service account email
3. Copy `.env.example` → `.env`, fill in `SPREADSHEET_ID`
4. `make dev` — starts FastAPI on :8000 and Vite on :5173
5. Open `http://localhost:5173`
