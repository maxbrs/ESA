from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from backend.dependencies import get_sheets_service
from backend.services.sheets import SheetsService
from backend.models import Note, NoteCreate, NoteUpdate

router = APIRouter()
SheetsDep = Annotated[SheetsService, Depends(get_sheets_service)]


@router.get("/notes", response_model=list[Note])
def list_notes(sheets: SheetsDep):
    return sheets.get_all_notes()


@router.post("/notes", response_model=Note, status_code=201)
def create_note(data: NoteCreate, sheets: SheetsDep):
    return sheets.create_note(data)


@router.put("/notes/{note_id}", response_model=Note)
def update_note(note_id: str, data: NoteUpdate, sheets: SheetsDep):
    try:
        return sheets.update_note(note_id, data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/notes/{note_id}", status_code=204)
def delete_note(note_id: str, sheets: SheetsDep):
    try:
        sheets.delete_note(note_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
