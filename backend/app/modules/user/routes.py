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
    """Get the authenticated user's profile."""
    return UserProfileResponse.dump_from_model(current_user)
