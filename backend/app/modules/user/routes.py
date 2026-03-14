"""
User FastAPI routes
"""
from fastapi import APIRouter, Depends

from app.common.dependencies import get_current_user
from app.modules.auth.model import User
from app.modules.user.schemas import UserProfileResponse

router = APIRouter(prefix="/user", tags=["user"])


@router.get("/profile", response_model=UserProfileResponse)
def get_profile(current_user: User = Depends(get_current_user)):
    """Get the authenticated user's profile, including role and permissions."""
    permissions = []
    role_name = None

    if current_user.role:
        role_name = current_user.role.name
        permissions = [
            rp.permission.key
            for rp in current_user.role.role_permissions
            if rp.permission
        ]

    return UserProfileResponse(
        id=str(current_user.id),
        updated_at=current_user.updated_at,
        first_name=current_user.first_name,
        last_name=current_user.last_name,
        country_code=current_user.country_code,
        mobile_number=current_user.mobile_number,
        is_verified=current_user.is_verified,
        organization_id=str(current_user.organization_id) if current_user.organization_id else None,
        role_id=str(current_user.role_id) if current_user.role_id else None,
        role_name=role_name,
        permissions=permissions,
    ).dump()
