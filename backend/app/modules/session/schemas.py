"""
Session, SessionTemplate, Facilitator, Attendance schemas
"""
from datetime import date
from typing import Any

from pydantic import BaseModel, Field

from app.common.schemas.base_response import BaseResponseSchema


# --- Session Template ---

class SessionTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    meta: dict[str, Any] | None = None


class SessionTemplateUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    meta: dict[str, Any] | None = None


class SessionTemplateResponse(BaseResponseSchema):
    organization_id: str
    name: str
    description: str | None = None
    meta: dict[str, Any] | None = None


# --- Facilitator ---

class FacilitatorCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    contact: str | None = None
    meta: dict[str, Any] | None = None


class FacilitatorUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    contact: str | None = None
    meta: dict[str, Any] | None = None


class FacilitatorResponse(BaseResponseSchema):
    organization_id: str
    name: str
    contact: str | None = None
    meta: dict[str, Any] | None = None


# --- Session ---

class SessionCreate(BaseModel):
    session_template_id: str
    programme_center_id: str
    date: date
    notes: str | None = None
    facilitator_ids: list[str] = []
    meta: dict[str, Any] | None = None


class SessionUpdate(BaseModel):
    date: date | None = None
    notes: str | None = None
    meta: dict[str, Any] | None = None


class SessionResponse(BaseResponseSchema):
    session_template_id: str
    programme_center_id: str
    date: date
    notes: str | None = None
    created_by: str | None = None
    meta: dict[str, Any] | None = None
    template_name: str | None = None
    programme_name: str | None = None
    center_name: str | None = None
    facilitators: list[FacilitatorResponse] = []


# --- Attendance ---

class AttendanceRecord(BaseModel):
    beneficiary_id: str
    status: str = "present"


class AttendanceBulkCreate(BaseModel):
    records: list[AttendanceRecord]


class AttendanceResponse(BaseResponseSchema):
    session_id: str
    beneficiary_id: str
    status: str
    beneficiary_name: str | None = None
