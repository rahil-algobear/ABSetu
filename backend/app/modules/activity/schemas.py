"""
Activity, ActivityType, ActivityParticipant schemas
"""

import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, model_validator

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
    start_date: datetime.datetime
    end_date: datetime.datetime | None = None
    notes: str | None = None
    meta: dict[str, Any] | None = None


class ActivityUpdate(BaseModel):
    title: str | None = None
    start_date: Optional[datetime.datetime] = None
    end_date: Optional[datetime.datetime] = None
    notes: str | None = None
    meta: dict[str, Any] | None = None


_ACTIVITY_DATETIME_ISO_FIELDS = frozenset({"start_date", "end_date"})


class ActivityResponse(BaseResponseSchema):
    organization_id: str
    activity_type_id: str | None = None
    title: str | None = None
    start_date: str
    end_date: str | None = None
    notes: str | None = None
    created_by: str | None = None
    created_at: float | None = None
    meta: dict[str, Any] | None = None
    activity_type_name: str | None = None
    dimensions: list[DimensionInfo] = []
    participant_count: int = 0

    @model_validator(mode="before")
    @classmethod
    def _dates_to_iso(cls, data: Any) -> Any:
        """Convert start_date/end_date to ISO strings before the base
        validator would turn them into Unix timestamps."""
        from datetime import date as _date

        def _to_iso(v: Any) -> Any:
            if isinstance(v, datetime.datetime):
                return v.isoformat()
            if isinstance(v, _date):
                return v.isoformat()
            return v

        if isinstance(data, dict):
            for f in _ACTIVITY_DATETIME_ISO_FIELDS:
                if f in data:
                    data[f] = _to_iso(data[f])
        elif hasattr(data, "__dict__"):
            # ORM model: convert to dict so we can override date fields
            # before the parent validator converts all datetimes to timestamps.
            out: dict[str, Any] = {}
            for name in cls.model_fields:
                val = getattr(data, name, None)
                if name in _ACTIVITY_DATETIME_ISO_FIELDS:
                    out[name] = _to_iso(val)
                else:
                    out[name] = val
            return out
        return data


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
