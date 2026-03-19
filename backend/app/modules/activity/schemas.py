"""
Activity, ActivityCategory, ActivityParticipant schemas
"""

import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.common.schemas.base_response import BaseResponseSchema

# --- Activity Category ---


class ActivityCategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    sort_order: int = 0


class ActivityCategoryUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    sort_order: int | None = None


class ActivityCategoryResponse(BaseResponseSchema):
    organization_id: str
    name: str
    key: str
    sort_order: int = 0


# --- Activity Form ---


class ActivityFormElement(BaseModel):
    type: str  # "dimension", "entity_type", "activity_meta"
    ref_id: str | None = None  # dimension_id, entity_type_id, or "user"
    sort_order: int = 0
    display_type: str = "dropdown"  # "dropdown", "checklist", "radio", "search_select"
    visible: bool = True
    required: bool = False
    config: dict[str, Any] | None = None  # element-specific config


class ActivityFormCreate(BaseModel):
    activity_category_id: str
    elements: list[ActivityFormElement] = []


class ActivityFormUpdate(BaseModel):
    elements: list[ActivityFormElement] = []


class ActivityFormResponse(BaseResponseSchema):
    organization_id: str
    activity_category_id: str
    elements: list[dict[str, Any]] = []


# --- Activity ---


class DimensionInfo(BaseModel):
    dimension_key: str
    dimension_name: str
    value_id: str
    value_name: str
    value_code: str


class ActivityCreate(BaseModel):
    category_id: str | None = None
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
    category_id: str | None = None
    date: datetime.date
    notes: str | None = None
    created_by: str | None = None
    meta: dict[str, Any] | None = None
    category_name: str | None = None
    dimensions: list[DimensionInfo] = []


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
