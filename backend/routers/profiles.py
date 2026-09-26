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
