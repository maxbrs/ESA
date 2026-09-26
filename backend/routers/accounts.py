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
