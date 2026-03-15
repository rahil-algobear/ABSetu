"""
Dimension, DimensionValue, TagRule routes
"""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.common.dependencies import get_current_user, require_permissions
from app.modules.auth.model import User
from app.modules.dimension.schemas import (
    DimensionCreate,
    DimensionResponse,
    DimensionUpdate,
    DimensionValueCreate,
    DimensionValueResponse,
    DimensionValueUpdate,
    TagRuleBulkSync,
    TagRuleCreate,
    TagRuleResponse,
)
from app.modules.dimension.service import (
    DimensionService,
    DimensionValueService,
    TagRuleService,
    UserDimensionAccessService,
)

router = APIRouter(tags=["dimensions"])

dimension_router = APIRouter(prefix="/dimensions")
tag_rule_router = APIRouter(prefix="/tag-rules")


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


# --- Tag Rules ---


@tag_rule_router.get("/", dependencies=[Depends(require_permissions("dimension:view"))])
def list_tag_rules(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    dimension_id_1: uuid.UUID | None = Query(None),
    dimension_id_2: uuid.UUID | None = Query(None),
):
    """List tag rules, optionally filtered by dimension pair."""
    service = TagRuleService(db)
    rules = service.list_by_org(
        current_user.organization_id,
        dimension_id_1=dimension_id_1,
        dimension_id_2=dimension_id_2,
    )
    results = []
    for r in rules:
        resp = TagRuleResponse(
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


@tag_rule_router.post(
    "/",
    dependencies=[Depends(require_permissions("dimension:manage"))],
    status_code=201,
)
def create_tag_rule(
    data: TagRuleCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a tag rule."""
    service = TagRuleService(db)
    rule = service.create(
        current_user.organization_id,
        uuid.UUID(data.dimension_value_id_1),
        uuid.UUID(data.dimension_value_id_2),
    )
    return TagRuleResponse(
        id=str(rule.id),
        updated_at=rule.updated_at,
        organization_id=str(rule.organization_id),
        dimension_value_id_1=str(rule.dimension_value_id_1),
        dimension_value_id_2=str(rule.dimension_value_id_2),
    ).dump()


@tag_rule_router.delete(
    "/{rule_id}",
    dependencies=[Depends(require_permissions("dimension:manage"))],
)
def delete_tag_rule(
    rule_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Delete a tag rule."""
    service = TagRuleService(db)
    service.delete(rule_id)
    return {"message": "Tag rule deleted"}


@tag_rule_router.post(
    "/bulk",
    dependencies=[Depends(require_permissions("dimension:manage"))],
)
def bulk_sync_tag_rules(
    data: TagRuleBulkSync,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Bulk sync tag rules between two dimensions (for matrix UI)."""
    service = TagRuleService(db)
    rules = service.bulk_sync(
        current_user.organization_id,
        uuid.UUID(data.dimension_id_1),
        uuid.UUID(data.dimension_id_2),
        [(uuid.UUID(a), uuid.UUID(b)) for a, b in data.pairs],
    )
    return [
        TagRuleResponse(
            id=str(r.id),
            updated_at=r.updated_at,
            organization_id=str(r.organization_id),
            dimension_value_id_1=str(r.dimension_value_id_1),
            dimension_value_id_2=str(r.dimension_value_id_2),
        ).dump()
        for r in rules
    ]


# Include sub-routers
router.include_router(dimension_router)
router.include_router(tag_rule_router)
