"""
Activity, ActivityType, ActivityParticipant schemas
"""

import datetime
from typing import Annotated, Any, Optional

from pydantic import BaseModel, BeforeValidator, Field


def _coerce_date_to_datetime(v: Any) -> Any:
    """Accept date-only strings (e.g. '2026-03-22') as midnight UTC datetimes."""
    if isinstance(v, str) and len(v) == 10 and "T" not in v:
        try:
            datetime.date.fromisoformat(v)
            return v + "T00:00:00+00:00"
        except ValueError:
            pass
    return v


FlexibleDatetime = Annotated[datetime.datetime, BeforeValidator(_coerce_date_to_datetime)]

from app.common.schemas.base_response import BaseResponseSchema

# --- Activity Type ---


class ActivityTypeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    sort_order: int = 0


class ActivityTypeUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    sort_order: int | None = None


class ActivityTypeResponse(BaseResponseSchema):
    organization_id: str
    name: str
    key: str
    sort_order: int = 0


# --- Activity Form ---


class ActivityFormElement(BaseModel):
    type: str  # "default", "dimension", "entity_type", "activity_meta"
    ref_id: str | None = None  # dimension_id, entity_type_id, "user", or default field name
    sort_order: int = 0
    display_type: str = "dropdown"  # "dropdown", "checklist", "radio", "search_select", "date_range", "textarea"
    visible: bool = True
    required: bool = False
    stage: str = "create"  # "create" or "record"
    removable: bool = True
    config: dict[str, Any] | None = None  # element-specific config


class ActivityFormCreate(BaseModel):
    activity_type_id: str
    elements: list[ActivityFormElement] = []


class ActivityFormUpdate(BaseModel):
    elements: list[ActivityFormElement] = []


class ActivityFormResponse(BaseResponseSchema):
    organization_id: str
    activity_type_id: str
    elements: list[dict[str, Any]] = []


# --- Activity ---


class DimensionInfo(BaseModel):
    dimension_key: str
    dimension_name: str
    value_id: str
    value_name: str
    value_code: str


class ActivityCreate(BaseModel):
    activity_type_id: str | None = None
    dimension_value_ids: list[str] = []
    title: str | None = None
    start_date: FlexibleDatetime
    end_date: FlexibleDatetime | None = None
    notes: str | None = None
    meta: dict[str, Any] | None = None


class ActivityUpdate(BaseModel):
    title: str | None = None
    start_date: Optional[FlexibleDatetime] = None
    end_date: Optional[FlexibleDatetime] = None
    notes: str | None = None
    meta: dict[str, Any] | None = None


class ActivityResponse(BaseResponseSchema):
    organization_id: str
    activity_type_id: str | None = None
    title: str | None = None
    start_date: str
    end_date: str | None = None
    notes: str | None = None
    created_by: str | None = None
    meta: dict[str, Any] | None = None
    activity_type_name: str | None = None
    dimensions: list[DimensionInfo] = []
    participant_count: int = 0


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
