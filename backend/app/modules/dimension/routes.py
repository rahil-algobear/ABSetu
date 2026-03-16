"""
Dimension, DimensionValue routes
"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.common.dependencies import get_current_user, require_permissions
from app.modules.auth.model import User
from app.modules.dimension.schemas import (
    DimensionCreate,
    DimensionResponse,
    DimensionUpdate,
    DimensionValueCreate,
    DimensionValueRelationshipItem,
    DimensionValueRelationshipResponse,
    DimensionValueRelationshipUpdate,
    DimensionValueResponse,
    DimensionValueUpdate,
)
from app.modules.dimension.service import (
    DimensionService,
    DimensionValueRelationshipService,
    DimensionValueService,
)

router = APIRouter(tags=["dimensions"])

dimension_router = APIRouter(prefix="/dimensions")


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


# --- Dimension Value Relationships ---
# (Must be before /{dimension_id} to avoid path conflicts)


@dimension_router.get(
    "/relationships",
    dependencies=[Depends(require_permissions("dimension:view"))],
)
def list_relationships(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all dimension value relationships for the org."""
    service = DimensionValueRelationshipService(db)
    rels = service.list_by_org(current_user.organization_id)
    return DimensionValueRelationshipResponse(
        relationships=[
            DimensionValueRelationshipItem(
                parent_dimension_value_id=str(r.parent_dimension_value_id),
                child_dimension_value_id=str(r.child_dimension_value_id),
            )
            for r in rels
        ]
    ).model_dump()


@dimension_router.put(
    "/relationships",
    dependencies=[Depends(require_permissions("dimension:manage"))],
)
def update_relationships(
    data: DimensionValueRelationshipUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Bulk-replace all dimension value relationships for the org."""
    service = DimensionValueRelationshipService(db)
    rels = service.bulk_replace(
        current_user.organization_id,
        [item.model_dump() for item in data.relationships],
    )
    return DimensionValueRelationshipResponse(
        relationships=[
            DimensionValueRelationshipItem(
                parent_dimension_value_id=str(r.parent_dimension_value_id),
                child_dimension_value_id=str(r.child_dimension_value_id),
            )
            for r in rels
        ]
    ).model_dump()


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


@dimension_router.get(
    "/{dimension_id}/values",
    dependencies=[Depends(require_permissions("dimension:view"))],
)
def list_dimension_values(
    dimension_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all values for a dimension."""
    # Verify dimension belongs to org
    dim_service = DimensionService(db)
    dim_service.get_by_id(dimension_id, current_user.organization_id)

    service = DimensionValueService(db)
    values = service.list_by_dimension(dimension_id)
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
    # Verify dimension belongs to org
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


# Include sub-routers
router.include_router(dimension_router)
