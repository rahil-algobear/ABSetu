"""
Enrollment schemas (legacy beneficiary module — Beneficiary replaced by Entity)
"""

from datetime import date
from typing import Any

from pydantic import BaseModel

from app.common.schemas.base_response import BaseResponseSchema


class DimensionTagInfo(BaseModel):
    dimension_key: str
    dimension_name: str
    value_id: str
    value_name: str
    value_code: str


# --- Enrollment ---


class EnrollmentCreate(BaseModel):
    entity_id: str
    admission_date: date
    release_date: date | None = None
    meta: dict[str, Any] | None = None
    dimension_value_ids: list[str] = []


class EnrollmentUpdate(BaseModel):
    admission_date: date | None = None
    release_date: date | None = None
    meta: dict[str, Any] | None = None


class EnrollmentResponse(BaseResponseSchema):
    organization_id: str
    entity_id: str
    admission_date: date
    release_date: date | None = None
    meta: dict[str, Any] | None = None
    entity_name: str | None = None
    tags: list[DimensionTagInfo] = []
