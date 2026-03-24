"""
Activity, ActivityType, ActivityParticipant schemas
"""

import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

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
    """Simplified form element — layout sequencer.

    Field-level config (required, visible, stage, display_type for fields)
    now lives on FieldDefinition in meta_field_schemas.

    This element only controls:
    - Which elements appear and in what order (sort_order)
    - Structural config for dimensions/participant_lists (display_type, required)
    - Title generation config (config)
    """

    type: str  # "field", "dimension", "participant_list"
    ref_key: str | None = None  # for type="field" → field key (system or custom)
    dimension_id: str | None = None  # for type="dimension"
    entity_type_id: str | None = None  # for type="participant_list"
    sort_order: int = 0
    display_type: str | None = None  # for dimensions/participant_lists only
    required: bool = False  # for dimensions/participant_lists only
    stage: str | None = None  # for dimensions/participant_lists: "create", "record", "both"
    config: dict[str, Any] | None = None  # for title generation config


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
