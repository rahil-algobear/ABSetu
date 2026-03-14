"""
User response schemas
"""
from app.common.schemas.base_response import BaseResponseSchema


class UserProfileResponse(BaseResponseSchema):
    """Response schema for user profile"""

    first_name: str
    last_name: str
    country_code: str
    mobile_number: str
    is_verified: bool
