"""
Enrollment schemas (legacy beneficiary module — Beneficiary replaced by Entity)
"""

from typing import Any

from pydantic import BaseModel

from app.common.schemas.base_response import BaseResponseSchema


class DimensionInfo(BaseModel):
    dimension_key: str
    dimension_name: str
    value_id: str
    value_name: str
    value_code: str


# --- Enrollment ---


class EnrollmentCreate(BaseModel):
    entity_id: str
    # System fields accepted at top-level for backward compat; merged into meta by service
    admission_date: str | None = None
    release_date: str | None = None
    meta: dict[str, Any] | None = None
    dimension_value_ids: list[str] = []


class EnrollmentUpdate(BaseModel):
    # System fields accepted at top-level for backward compat; merged into meta by service
    admission_date: str | None = None
    release_date: str | None = None
    meta: dict[str, Any] | None = None


class EnrollmentResponse(BaseResponseSchema):
    organization_id: str
    entity_id: str
    # System fields extracted from meta for backward compat
    admission_date: str | None = None
    release_date: str | None = None
    meta: dict[str, Any] | None = None
    entity_name: str | None = None
    dimensions: list[DimensionInfo] = []
