"""
Role and Permission routes
"""
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.common.dependencies import get_current_user, require_permissions
from app.modules.auth.model import User
from app.modules.role.schemas import (
    PermissionResponse,
    RoleCreate,
    RoleResponse,
    RoleUpdate,
)
from app.modules.role.service import PermissionService, RoleService

router = APIRouter(prefix="/roles", tags=["roles"])


def _role_to_response(role) -> dict:
    """Convert a Role ORM object to a RoleResponse dict."""
    permissions = [
        PermissionResponse(
            id=str(rp.permission.id),
            updated_at=rp.permission.updated_at,
            key=rp.permission.key,
            description=rp.permission.description,
        ).dump()
        for rp in role.role_permissions
        if rp.permission
    ]
    user_count = role.users.count()
    return RoleResponse(
        id=str(role.id),
        updated_at=role.updated_at,
        organization_id=str(role.organization_id),
        name=role.name,
        is_default=role.is_default,
        permissions=permissions,
        user_count=user_count,
    ).dump()


# --- Permissions ---


@router.get(
    "/permissions",
    dependencies=[Depends(require_permissions("role:view"))],
)
def list_permissions(db: Session = Depends(get_db)):
    """List all available permission keys."""
    service = PermissionService(db)
    perms = service.list_all()
    return [PermissionResponse.dump_from_model(p) for p in perms]


# --- Roles ---


@router.get("/", dependencies=[Depends(require_permissions("role:view"))])
def list_roles(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all roles for the user's organization."""
    service = RoleService(db)
    roles = service.list_by_org(current_user.organization_id)
    return [_role_to_response(r) for r in roles]


@router.post(
    "/",
    dependencies=[Depends(require_permissions("role:manage"))],
    status_code=201,
)
def create_role(
    data: RoleCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new role."""
    service = RoleService(db)
    role = service.create(
        current_user.organization_id,
        data.model_dump(),
    )
    return _role_to_response(role)


@router.put(
    "/{role_id}",
    dependencies=[Depends(require_permissions("role:manage"))],
)
def update_role(
    role_id: uuid.UUID,
    data: RoleUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a role and its permissions."""
    service = RoleService(db)
    role = service.update(
        role_id,
        current_user.organization_id,
        data.model_dump(exclude_none=True),
    )
    return _role_to_response(role)


@router.delete(
    "/{role_id}",
    dependencies=[Depends(require_permissions("role:manage"))],
)
def delete_role(
    role_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a role (only if no users assigned)."""
    service = RoleService(db)
    service.delete(role_id, current_user.organization_id)
    return {"message": "Role deleted"}
