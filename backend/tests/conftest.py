import pytest
from unittest.mock import MagicMock, patch
import gspread


def make_mock_worksheet(title: str, records: list[dict]) -> MagicMock:
    ws = MagicMock(spec=gspread.Worksheet)
    ws.title = title
    # _get_records() calls get_all_values(value_render_option=...) and builds
    # dicts from the resulting 2-D list — mock it accordingly.
    if records:
        headers = list(records[0].keys())
        rows = [headers] + [[r.get(h, "") for h in headers] for r in records]
    else:
        rows = []
    ws.get_all_values.return_value = rows
    return ws


@pytest.fixture
def mock_spreadsheet():
    return MagicMock(spec=gspread.Spreadsheet)
