"""
Auth request and response schemas
"""
from pydantic import BaseModel, Field

from app.common.schemas.base_response import BaseResponseSchema


# --- Request Schemas ---


class UserRegister(BaseModel):
    """Request schema for user registration"""

    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    country_code: str = Field(..., min_length=1, max_length=10)
    mobile_number: str = Field(..., min_length=6, max_length=20)


class UserLogin(BaseModel):
    """Request schema for user login"""

    country_code: str = Field(..., min_length=1, max_length=10)
    mobile_number: str = Field(..., min_length=6, max_length=20)


class OTPVerify(BaseModel):
    """Request schema for OTP verification"""

    country_code: str = Field(..., min_length=1, max_length=10)
    mobile_number: str = Field(..., min_length=6, max_length=20)
    otp_code: str = Field(..., min_length=6, max_length=6)


class RefreshTokenRequest(BaseModel):
    """Request schema for refreshing access tokens"""

    refresh_token: str = Field(..., min_length=1)


# --- Response Schemas ---


class UserResponse(BaseResponseSchema):
    """Response schema for user"""

    first_name: str
    last_name: str
    country_code: str
    mobile_number: str
    is_verified: bool


class AuthTokenResponse(BaseModel):
    """Response schema for auth tokens"""

    access_token: str
    refresh_token: str
