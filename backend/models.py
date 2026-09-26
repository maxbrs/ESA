import json
from typing import Literal
from pydantic import BaseModel, field_validator, model_validator

Currency = Literal["NOK", "USD", "EUR"]
TransactionType = Literal["refill", "expense", "income", "settlement"]


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
    amount: float           # signed: negative for expenses, positive for others
    date: str               # YYYY-MM-DD
    created_by: str         # profile id
    weights: dict[str, float]
    settlement_from: str | None = None   # profile id — settlements only
    settlement_to:   str | None = None   # profile id — settlements only
    updated_at: str


class TransactionCreate(BaseModel):
    type: TransactionType
    description: str = ""
    amount: float           # always positive; backend applies sign based on type
    date: str
    created_by: str
    weights: dict[str, float] = {}
    settlement_from: str | None = None
    settlement_to:   str | None = None

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("amount must be positive")
        return v

    @model_validator(mode="after")
    def check_consistency(self) -> "TransactionCreate":
        if self.type == "settlement":
            if not self.settlement_from or not self.settlement_to:
                raise ValueError("settlement requires both settlement_from and settlement_to")
            if self.settlement_from == self.settlement_to:
                raise ValueError("settlement_from and settlement_to must be different profiles")
        else:
            if abs(sum(self.weights.values()) - 1.0) > 0.001:
                raise ValueError("weights must sum to 1.0")
        return self


class TransactionBatchCreate(BaseModel):
    transactions: list[TransactionCreate]


class TransactionUpdate(BaseModel):
    type: TransactionType | None = None
    description: str | None = None
    amount: float | None = None    # always positive when provided
    date: str | None = None
    weights: dict[str, float] | None = None
    settlement_from: str | None = None
    settlement_to:   str | None = None

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: float | None) -> float | None:
        if v is not None and v <= 0:
            raise ValueError("amount must be positive")
        return v

    @field_validator("weights")
    @classmethod
    def weights_sum_to_one(cls, v: dict[str, float] | None) -> dict[str, float] | None:
        # Only validated when weights are explicitly provided (non-settlements pass None)
        if v is not None and len(v) > 0 and abs(sum(v.values()) - 1.0) > 0.001:
            raise ValueError("weights must sum to 1.0")
        return v


# --- Note ---

class Note(BaseModel):
    id: str
    title: str
    content: str
    account_id: str | None = None
    created_at: str
    updated_at: str


class NoteCreate(BaseModel):
    title: str
    content: str = ""
    account_id: str | None = None


class NoteUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    account_id: str | None = None
