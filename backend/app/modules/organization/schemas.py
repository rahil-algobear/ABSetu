"""
Organization, Center, Programme schemas
"""
from typing import Any

from pydantic import BaseModel, Field

from app.common.schemas.base_response import BaseResponseSchema


# --- Organization ---

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


# --- Center ---

class CenterCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    code: str = Field(..., min_length=1, max_length=50)
    address: str | None = None
    meta: dict[str, Any] | None = None


class CenterUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    code: str | None = Field(None, min_length=1, max_length=50)
    address: str | None = None
    meta: dict[str, Any] | None = None


class CenterResponse(BaseResponseSchema):
    organization_id: str
    name: str
    code: str
    address: str | None = None
    meta: dict[str, Any] | None = None


# --- Programme ---

class ProgrammeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    meta: dict[str, Any] | None = None


class ProgrammeUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    meta: dict[str, Any] | None = None


class ProgrammeResponse(BaseResponseSchema):
    organization_id: str
    name: str
    description: str | None = None
    meta: dict[str, Any] | None = None


# --- ProgrammeCenter ---

class ProgrammeCenterCreate(BaseModel):
    programme_id: str
    center_id: str


class ProgrammeCenterResponse(BaseResponseSchema):
    programme_id: str
    center_id: str
    programme_name: str | None = None
    center_name: str | None = None
