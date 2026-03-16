"""
Entity and EntityType schemas
"""

from typing import Any

from pydantic import BaseModel, Field

from app.common.schemas.base_response import BaseResponseSchema

# --- EntityType ---


class EntityTypeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    key: str = Field(..., min_length=1, max_length=100)
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


class DimensionTagInfo(BaseModel):
    dimension_key: str
    dimension_name: str
    value_id: str
    value_name: str
    value_code: str


class EntityCreate(BaseModel):
    entity_type_id: str
    name: str = Field(..., min_length=1, max_length=200)
    meta: dict[str, Any] | None = None
    dimension_value_ids: list[str] = []


class EntityUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    meta: dict[str, Any] | None = None


class EntityResponse(BaseResponseSchema):
    organization_id: str
    entity_type_id: str
    case_number: str | None = None
    name: str
    meta: dict[str, Any] | None = None
    entity_type_name: str | None = None
    entity_type_key: str | None = None
    tags: list[DimensionTagInfo] = []
