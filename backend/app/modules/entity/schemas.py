"""
Entity and EntityType schemas
"""

from typing import Any

from pydantic import BaseModel, Field

from app.common.schemas.base_response import BaseResponseSchema

# --- EntityType ---


class EntityTypeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    config: dict[str, Any] | None = None
    sort_order: int = 0


class EntityTypeUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    config: dict[str, Any] | None = None
    sort_order: int | None = None


class EntityTypeResponse(BaseResponseSchema):
    organization_id: str
    name: str
    key: str
    config: dict[str, Any] | None = None
    sort_order: int = 0


# --- Entity ---


class DimensionInfo(BaseModel):
    dimension_key: str
    dimension_name: str
    value_id: str
    value_name: str
    value_code: str


class EntityCreate(BaseModel):
    entity_type_id: str
    meta: dict[str, Any] | None = None
    dimension_value_ids: list[str] = []


class EntityUpdate(BaseModel):
    meta: dict[str, Any] | None = None


class EntityResponse(BaseResponseSchema):
    organization_id: str
    entity_type_id: str
    code: str | None = None
    created_at: str | None = None
    created_by: str | None = None
    created_by_name: str | None = None
    meta: dict[str, Any] | None = None
    entity_type_name: str | None = None
    entity_type_key: str | None = None
    entity_type_config: dict[str, Any] | None = None
    dimensions: list[DimensionInfo] = []
    enrollment_count: int = 0
    activity_count: int = 0
