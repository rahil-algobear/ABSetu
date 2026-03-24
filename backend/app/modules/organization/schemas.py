"""
Organization schemas
"""

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from app.common.schemas.base_response import BaseResponseSchema

# --- Field Definition ---

FIELD_TYPES = Literal[
    "text", "number", "date", "datetime", "select", "multiselect", "boolean",
    "dimension", "entity_list", "user_list",
]

DISPLAY_TYPES = Literal[
    "input", "dropdown", "radio", "checklist", "textarea", "date", "datetime",
    "search_select", "multi_select",
]

STAGE_TYPES = Literal["create", "record", "both"]


class FieldDefinition(BaseModel):
    """Typed definition for a single field in a meta field schema."""

    key: str = Field(default="")
    label: str = Field(..., min_length=1)
    type: FIELD_TYPES
    system: bool = False
    required: bool = False
    options: list[str] | None = None

    # Form presentation
    display_type: DISPLAY_TYPES | None = None
    stage: STAGE_TYPES = "both"
    visible: bool = True
    sort_order: int = 0

    # For type="dimension"
    dimension_id: str | None = None
    # For type="entity_list"
    entity_type_id: str | None = None
    # For title generation config, status capture config, etc.
    config: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_options(self):
        if self.type in ("select", "multiselect") and not self.options:
            raise ValueError(f"options are required for {self.type} fields")
        if self.type not in ("select", "multiselect", "dimension", "entity_list", "user_list") and self.options:
            raise ValueError(f"options are not allowed for {self.type} fields")
        return self

    @model_validator(mode="after")
    def validate_structural_refs(self):
        if self.type == "dimension" and not self.dimension_id:
            raise ValueError("dimension_id is required for dimension fields")
        if self.type == "entity_list" and not self.entity_type_id:
            raise ValueError("entity_type_id is required for entity_list fields")
        return self


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

    Examples:
      { "type": "entity", "entity_type_id": "..." }
      { "type": "dimension", "dimension_id": "..." }
      { "type": "enrollment" }
      { "type": "activity", "activity_type_id": "...", "dimension_value_id": "..." }
      { "type": "participant", "entity_type_id": "...", "activity_type_id": "...", "dimension_value_id": "..." }
    """

    type: str  # "entity", "dimension", "enrollment", "activity", "participant", etc.
    entity_type_id: str | None = None
    dimension_id: str | None = None
    activity_type_id: str | None = None
    dimension_value_id: str | None = None


class MetaFieldSchemaUpdate(BaseModel):
    scope: MetaFieldScope
    fields: list[FieldDefinition]


class MetaFieldSchemaResponse(BaseModel):
    """Response for a single meta field schema with structured scope."""

    scope: MetaFieldScope
    fields: list[FieldDefinition]
