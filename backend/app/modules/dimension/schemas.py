"""
Dimension, DimensionValue schemas
"""

from typing import Any

from pydantic import BaseModel, Field

from app.common.schemas.base_response import BaseResponseSchema

# --- Dimension ---


class DimensionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    key: str = Field(..., min_length=1, max_length=100)
    sort_order: int = 0


class DimensionUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    sort_order: int | None = None


class DimensionResponse(BaseResponseSchema):
    organization_id: str
    name: str
    key: str
    sort_order: int = 0
    is_system: str | None = None


# --- DimensionValue ---


class DimensionValueCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    code: str = Field(..., min_length=1, max_length=100)
    sort_order: int = 0
    meta: dict[str, Any] | None = None


class DimensionValueUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    code: str | None = Field(None, min_length=1, max_length=100)
    sort_order: int | None = None
    meta: dict[str, Any] | None = None


class DimensionValueResponse(BaseResponseSchema):
    organization_id: str
    dimension_id: str
    name: str
    code: str
    sort_order: int = 0
    meta: dict[str, Any] | None = None
    dimension_name: str | None = None
    dimension_key: str | None = None


# --- UserDimensionAccess ---


# --- DimensionValueRelationship ---


class DimensionValueRelationshipItem(BaseModel):
    parent_dimension_value_id: str
    child_dimension_value_id: str


class DimensionValueRelationshipUpdate(BaseModel):
    """Bulk-replace all relationships for an org."""

    relationships: list[DimensionValueRelationshipItem]


class DimensionValueRelationshipResponse(BaseModel):
    relationships: list[DimensionValueRelationshipItem]


# --- UserDimensionAccess ---


class UserAccessUpdate(BaseModel):
    """Replace all dimension access for a user."""

    dimension_value_ids: list[str] = []


class UserAccessResponse(BaseModel):
    """User's dimension access grouped by dimension."""

    dimension_value_ids: list[str] = []
