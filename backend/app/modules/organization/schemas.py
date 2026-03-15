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
