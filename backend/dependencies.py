import json
import gspread
from backend.config import settings
from backend.services.sheets import SheetsService

# ── Process-level singletons ──────────────────────────────────────────────────
# Each gspread call that touches metadata (open_by_key, worksheet, worksheets)
# makes a real HTTP request against the Sheets quota.  By caching the client
# *and* the Spreadsheet object we avoid those on every API request.
#
# _sheets_initialized: once the service has verified/created the required
# worksheets (profiles, accounts) we never need to do it again for the life
# of the process — skipping it saves 1 quota hit per request.
_gc: gspread.Client | None = None
_spreadsheet: gspread.Spreadsheet | None = None
_sheets_initialized: bool = False


def _get_spreadsheet() -> gspread.Spreadsheet:
    global _gc, _spreadsheet
    if _gc is None:
        if settings.google_credentials_json:
            # Production: credentials supplied as a JSON string env var
            info = json.loads(settings.google_credentials_json)
            _gc = gspread.service_account_from_dict(info)
        else:
            # Local dev: credentials loaded from a file on disk
            _gc = gspread.service_account(filename=settings.credentials_path)
    if _spreadsheet is None:
        _spreadsheet = _gc.open_by_key(settings.spreadsheet_id)
    return _spreadsheet


def get_sheets_service() -> SheetsService:
    global _sheets_initialized
    svc = SheetsService(_get_spreadsheet(), skip_init=_sheets_initialized)
    if not _sheets_initialized:
        _sheets_initialized = True
    return svc
