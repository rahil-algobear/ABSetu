"""
User FastAPI routes
"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.common.dependencies import get_current_user, require_permissions
from app.modules.auth.model import User
from app.modules.user.schemas import (
    UserAccessResponse,
    UserAccessUpdate,
    UserCreate,
    UserListResponse,
    UserProfileResponse,
    UserRoleUpdate,
    UserUpdate,
)
from app.modules.user.service import UserService

router = APIRouter(prefix="/user", tags=["user"])


@router.get("/profile", response_model=UserProfileResponse)
def get_profile(current_user: User = Depends(get_current_user)):
    """Get the authenticated user's profile, including role and permissions."""
    permissions = []
    role_name = None

    if current_user.role:
        role_name = current_user.role.name
        permissions = [
            rp.permission.key for rp in current_user.role.role_permissions if rp.permission
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


@router.get(
    "/list",
    dependencies=[Depends(require_permissions("user:view"))],
)
def list_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all users in the organization."""
    service = UserService(db)
    users = service.list_by_org(current_user.organization_id)
    results = []
    for u in users:
        role_name = u.role.name if u.role else None
        results.append(
            UserListResponse(
                id=str(u.id),
                updated_at=u.updated_at,
                first_name=u.first_name,
                last_name=u.last_name,
                country_code=u.country_code,
                mobile_number=u.mobile_number,
                is_verified=u.is_verified,
                role_id=str(u.role_id) if u.role_id else None,
                role_name=role_name,
                center_ids=[str(a.center_id) for a in u.center_access],
                programme_ids=[str(a.programme_id) for a in u.programme_access],
                session_template_ids=[
                    str(a.session_template_id) for a in u.session_template_access
                ],
            ).dump()
        )
    return results


@router.post(
    "/",
    dependencies=[Depends(require_permissions("user:manage"))],
    status_code=201,
)
def create_user(
    data: UserCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new user within the organization."""
    service = UserService(db)
    user = service.create_user(
        org_id=current_user.organization_id,
        first_name=data.first_name,
        last_name=data.last_name,
        country_code=data.country_code,
        mobile_number=data.mobile_number,
        role_id=uuid.UUID(data.role_id),
    )
    role_name = user.role.name if user.role else None
    return UserListResponse(
        id=str(user.id),
        updated_at=user.updated_at,
        first_name=user.first_name,
        last_name=user.last_name,
        country_code=user.country_code,
        mobile_number=user.mobile_number,
        is_verified=user.is_verified,
        role_id=str(user.role_id) if user.role_id else None,
        role_name=role_name,
    ).dump()


@router.put(
    "/{user_id}",
    dependencies=[Depends(require_permissions("user:manage"))],
)
def update_user(
    user_id: uuid.UUID,
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a user's details (name, contact, role)."""
    service = UserService(db)
    user = service.update_user(
        user_id,
        current_user.organization_id,
        first_name=data.first_name,
        last_name=data.last_name,
        country_code=data.country_code,
        mobile_number=data.mobile_number,
        role_id=uuid.UUID(data.role_id),
    )
    role_name = user.role.name if user.role else None
    return UserListResponse(
        id=str(user.id),
        updated_at=user.updated_at,
        first_name=user.first_name,
        last_name=user.last_name,
        country_code=user.country_code,
        mobile_number=user.mobile_number,
        is_verified=user.is_verified,
        role_id=str(user.role_id) if user.role_id else None,
        role_name=role_name,
        center_ids=[str(a.center_id) for a in user.center_access],
        programme_ids=[str(a.programme_id) for a in user.programme_access],
        session_template_ids=[
            str(a.session_template_id) for a in user.session_template_access
        ],
    ).dump()


@router.put(
    "/{user_id}/role",
    dependencies=[Depends(require_permissions("user:manage"))],
)
def update_user_role(
    user_id: uuid.UUID,
    data: UserRoleUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a user's role."""
    service = UserService(db)
    user = service.update_role(
        user_id,
        current_user.organization_id,
        uuid.UUID(data.role_id),
    )
    role_name = user.role.name if user.role else None
    return UserListResponse(
        id=str(user.id),
        updated_at=user.updated_at,
        first_name=user.first_name,
        last_name=user.last_name,
        country_code=user.country_code,
        mobile_number=user.mobile_number,
        is_verified=user.is_verified,
        role_id=str(user.role_id) if user.role_id else None,
        role_name=role_name,
    ).dump()


@router.delete(
    "/{user_id}",
    dependencies=[Depends(require_permissions("user:manage"))],
    status_code=204,
)
def delete_user(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a user from the organization."""
    service = UserService(db)
    service.delete_user(user_id, current_user.organization_id, current_user.id)


@router.get(
    "/{user_id}/access",
    dependencies=[Depends(require_permissions("user:manage"))],
)
def get_user_access(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a user's access tags."""
    service = UserService(db)
    access = service.get_user_access(user_id, current_user.organization_id)
    return UserAccessResponse(**access).model_dump()


@router.put(
    "/{user_id}/access",
    dependencies=[Depends(require_permissions("user:manage"))],
)
def update_user_access(
    user_id: uuid.UUID,
    data: UserAccessUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a user's access tags (bulk replace)."""
    service = UserService(db)
    access = service.update_user_access(
        user_id,
        current_user.organization_id,
        center_ids=[uuid.UUID(cid) for cid in data.center_ids],
        programme_ids=[uuid.UUID(pid) for pid in data.programme_ids],
        session_template_ids=[uuid.UUID(stid) for stid in data.session_template_ids],
    )
    return UserAccessResponse(**access).model_dump()
