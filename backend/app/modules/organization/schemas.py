"""
Organization schemas
"""

from typing import Any

from pydantic import BaseModel, Field

from app.common.schemas.base_response import BaseResponseSchema


class OrganizationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    code: str = Field(..., min_length=1, max_length=50)
    case_number_format: str = Field(default="{ORG_CODE}-{SERIAL}")
    logo_url: str | None = Field(None, max_length=2048)
    meta: dict[str, Any] | None = None


class OrganizationUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    code: str | None = Field(None, min_length=1, max_length=50)
    case_number_format: str | None = None
    logo_url: str | None = Field(None, max_length=2048)
    meta: dict[str, Any] | None = None


class OrganizationResponse(BaseResponseSchema):
    name: str
    code: str
    case_number_format: str
    logo_url: str | None = None
    meta: dict[str, Any] | None = None


# --- Meta Field Schemas ---


class MetaFieldScope(BaseModel):
    """Structured scope for meta field schemas.

    The backend builds the internal scope_key from these fields.
    Examples:
      { "type": "entity", "entity_type_id": "..." }
      { "type": "dimension", "dimension_id": "..." }
      { "type": "enrollment" }
      { "type": "activity", "activity_type_id": "...", "dimension_value_id": "..." }
      { "type": "participant", "entity_type_id": "...", "activity_type_id": "...", "dimension_value_id": "..." }
    """

    type: str  # "entity", "dimension", "enrollment", "activity", "participant"
    entity_type_id: str | None = None
    dimension_id: str | None = None
    activity_type_id: str | None = None
    dimension_value_id: str | None = None


class MetaFieldSchemaUpdate(BaseModel):
    scope: MetaFieldScope
    fields: list[dict[str, Any]]
