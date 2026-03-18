"""
Activity, ActivityType, ActivityCategory, ActivityParticipant schemas
"""

import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.common.schemas.base_response import BaseResponseSchema

# --- Activity Category ---


class ActivityCategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    sections: list[dict[str, Any]] | None = None
    sort_order: int = 0


class ActivityCategoryUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    sections: list[dict[str, Any]] | None = None
    sort_order: int | None = None


class ActivityCategoryResponse(BaseResponseSchema):
    organization_id: str
    name: str
    key: str
    sections: list[dict[str, Any]] | None = None
    sort_order: int = 0


# --- Activity Type ---


class ActivityTypeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    category_id: str | None = None
    description: str | None = None
    meta: dict[str, Any] | None = None


class ActivityTypeUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    category_id: str | None = None
    description: str | None = None
    meta: dict[str, Any] | None = None


class ActivityTypeResponse(BaseResponseSchema):
    organization_id: str
    category_id: str | None = None
    name: str
    description: str | None = None
    meta: dict[str, Any] | None = None
    category_name: str | None = None


# --- Activity ---


class DimensionTagInfo(BaseModel):
    dimension_key: str
    dimension_name: str
    value_id: str
    value_name: str
    value_code: str


class ActivityCreate(BaseModel):
    activity_type_id: str
    dimension_value_ids: list[str] = []
    date: datetime.date
    notes: str | None = None
    meta: dict[str, Any] | None = None


class ActivityUpdate(BaseModel):
    date: Optional[datetime.date] = None
    notes: str | None = None
    meta: dict[str, Any] | None = None


class ActivityResponse(BaseResponseSchema):
    organization_id: str
    activity_type_id: str
    date: datetime.date
    notes: str | None = None
    created_by: str | None = None
    meta: dict[str, Any] | None = None
    type_name: str | None = None
    category_name: str | None = None
    tags: list[DimensionTagInfo] = []


# --- Activity Participant ---


class ParticipantRecord(BaseModel):
    participant_type: str  # "entity" or "user"
    participant_id: str
    section_key: str
    status: str | None = None
    meta: dict[str, Any] | None = None


class ParticipantBulkCreate(BaseModel):
    records: list[ParticipantRecord]


class ParticipantResponse(BaseResponseSchema):
    activity_id: str
    participant_type: str
    participant_id: str
    section_key: str
    status: str | None = None
    meta: dict[str, Any] | None = None
    participant_name: str | None = None
