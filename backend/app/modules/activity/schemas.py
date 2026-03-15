"""
Activity, ActivityType, Facilitator, Participation schemas
"""

import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.common.schemas.base_response import BaseResponseSchema

# --- Activity Type ---


class ActivityTypeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    meta: dict[str, Any] | None = None


class ActivityTypeUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    meta: dict[str, Any] | None = None


class ActivityTypeResponse(BaseResponseSchema):
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


# --- Activity ---


class ActivityCreate(BaseModel):
    activity_type_id: str
    dimension_value_ids: list[str] = []
    date: datetime.date
    notes: str | None = None
    facilitator_ids: list[str] = []
    meta: dict[str, Any] | None = None


class ActivityUpdate(BaseModel):
    date: Optional[datetime.date] = None
    notes: str | None = None
    meta: dict[str, Any] | None = None


class DimensionTagInfo(BaseModel):
    dimension_key: str
    dimension_name: str
    value_id: str
    value_name: str
    value_code: str


class ActivityResponse(BaseResponseSchema):
    organization_id: str
    activity_type_id: str
    date: datetime.date
    notes: str | None = None
    created_by: str | None = None
    meta: dict[str, Any] | None = None
    type_name: str | None = None
    facilitators: list[FacilitatorResponse] = []
    tags: list[DimensionTagInfo] = []


# --- Participation ---


class ParticipationRecord(BaseModel):
    beneficiary_id: str
    status: str = "present"
    meta: dict[str, Any] | None = None


class ParticipationBulkCreate(BaseModel):
    records: list[ParticipationRecord]


class ParticipationResponse(BaseResponseSchema):
    activity_id: str
    beneficiary_id: str
    status: str
    meta: dict[str, Any] | None = None
    beneficiary_name: str | None = None
