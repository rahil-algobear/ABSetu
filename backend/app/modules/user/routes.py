"""
User FastAPI routes
"""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.common.dependencies import get_current_user, require_permissions
from app.common.schemas.base_response import PaginatedResponse
from app.common.schemas.list_params import ListParams
from app.core.database import get_db
from app.modules.auth.model import User
from app.modules.dimension.model import Dimension, DimensionValue
from app.modules.role.model import Role
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


def _serialize_user(u: User) -> dict:
    """Build a UserListResponse dict from a user model."""
    return UserListResponse(
        id=str(u.id),
        created_at=u.created_at,
        updated_at=u.updated_at,
        first_name=u.first_name,
        last_name=u.last_name,
        country_code=u.country_code,
        mobile_number=u.mobile_number,
        is_verified=u.is_verified,
        role_id=str(u.role_id) if u.role_id else None,
        role_name=u.role.name if u.role else None,
        dimension_value_ids=[str(a.dimension_value_id) for a in u.dimension_access],
    ).dump()


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

    dimension_value_ids = [
        str(da.dimension_value_id) for da in (current_user.dimension_access or [])
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
        dimension_value_ids=dimension_value_ids,
    ).dump()


@router.get(
    "/list",
    dependencies=[Depends(require_permissions("user:view"))],
)
def list_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all users in the organization (flat — used by pickers)."""
    service = UserService(db)
    users = service.list_by_org(current_user.organization_id)
    return [_serialize_user(u) for u in users]


@router.get(
    "/",
    dependencies=[Depends(require_permissions("user:view"))],
)
def list_users_paginated(
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    search: str | None = Query(None),
    sort_by: str | None = Query(None),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    filters: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Paginated user list with search, filter, and sort support."""
    params = ListParams(
        page=page,
        limit=limit,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
        filters=filters,
    )
    service = UserService(db)
    users, total = service.list_by_org_paginated(current_user.organization_id, params)
    data = [_serialize_user(u) for u in users]
    return PaginatedResponse(count=total, data=data)


@router.get(
    "/filters",
    dependencies=[Depends(require_permissions("user:view"))],
)
def get_user_filters(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return filter definitions, sortable keys, and visible columns for the user list."""
    org_id = current_user.organization_id

    filters: list[dict] = []

    # Role filter
    roles = db.query(Role).filter_by(organization_id=org_id).order_by(Role.name).all()
    if roles:
        filters.append(
            {
                "key": "role_id",
                "label": "Role",
                "type": "select",
                "options": [{"value": str(r.id), "label": r.name} for r in roles],
            }
        )

    # Dimension filters — each with an "All access" pseudo-option that matches
    # users with no explicit values for that dimension (i.e. unrestricted).
    dimensions = (
        db.query(Dimension)
        .filter_by(organization_id=org_id, controls_access=True)
        .order_by(Dimension.sort_order)
        .all()
    )
    for dim in dimensions:
        values = (
            db.query(DimensionValue)
            .filter_by(dimension_id=dim.id)
            .order_by(DimensionValue.sort_order, DimensionValue.name)
            .all()
        )
        options = [{"value": "all_access", "label": "All access"}]
        options.extend({"value": str(v.id), "label": v.name} for v in values)
        filters.append(
            {
                "key": f"dim:{dim.id}",
                "label": dim.name,
                "type": "select",
                "options": options,
            }
        )

    # Created date range
    filters.append({"key": "created_at", "label": "Created Date", "type": "date_range"})

    # Columns reported to the frontend (drives column rendering + slug mapping)
    columns: list[dict] = [
        {
            "key": "name",
            "label": "Name",
            "field_type": "static",
            "visible": True,
            "filterable": False,
            "sortable": True,
            "searchable": True,
            "sort_order": 0,
        },
        {
            "key": "mobile_number",
            "label": "Mobile",
            "field_type": "static",
            "visible": True,
            "filterable": False,
            "sortable": False,
            "searchable": True,
            "sort_order": 1,
        },
        {
            "key": "role",
            "label": "Role",
            "field_type": "static",
            "visible": True,
            "filterable": True,
            "sortable": True,
            "searchable": False,
            "sort_order": 2,
        },
    ]
    for idx, dim in enumerate(dimensions):
        columns.append(
            {
                "key": f"dim:{dim.id}",
                "label": dim.name,
                "field_type": "dimension",
                "dimension_key": str(dim.id),
                "visible": True,
                "filterable": True,
                "sortable": False,
                "searchable": False,
                "sort_order": 3 + idx,
            }
        )
    columns.append(
        {
            "key": "created_at",
            "label": "Created At",
            "field_type": "static",
            "visible": True,
            "filterable": True,
            "sortable": True,
            "searchable": False,
            "sort_order": 99,
        }
    )

    # "first_name" maps to the "name" column key in the UI so the sort indicator
    # appears on the correct header.
    sortable_keys = ["name", "role", "created_at"]

    return {
        "filters": filters,
        "sortable_keys": sortable_keys,
        "columns": columns,
    }


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
        dimension_value_ids=[str(a.dimension_value_id) for a in user.dimension_access],
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
    """Get a user's dimension access."""
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
    """Update a user's dimension access (bulk replace)."""
    service = UserService(db)
    access = service.update_user_access(
        user_id,
        current_user.organization_id,
        dimension_value_ids=[uuid.UUID(dv_id) for dv_id in data.dimension_value_ids],
    )
    return UserAccessResponse(**access).model_dump()
