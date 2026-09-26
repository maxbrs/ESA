from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from backend.dependencies import get_sheets_service
from backend.services.sheets import SheetsService
from backend.models import Transaction, TransactionCreate, TransactionUpdate, TransactionBatchCreate

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


@router.post("/accounts/{account_id}/transactions/batch", response_model=list[Transaction], status_code=201)
def batch_create_transactions(account_id: str, data: TransactionBatchCreate, sheets: SheetsDep):
    if not data.transactions:
        raise HTTPException(status_code=400, detail="No transactions provided")
    try:
        return sheets.batch_create_transactions(account_id, data.transactions)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/accounts/{account_id}/transactions/{txn_id}", status_code=204)
def delete_transaction(account_id: str, txn_id: str, sheets: SheetsDep):
    try:
        sheets.delete_transaction(account_id, txn_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
