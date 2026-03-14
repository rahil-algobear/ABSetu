"""
Beneficiary and Enrollment schemas
"""
from datetime import date
from typing import Any

from pydantic import BaseModel, Field

from app.common.schemas.base_response import BaseResponseSchema


# --- Beneficiary ---

class BeneficiaryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    meta: dict[str, Any] | None = None


class BeneficiaryUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    meta: dict[str, Any] | None = None


class BeneficiaryResponse(BaseResponseSchema):
    organization_id: str
    case_number: str
    name: str
    meta: dict[str, Any] | None = None


# --- Enrollment ---

class EnrollmentCreate(BaseModel):
    beneficiary_id: str
    programme_center_id: str
    admission_date: date
    release_date: date | None = None
    meta: dict[str, Any] | None = None


class EnrollmentUpdate(BaseModel):
    admission_date: date | None = None
    release_date: date | None = None
    meta: dict[str, Any] | None = None


class EnrollmentResponse(BaseResponseSchema):
    beneficiary_id: str
    programme_center_id: str
    admission_date: date
    release_date: date | None = None
    meta: dict[str, Any] | None = None
    beneficiary_name: str | None = None
    programme_name: str | None = None
    center_name: str | None = None
