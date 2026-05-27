"""
Activity, ActivityType, ActivityParticipant schemas
"""

from typing import Any, Literal

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


# --- Activity ---


class DimensionInfo(BaseModel):
    dimension_id: str
    dimension_key: str
    dimension_name: str
    value_id: str
    value_name: str
    value_code: str


class ActivityCreate(BaseModel):
    activity_type_id: str | None = None
    dimension_value_ids: list[str] = []
    meta: dict[str, Any] | None = None


class ActivityUpdate(BaseModel):
    meta: dict[str, Any] | None = None


class ActivityResponse(BaseResponseSchema):
    organization_id: str
    activity_type_id: str | None = None
    created_by: str | None = None
    created_by_name: str | None = None
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


class ParticipantSectionRecord(BaseModel):
    """Row for the section-scoped bulk save. section_key comes from the
    query param so the body is just the rows."""

    participant_type: str
    participant_id: str
    status: str | None = None
    meta: dict[str, Any] | None = None


class ParticipantSectionReplace(BaseModel):
    records: list[ParticipantSectionRecord]


class ParticipantResponse(BaseResponseSchema):
    activity_id: str
    participant_type: str
    participant_id: str
    section_key: str
    status: str | None = None
    meta: dict[str, Any] | None = None


# --- Smart picker (Phase 3) — per-action payloads ---


class PickerAddPayload(BaseModel):
    """Add a participant via the picker.

    Smart-mode entity rows: beneficiary already has an active enrollment
    in scope (verified server-side). Basic-mode entity rows (non-enrollable
    type or dimensionless activity) and user rows skip the scope check
    and just record the participant.

    `entity_id` carries the user id when `participant_type == "user"` —
    name kept for back-compat with the original Smart-only payload."""

    entity_id: str
    section_key: str
    participant_type: Literal["entity", "user"] = "entity"


class PickerEnrollAndAddPayload(BaseModel):
    """Beneficiary exists but has no active enrollment in scope. Create
    a new active enrollment (using the activity's dimensions plus any
    extras the user filled), then add as participant."""

    entity_id: str
    section_key: str
    enrollment_meta: dict[str, Any] | None = None
    enrollment_dimension_value_ids: list[str] = []


class PickerCreateAndAddPayload(BaseModel):
    """Beneficiary doesn't exist yet. Create entity + enrollment + add
    as participant, all in one transaction."""

    entity_type_id: str
    entity_meta: dict[str, Any] | None = None
    entity_dimension_value_ids: list[str] = []
    section_key: str
    enrollment_meta: dict[str, Any] | None = None
    enrollment_dimension_value_ids: list[str] = []
