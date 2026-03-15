"""
User response schemas
"""

from pydantic import BaseModel

from app.common.schemas.base_response import BaseResponseSchema


class UserProfileResponse(BaseResponseSchema):
    """Response schema for user profile"""

    first_name: str
    last_name: str
    country_code: str
    mobile_number: str
    is_verified: bool
    organization_id: str | None = None
    role_id: str | None = None
    role_name: str | None = None
    permissions: list[str] = []


class UserListResponse(BaseResponseSchema):
    """Response schema for user list (admin view)"""

    first_name: str
    last_name: str
    country_code: str
    mobile_number: str
    is_verified: bool
    role_id: str | None = None
    role_name: str | None = None
    dimension_value_ids: list[str] = []


class UserRoleUpdate(BaseModel):
    """Schema for updating a user's role"""

    role_id: str


class UserUpdate(BaseModel):
    """Schema for updating a user's details"""

    first_name: str
    last_name: str
    country_code: str
    mobile_number: str
    role_id: str


class UserCreate(BaseModel):
    """Schema for creating a new user (admin action)"""

    first_name: str
    last_name: str
    country_code: str
    mobile_number: str
    role_id: str


class UserAccessUpdate(BaseModel):
    """Schema for updating a user's dimension access"""

    dimension_value_ids: list[str] = []


class UserAccessResponse(BaseModel):
    """Response schema for user dimension access"""

    dimension_value_ids: list[str] = []
