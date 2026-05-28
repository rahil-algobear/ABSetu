"""
Dimension, DimensionValue, DimensionValueLink routes
"""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.common.dependencies import (
    get_accessible_dimension_value_ids,
    get_current_user,
    require_permissions,
)
from app.core.database import get_db
from app.modules.auth.model import User
from app.modules.dimension.schemas import (
    DimensionCreate,
    DimensionResponse,
    DimensionUpdate,
    DimensionValueCreate,
    DimensionValueLinkBulkSync,
    DimensionValueLinkCreate,
    DimensionValueLinkResponse,
    DimensionValueResponse,
    DimensionValueUpdate,
)
from app.modules.dimension.service import (
    DimensionService,
    DimensionValueLinkService,
    DimensionValueService,
)

router = APIRouter(tags=["dimensions"])

dimension_router = APIRouter(prefix="/dimensions")
dv_link_router = APIRouter(prefix="/dimension-value-links")


# --- Dimensions ---


@dimension_router.get("/", dependencies=[Depends(require_permissions("dimension:view"))])
def list_dimensions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all dimensions for the user's organization."""
    service = DimensionService(db)
    dimensions = service.list_by_org(current_user.organization_id)
    return [DimensionResponse.dump_from_model(d) for d in dimensions]


@dimension_router.get(
    "/{dimension_id}", dependencies=[Depends(require_permissions("dimension:view"))]
)
def get_dimension(
    dimension_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific dimension."""
    service = DimensionService(db)
    dimension = service.get_by_id(dimension_id, current_user.organization_id)
    return DimensionResponse.dump_from_model(dimension)


@dimension_router.post(
    "/",
    dependencies=[Depends(require_permissions("dimension:manage"))],
    status_code=201,
)
def create_dimension(
    data: DimensionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new dimension."""
    service = DimensionService(db)
    dimension = service.create(
        current_user.organization_id,
        data.model_dump(),
    )
    return DimensionResponse.dump_from_model(dimension)


@dimension_router.put(
    "/{dimension_id}",
    dependencies=[Depends(require_permissions("dimension:manage"))],
)
def update_dimension(
    dimension_id: uuid.UUID,
    data: DimensionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a dimension."""
    service = DimensionService(db)
    dimension = service.update(
        dimension_id,
        current_user.organization_id,
        data.model_dump(exclude_none=True),
    )
    return DimensionResponse.dump_from_model(dimension)


@dimension_router.delete(
    "/{dimension_id}",
    dependencies=[Depends(require_permissions("dimension:manage"))],
)
def delete_dimension(
    dimension_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a dimension."""
    service = DimensionService(db)
    service.delete(dimension_id, current_user.organization_id)
    return {"message": "Dimension deleted"}


# --- Dimension Values ---


def _serialize_dimension_values(values) -> list[dict]:
    results = []
    for v in values:
        resp = DimensionValueResponse(
            id=str(v.id),
            updated_at=v.updated_at,
            organization_id=str(v.organization_id),
            dimension_id=str(v.dimension_id),
            name=v.name,
            code=v.code,
            sort_order=v.sort_order,
            meta=v.meta,
            dimension_name=v.dimension.name if v.dimension else None,
            dimension_key=v.dimension.key if v.dimension else None,
        )
        results.append(resp.dump())
    return results


@dimension_router.get(
    "/{dimension_id}/values",
    dependencies=[Depends(require_permissions("dimension:view"))],
)
def list_dimension_values(
    dimension_id: uuid.UUID,
    search: str | None = Query(None),
    sort_by: str | None = Query(None),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List ALL values for a dimension (unscoped).

    Intended for admin/management surfaces — the dimension matrix, user
    access editor, meta-field editors — where the full org structure is
    needed for context. Do NOT call this from form dropdowns; use the
    `/values/accessible` route instead.
    """
    dim_service = DimensionService(db)
    dim_service.get_by_id(dimension_id, current_user.organization_id)

    service = DimensionValueService(db)
    values = service.list_by_dimension(
        dimension_id,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return _serialize_dimension_values(values)


@dimension_router.get(
    "/{dimension_id}/values/accessible",
    dependencies=[Depends(require_permissions("dimension:view"))],
)
def list_accessible_dimension_values(
    dimension_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    accessible_dv_ids: list[uuid.UUID] | None = Depends(get_accessible_dimension_value_ids),
    db: Session = Depends(get_db),
):
    """List values for a dimension, scoped by the caller's dimension access.

    Use this for form dropdowns and filter pickers — anywhere a non-admin
    user picks a dimension value to tag a record with or filter on.
    """
    dim_service = DimensionService(db)
    dim_service.get_by_id(dimension_id, current_user.organization_id)

    service = DimensionValueService(db)
    values = service.list_by_dimension(dimension_id, accessible_dv_ids=accessible_dv_ids)
    return _serialize_dimension_values(values)


@dimension_router.post(
    "/{dimension_id}/values",
    dependencies=[Depends(require_permissions("dimension:manage"))],
    status_code=201,
)
def create_dimension_value(
    dimension_id: uuid.UUID,
    data: DimensionValueCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new dimension value."""
    dim_service = DimensionService(db)
    dim_service.get_by_id(dimension_id, current_user.organization_id)

    service = DimensionValueService(db)
    value = service.create(
        current_user.organization_id,
        dimension_id,
        data.model_dump(exclude_none=True),
    )
    return DimensionValueResponse.dump_from_model(value)


@dimension_router.put(
    "/{dimension_id}/values/{value_id}",
    dependencies=[Depends(require_permissions("dimension:manage"))],
)
def update_dimension_value(
    dimension_id: uuid.UUID,
    value_id: uuid.UUID,
    data: DimensionValueUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a dimension value."""
    dim_service = DimensionService(db)
    dim_service.get_by_id(dimension_id, current_user.organization_id)

    service = DimensionValueService(db)
    value = service.update(value_id, data.model_dump(exclude_none=True))
    return DimensionValueResponse.dump_from_model(value)


@dimension_router.delete(
    "/{dimension_id}/values/{value_id}",
    dependencies=[Depends(require_permissions("dimension:manage"))],
)
def delete_dimension_value(
    dimension_id: uuid.UUID,
    value_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a dimension value."""
    dim_service = DimensionService(db)
    dim_service.get_by_id(dimension_id, current_user.organization_id)

    service = DimensionValueService(db)
    service.delete(value_id)
    return {"message": "Dimension value deleted"}


# --- Dimension Value Links ---


@dv_link_router.get("/", dependencies=[Depends(require_permissions("dimension:view"))])
def list_dimension_value_links(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    dimension_id_1: uuid.UUID | None = Query(None),
    dimension_id_2: uuid.UUID | None = Query(None),
):
    """List dimension value links, optionally filtered by dimension pair."""
    service = DimensionValueLinkService(db)
    links = service.list_by_org(
        current_user.organization_id,
        dimension_id_1=dimension_id_1,
        dimension_id_2=dimension_id_2,
    )
    results = []
    for r in links:
        resp = DimensionValueLinkResponse(
            id=str(r.id),
            updated_at=r.updated_at,
            organization_id=str(r.organization_id),
            dimension_value_id_1=str(r.dimension_value_id_1),
            dimension_value_id_2=str(r.dimension_value_id_2),
            value_1_name=r.dimension_value_1.name if r.dimension_value_1 else None,
            value_1_code=r.dimension_value_1.code if r.dimension_value_1 else None,
            value_1_dimension_key=(
                r.dimension_value_1.dimension.key
                if r.dimension_value_1 and r.dimension_value_1.dimension
                else None
            ),
            value_2_name=r.dimension_value_2.name if r.dimension_value_2 else None,
            value_2_code=r.dimension_value_2.code if r.dimension_value_2 else None,
            value_2_dimension_key=(
                r.dimension_value_2.dimension.key
                if r.dimension_value_2 and r.dimension_value_2.dimension
                else None
            ),
        )
        results.append(resp.dump())
    return results


@dv_link_router.post(
    "/",
    dependencies=[Depends(require_permissions("dimension:manage"))],
    status_code=201,
)
def create_dimension_value_link(
    data: DimensionValueLinkCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a dimension value link."""
    service = DimensionValueLinkService(db)
    link = service.create(
        current_user.organization_id,
        uuid.UUID(data.dimension_value_id_1),
        uuid.UUID(data.dimension_value_id_2),
    )
    return DimensionValueLinkResponse(
        id=str(link.id),
        updated_at=link.updated_at,
        organization_id=str(link.organization_id),
        dimension_value_id_1=str(link.dimension_value_id_1),
        dimension_value_id_2=str(link.dimension_value_id_2),
    ).dump()


@dv_link_router.delete(
    "/{link_id}",
    dependencies=[Depends(require_permissions("dimension:manage"))],
)
def delete_dimension_value_link(
    link_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Delete a dimension value link."""
    service = DimensionValueLinkService(db)
    service.delete(link_id)
    return {"message": "Dimension value link deleted"}


@dv_link_router.post(
    "/bulk",
    dependencies=[Depends(require_permissions("dimension:manage"))],
)
def bulk_sync_dimension_value_links(
    data: DimensionValueLinkBulkSync,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Bulk sync dimension value links between two dimensions (for matrix UI)."""
    service = DimensionValueLinkService(db)
    links = service.bulk_sync(
        current_user.organization_id,
        uuid.UUID(data.dimension_id_1),
        uuid.UUID(data.dimension_id_2),
        [(uuid.UUID(a), uuid.UUID(b)) for a, b in data.pairs],
    )
    return [
        DimensionValueLinkResponse(
            id=str(r.id),
            updated_at=r.updated_at,
            organization_id=str(r.organization_id),
            dimension_value_id_1=str(r.dimension_value_id_1),
            dimension_value_id_2=str(r.dimension_value_id_2),
        ).dump()
        for r in links
    ]


# Include sub-routers
router.include_router(dimension_router)
router.include_router(dv_link_router)
