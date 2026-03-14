"""
Auth FastAPI routes
"""
import logging

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.common.exceptions import UnauthorizedError, ValidationError
from app.common.helpers.thirdparty.ratelimit import rate_limit
from app.modules.auth.schemas import (
    AuthTokenResponse,
    OTPVerify,
    RefreshTokenRequest,
    UserLogin,
    UserRegister,
    UserResponse,
)
from app.modules.auth.service import AuthService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


def _client_ip(request: Request) -> str | None:
    """Extract client IP, respecting X-Forwarded-For behind a reverse proxy."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


@router.post("/register", status_code=status.HTTP_201_CREATED)
@rate_limit("5/5minute")
def register(
    request: Request,
    user: UserRegister,
    db: Session = Depends(get_db),
):
    """Register a new user and send OTP."""
    try:
        auth_service = AuthService(db)
        new_user = auth_service.register_user(
            first_name=user.first_name,
            last_name=user.last_name,
            country_code=user.country_code,
            mobile_number=user.mobile_number,
        )
        return {
            "message": "User registered successfully",
            "user": UserResponse.dump_from_model(new_user),
        }
    except ValueError as e:
        raise ValidationError(str(e))


@router.post("/login")
@rate_limit("5/5minute")
def login(
    request: Request,
    user: UserLogin,
    db: Session = Depends(get_db),
):
    """Login a user and send OTP."""
    try:
        auth_service = AuthService(db)
        auth_service.login_user(
            country_code=user.country_code,
            mobile_number=user.mobile_number,
        )
        return {"message": "OTP sent successfully"}
    except ValueError as e:
        raise ValidationError(str(e))


@router.post("/verify-otp", response_model=AuthTokenResponse)
def verify_otp(
    request: Request,
    data: OTPVerify,
    db: Session = Depends(get_db),
):
    """Verify OTP and return auth tokens."""
    try:
        auth_service = AuthService(db)
        _user, tokens = auth_service.verify_user_otp(
            country_code=data.country_code,
            mobile_number=data.mobile_number,
            otp_code=data.otp_code,
            user_agent=request.headers.get("user-agent"),
            ip_address=_client_ip(request),
        )
        return tokens
    except ValueError as e:
        logger.error("Validation error in verify_otp: %s", e)
        raise ValidationError(str(e))


@router.post("/refresh-token", response_model=AuthTokenResponse)
def refresh_token(
    request: Request,
    data: RefreshTokenRequest,
    db: Session = Depends(get_db),
):
    """Refresh access token using a DB-backed refresh token (with rotation)."""
    try:
        auth_service = AuthService(db)
        return auth_service.refresh_access_token(
            raw_refresh_token=data.refresh_token,
            user_agent=request.headers.get("user-agent"),
            ip_address=_client_ip(request),
        )
    except ValueError as e:
        logger.warning("Refresh token rejected: %s", e)
        raise UnauthorizedError("Invalid or expired refresh token")


@router.post("/logout")
def logout(
    data: RefreshTokenRequest,
    db: Session = Depends(get_db),
):
    """Logout by revoking the refresh token in the DB."""
    auth_service = AuthService(db)
    auth_service.revoke_refresh_token(data.refresh_token)
    return {"message": "Logged out"}
