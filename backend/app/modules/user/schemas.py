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


class UserRoleUpdate(BaseModel):
    """Schema for updating a user's role"""

    role_id: str
