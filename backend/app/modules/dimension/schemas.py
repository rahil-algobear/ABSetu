"""
Dimension, DimensionValue, TagRule schemas
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


# --- TagRule ---


class TagRuleCreate(BaseModel):
    dimension_value_id_1: str
    dimension_value_id_2: str


class TagRuleBulkSync(BaseModel):
    """Bulk sync tag rules between two dimensions.
    Provide the full list of valid pairs; rules not in the list are deleted."""

    dimension_id_1: str
    dimension_id_2: str
    pairs: list[tuple[str, str]]  # List of (value_id_1, value_id_2)


class TagRuleResponse(BaseResponseSchema):
    organization_id: str
    dimension_value_id_1: str
    dimension_value_id_2: str
    value_1_name: str | None = None
    value_1_code: str | None = None
    value_1_dimension_key: str | None = None
    value_2_name: str | None = None
    value_2_code: str | None = None
    value_2_dimension_key: str | None = None


# --- UserDimensionAccess ---


class UserAccessUpdate(BaseModel):
    """Replace all dimension access for a user."""

    dimension_value_ids: list[str] = []


class UserAccessResponse(BaseModel):
    """User's dimension access grouped by dimension."""

    dimension_value_ids: list[str] = []
