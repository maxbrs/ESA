import json
import time
import uuid
from datetime import datetime, timezone
from threading import RLock

import gspread

# ── Server-level read cache ───────────────────────────────────────────────────
# Survives across HTTP requests; keyed by worksheet title.
# Each entry is (expiry_monotonic: float, records: list[dict]).
# Write operations call _invalidate() which clears both this and the
# per-request cache, so callers always see fresh data after a mutation.
_SRV_CACHE: dict[str, tuple[float, list[dict]]] = {}
_SRV_LOCK  = RLock()
_SRV_TTL   = 30  # seconds — enough to absorb React re-renders and navigation bursts

from backend.models import (
    Account, AccountCreate, AccountUpdate,
    Note, NoteCreate, NoteUpdate,
    Profile, ProfileCreate, ProfileUpdate,
    Transaction, TransactionCreate, TransactionUpdate,
)


def _short_id() -> str:
    return uuid.uuid4().hex[:8]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _date_str(val: object) -> str:
    """
    Coerce a value to a date/datetime string.

    Google Sheets stores date-formatted cells as serial integers when read with
    UNFORMATTED_VALUE (e.g. 46285 = 2026-09-20).  Detect those and convert;
    otherwise return the value as a plain string.
    """
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        # Google Sheets epoch is Dec 30 1899; typical modern dates fall in ~40000-60000
        from datetime import timedelta
        base = datetime(1899, 12, 30, tzinfo=timezone.utc)
        return (base + timedelta(days=int(val))).strftime("%Y-%m-%d")
    return str(val)


class SheetsService:
    PROFILES_SHEET    = "profiles"
    ACCOUNTS_SHEET    = "accounts"
    NOTES_SHEET       = "notes"

    # Class-level set: worksheet names whose headers have already been migrated
    # this server process.  Avoids a row_values(1) API call on every request.
    _GLOBALLY_MIGRATED: set[str] = set()

    PROFILE_HEADERS     = ["id", "name", "emoji", "updated_at"]
    ACCOUNT_HEADERS     = ["id", "name", "currency", "color", "profile_weights", "updated_at"]
    TRANSACTION_HEADERS = [
        "id", "type", "description", "amount", "date",
        "created_by", "weights", "updated_at",
        "settlement_from", "settlement_to",   # added for settlement support
    ]
    NOTES_HEADERS       = ["id", "title", "content", "account_id", "created_at", "updated_at"]

    def __init__(self, spreadsheet: gspread.Spreadsheet, *, skip_init: bool = False) -> None:
        self.spreadsheet = spreadsheet

        # Per-request record cache: worksheet title → list[dict].
        # Scoped to a single HTTP request (one SheetsService instance per Depends call).
        # Invalidate explicitly after writes so read-after-write within the same request
        # always sees fresh data.
        self._cache: dict[str, list[dict]] = {}

        # Per-request worksheet-object cache: title → gspread.Worksheet.
        # gspread.Spreadsheet.worksheet(title) calls fetch_sheet_metadata() every time,
        # which counts as a quota hit.  Caching the Worksheet object after the first
        # lookup avoids repeated metadata round-trips within a single request.
        self._ws_cache: dict[str, gspread.Worksheet] = {}

        if not skip_init:
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
        if self.NOTES_SHEET not in existing:
            ws = self.spreadsheet.add_worksheet(title=self.NOTES_SHEET, rows=1000, cols=len(self.NOTES_HEADERS))
            ws.append_row(self.NOTES_HEADERS)
            self._ws_cache[self.NOTES_SHEET] = ws

    def _ws(self, title: str) -> gspread.Worksheet:
        if title not in self._ws_cache:
            # worksheet() calls fetch_sheet_metadata() → 1 quota hit.
            # Cache the object so subsequent calls within this request are free.
            self._ws_cache[title] = self.spreadsheet.worksheet(title)
        return self._ws_cache[title]

    def _get_records(self, ws: gspread.Worksheet) -> list[dict]:
        """
        Safe, two-level cached replacement for ws.get_all_records().

        Level 1 — per-request cache (self._cache): free after the first call
          within a single HTTP request.

        Level 2 — server-level TTL cache (_SRV_CACHE, 30 s): shared across all
          requests.  Absorbs the rapid duplicate calls produced by React
          re-renders and navigation events without hitting the Sheets quota.

        Uses UNFORMATTED_VALUE so that:
        - Number cells are Python numbers (not locale-formatted "-89,7").
        - Hex IDs like "9e956987" stay strings and aren't silently parsed as
          scientific notation by gspread's numericise.

        Call _invalidate(ws.title) after any write so subsequent reads see fresh
        data (both caches are cleared).
        """
        # 1. Per-request cache
        if ws.title in self._cache:
            return self._cache[ws.title]

        # 2. Server-level TTL cache
        now = time.monotonic()
        with _SRV_LOCK:
            entry = _SRV_CACHE.get(ws.title)
            if entry and entry[0] > now:
                self._cache[ws.title] = entry[1]
                return entry[1]

        # 3. Fetch from Google Sheets
        rows = ws.get_all_values(value_render_option="UNFORMATTED_VALUE")
        if len(rows) < 2:
            records: list[dict] = []
        else:
            headers = rows[0]
            records = []
            for row in rows[1:]:
                if not any(str(c) for c in row):   # skip fully empty rows
                    continue
                padded = list(row) + [""] * max(0, len(headers) - len(row))
                records.append(dict(zip(headers, padded[: len(headers)])))

        # Populate both caches
        with _SRV_LOCK:
            _SRV_CACHE[ws.title] = (now + _SRV_TTL, records)
        self._cache[ws.title] = records
        return records

    def _invalidate(self, *titles: str) -> None:
        """Drop cached records for the given sheet(s) after a write."""
        with _SRV_LOCK:
            for title in titles:
                _SRV_CACHE.pop(title, None)
        for title in titles:
            self._cache.pop(title, None)

    def _get_txn_ws(self, account_name: str) -> gspread.Worksheet:
        """Return the transaction worksheet for `account_name`.

        Checks on the *first ever access per server process* (not per request)
        whether the header row contains all columns in TRANSACTION_HEADERS.  If
        any are missing (worksheets created before settlement support was added),
        they are appended to the header row once and never checked again.

        Using a class-level set avoids a row_values(1) API call on every request.
        """
        ws = self._ws(account_name)
        if account_name not in SheetsService._GLOBALLY_MIGRATED:
            header = ws.row_values(1)
            existing = set(header)
            missing = [h for h in self.TRANSACTION_HEADERS if h not in existing]
            if missing:
                col_start = len(header) + 1
                for i, h in enumerate(missing):
                    ws.update_cell(1, col_start + i, h)
                self._invalidate(account_name)
            SheetsService._GLOBALLY_MIGRATED.add(account_name)
        return ws

    # ── Profiles ──────────────────────────────────────────────────────────────

    @staticmethod
    def _row_to_profile(r: dict) -> Profile:
        return Profile(
            id=str(r["id"]),
            name=str(r["name"]),
            emoji=str(r["emoji"]),
            updated_at=_date_str(r["updated_at"]),
        )

    def get_all_profiles(self) -> list[Profile]:
        return [self._row_to_profile(r) for r in self._get_records(self._ws(self.PROFILES_SHEET))]

    def _profile_name(self, profile_id: str) -> str:
        for r in self._get_records(self._ws(self.PROFILES_SHEET)):
            if str(r["id"]) == profile_id:
                return str(r["name"])
        return profile_id

    def create_profile(self, data: ProfileCreate) -> Profile:
        profile = Profile(id=_short_id(), name=data.name, emoji=data.emoji, updated_at=_now())
        self._ws(self.PROFILES_SHEET).append_row(
            [profile.id, profile.name, profile.emoji, profile.updated_at]
        )
        self._invalidate(self.PROFILES_SHEET)
        return profile

    def update_profile(self, profile_id: str, data: ProfileUpdate) -> Profile:
        ws = self._ws(self.PROFILES_SHEET)
        for i, r in enumerate(self._get_records(ws)):
            if str(r["id"]) == profile_id:
                updated = Profile(id=profile_id, name=data.name, emoji=data.emoji, updated_at=_now())
                ws.update(f"A{i+2}:D{i+2}", [[updated.id, updated.name, updated.emoji, updated.updated_at]])
                self._invalidate(self.PROFILES_SHEET)
                return updated
        raise ValueError(f"Profile {profile_id} not found")

    def delete_profile(self, profile_id: str) -> None:
        # Block if used in any account
        for acc_row in self._get_records(self._ws(self.ACCOUNTS_SHEET)):
            weights = json.loads(str(acc_row["profile_weights"]))
            if profile_id in weights:
                raise ValueError(f"Profile is used in account '{acc_row['name']}' and cannot be deleted")
        ws = self._ws(self.PROFILES_SHEET)
        for i, r in enumerate(self._get_records(ws)):
            if str(r["id"]) == profile_id:
                ws.delete_rows(i + 2)
                self._invalidate(self.PROFILES_SHEET)
                return
        raise ValueError(f"Profile {profile_id} not found")

    # ── Accounts ──────────────────────────────────────────────────────────────

    def _row_to_account(self, r: dict) -> Account:
        return Account(
            id=str(r["id"]),
            name=str(r["name"]),
            currency=str(r["currency"]),  # type: ignore[arg-type]
            color=str(r["color"]),
            profile_weights=json.loads(str(r["profile_weights"])),
            updated_at=_date_str(r["updated_at"]),
        )

    def get_all_accounts(self) -> list[Account]:
        return [self._row_to_account(r) for r in self._get_records(self._ws(self.ACCOUNTS_SHEET))]

    def get_account(self, account_id: str) -> Account:
        for r in self._get_records(self._ws(self.ACCOUNTS_SHEET)):
            if str(r["id"]) == account_id:
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
        self._invalidate(self.ACCOUNTS_SHEET)
        txn_ws = self.spreadsheet.add_worksheet(title=account.name, rows=10000, cols=20)
        self._ws_cache[account.name] = txn_ws   # keep ws_cache consistent
        txn_ws.append_row(self.TRANSACTION_HEADERS)
        return account

    def update_account(self, account_id: str, data: AccountUpdate) -> Account:
        ws = self._ws(self.ACCOUNTS_SHEET)
        for i, r in enumerate(self._get_records(ws)):
            if str(r["id"]) == account_id:
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
                self._invalidate(self.ACCOUNTS_SHEET)
                if data.name and data.name != old_name:
                    old_ws = self._ws(old_name)
                    old_ws.update_title(updated.name)
                    self._ws_cache.pop(old_name, None)
                    self._ws_cache[updated.name] = old_ws
                    self._invalidate(old_name)
                return updated
        raise ValueError(f"Account {account_id} not found")

    def delete_account(self, account_id: str) -> None:
        ws = self._ws(self.ACCOUNTS_SHEET)
        for i, r in enumerate(self._get_records(ws)):
            if str(r["id"]) == account_id:
                try:
                    self.spreadsheet.del_worksheet(self._ws(r["name"]))
                except gspread.WorksheetNotFound:
                    pass
                name = str(r["name"])
                ws.delete_rows(i + 2)
                self._invalidate(self.ACCOUNTS_SHEET, name)
                self._ws_cache.pop(name, None)
                return
        raise ValueError(f"Account {account_id} not found")

    # ── Transactions ──────────────────────────────────────────────────────────

    def _row_to_transaction(self, r: dict) -> Transaction:
        raw_weights = r.get("weights", "{}")
        return Transaction(
            id=str(r["id"]),
            type=str(r["type"]),  # type: ignore[arg-type]
            description=str(r["description"]),
            amount=float(r["amount"]),
            date=_date_str(r["date"]),
            created_by=str(r["created_by"]),
            weights=json.loads(str(raw_weights) if raw_weights else "{}"),
            settlement_from=str(r["settlement_from"]) if r.get("settlement_from") else None,
            settlement_to=str(r["settlement_to"])   if r.get("settlement_to")   else None,
            updated_at=_date_str(r["updated_at"]),
        )

    def get_transactions(self, account_id: str) -> list[Transaction]:
        account = self.get_account(account_id)
        return [self._row_to_transaction(r) for r in self._get_records(self._get_txn_ws(account.name))]

    def create_transaction(self, account_id: str, data: TransactionCreate) -> Transaction:
        account = self.get_account(account_id)
        signed = -data.amount if data.type == "expense" else data.amount
        description = data.description.strip()
        if data.type == "refill" and not description:
            refill_id = max(data.weights, key=lambda k: data.weights[k])
            description = f"Refill from {self._profile_name(refill_id)} on {data.date}"
        elif data.type == "settlement" and not description:
            description = (
                f"Settlement: {self._profile_name(data.settlement_from or '')} → "
                f"{self._profile_name(data.settlement_to or '')}"
            )
        txn = Transaction(
            id=_short_id(), type=data.type, description=description,
            amount=signed, date=data.date, created_by=data.created_by,
            weights=data.weights,
            settlement_from=data.settlement_from,
            settlement_to=data.settlement_to,
            updated_at=_now(),
        )
        self._get_txn_ws(account.name).append_row([
            txn.id, txn.type, txn.description, txn.amount,
            txn.date, txn.created_by, json.dumps(txn.weights), txn.updated_at,
            txn.settlement_from or "", txn.settlement_to or "",
        ], value_input_option="RAW")
        self._invalidate(account.name)
        return txn

    def batch_create_transactions(self, account_id: str, data_list: list[TransactionCreate]) -> list[Transaction]:
        """Write all transactions in a single Google Sheets API call (append_rows)."""
        account = self.get_account(account_id)
        ws = self._get_txn_ws(account.name)

        rows: list[list] = []
        txns: list[Transaction] = []

        for data in data_list:
            signed = -data.amount if data.type == "expense" else data.amount
            description = data.description.strip()
            if data.type == "refill" and not description:
                refill_id = max(data.weights, key=lambda k: data.weights[k])
                description = f"Refill from {self._profile_name(refill_id)} on {data.date}"
            elif data.type == "settlement" and not description:
                description = (
                    f"Settlement: {self._profile_name(data.settlement_from or '')} → "
                    f"{self._profile_name(data.settlement_to or '')}"
                )
            txn = Transaction(
                id=_short_id(), type=data.type, description=description,
                amount=signed, date=data.date, created_by=data.created_by,
                weights=data.weights,
                settlement_from=data.settlement_from,
                settlement_to=data.settlement_to,
                updated_at=_now(),
            )
            rows.append([
                txn.id, txn.type, txn.description, txn.amount,
                txn.date, txn.created_by, json.dumps(txn.weights), txn.updated_at,
                txn.settlement_from or "", txn.settlement_to or "",
            ])
            txns.append(txn)

        if rows:
            # RAW keeps values as-is (no locale interpretation by Google Sheets).
            # USER_ENTERED was the bug: it caused the Norwegian-locale spreadsheet
            # to reformat decimal amounts as "-89,7" and interpret hex IDs like
            # "9e956987" as scientific notation numbers.
            ws.append_rows(rows, value_input_option="RAW")
            self._invalidate(account.name)

        return txns

    def update_transaction(self, account_id: str, txn_id: str, data: TransactionUpdate) -> Transaction:
        account = self.get_account(account_id)
        ws = self._get_txn_ws(account.name)
        for i, r in enumerate(self._get_records(ws)):
            if str(r["id"]) == txn_id:
                new_type = data.type if data.type is not None else str(r["type"])
                raw_amount = data.amount if data.amount is not None else abs(float(r["amount"]))
                signed = -raw_amount if new_type == "expense" else raw_amount
                raw_weights = r.get("weights", "{}")
                updated = Transaction(
                    id=txn_id, type=new_type,  # type: ignore[arg-type]
                    description=data.description if data.description is not None else str(r["description"]),
                    amount=signed,
                    date=data.date if data.date is not None else str(r["date"]),
                    created_by=str(r["created_by"]),
                    weights=data.weights if data.weights is not None else json.loads(str(raw_weights) if raw_weights else "{}"),
                    settlement_from=data.settlement_from if data.settlement_from is not None else (str(r["settlement_from"]) if r.get("settlement_from") else None),
                    settlement_to=data.settlement_to   if data.settlement_to   is not None else (str(r["settlement_to"])   if r.get("settlement_to")   else None),
                    updated_at=_now(),
                )
                ws.update(
                    [[
                        updated.id, updated.type, updated.description, updated.amount,
                        updated.date, updated.created_by, json.dumps(updated.weights), updated.updated_at,
                        updated.settlement_from or "", updated.settlement_to or "",
                    ]],
                    f"A{i+2}:J{i+2}",
                    value_input_option="RAW",
                )
                self._invalidate(account.name)
                return updated
        raise ValueError(f"Transaction {txn_id} not found")

    def delete_transaction(self, account_id: str, txn_id: str) -> None:
        account = self.get_account(account_id)
        ws = self._ws(account.name)
        for i, r in enumerate(self._get_records(ws)):
            if str(r["id"]) == txn_id:
                ws.delete_rows(i + 2)
                self._invalidate(account.name)
                return
        raise ValueError(f"Transaction {txn_id} not found")

    # ── Notes ─────────────────────────────────────────────────────────────────

    @staticmethod
    def _row_to_note(r: dict) -> Note:
        return Note(
            id=str(r["id"]),
            title=str(r["title"]),
            content=str(r["content"]),
            account_id=str(r["account_id"]) if r.get("account_id") else None,
            created_at=str(r["created_at"]),
            updated_at=str(r["updated_at"]),
        )

    def _notes_ws(self) -> gspread.Worksheet:
        """Return the notes worksheet, creating it lazily if it doesn't exist.

        Called by every notes operation so the sheet is created on first use
        even if the server was already running when notes support was deployed.
        """
        if self.NOTES_SHEET in self._ws_cache:
            return self._ws_cache[self.NOTES_SHEET]
        try:
            ws = self.spreadsheet.worksheet(self.NOTES_SHEET)
        except gspread.exceptions.WorksheetNotFound:
            ws = self.spreadsheet.add_worksheet(
                title=self.NOTES_SHEET, rows=1000, cols=len(self.NOTES_HEADERS)
            )
            ws.append_row(self.NOTES_HEADERS)
        self._ws_cache[self.NOTES_SHEET] = ws
        return ws

    def get_all_notes(self) -> list[Note]:
        return [self._row_to_note(r) for r in self._get_records(self._notes_ws())]

    def create_note(self, data: NoteCreate) -> Note:
        note = Note(
            id=_short_id(),
            title=data.title,
            content=data.content,
            account_id=data.account_id,
            created_at=_now(),
            updated_at=_now(),
        )
        self._notes_ws().append_row(
            [note.id, note.title, note.content, note.account_id or "", note.created_at, note.updated_at],
            value_input_option="RAW",
        )
        self._invalidate(self.NOTES_SHEET)
        return note

    def update_note(self, note_id: str, data: NoteUpdate) -> Note:
        ws = self._notes_ws()
        for i, r in enumerate(self._get_records(ws)):
            if str(r["id"]) == note_id:
                updated = Note(
                    id=note_id,
                    title=data.title    if data.title    is not None else str(r["title"]),
                    content=data.content if data.content is not None else str(r["content"]),
                    account_id=data.account_id if data.account_id is not None else (str(r["account_id"]) or None),
                    created_at=str(r["created_at"]),
                    updated_at=_now(),
                )
                # Single range update: B→F (title, content, account_id, created_at, updated_at)
                ws.update(
                    [[updated.title, updated.content, updated.account_id or "", updated.created_at, updated.updated_at]],
                    f"B{i + 2}:F{i + 2}",
                    value_input_option="RAW",
                )
                self._invalidate(self.NOTES_SHEET)
                return updated
        raise ValueError(f"Note {note_id} not found")

    def delete_note(self, note_id: str) -> None:
        ws = self._notes_ws()
        for i, r in enumerate(self._get_records(ws)):
            if str(r["id"]) == note_id:
                ws.delete_rows(i + 2)
                self._invalidate(self.NOTES_SHEET)
                return
        raise ValueError(f"Note {note_id} not found")
