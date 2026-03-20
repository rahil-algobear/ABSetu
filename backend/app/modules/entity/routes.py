"""
Entity and EntityType routes
"""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.common.dependencies import (
    get_accessible_dimension_value_ids,
    get_accessible_entity,
    get_current_user,
    require_permissions,
)
from app.common.schemas.base_response import PaginatedResponse
from app.common.schemas.list_params import ListParams
from app.core.database import get_db
from app.modules.auth.model import User
from app.modules.entity.schemas import (
    DimensionInfo,
    EntityCreate,
    EntityResponse,
    EntityTypeCreate,
    EntityTypeResponse,
    EntityTypeUpdate,
    EntityUpdate,
)
from app.modules.entity.service import EntityService, EntityTypeService

router = APIRouter(tags=["entities"])

entity_type_router = APIRouter(prefix="/entity-types")
entity_router = APIRouter(prefix="/entities")


def _build_entity_response(e, enrollment_count: int = 0, activity_count: int = 0) -> dict:
    dim_infos = []
    for d in e.dimensions or []:
        dv = d.dimension_value
        if dv and dv.dimension:
            dim_infos.append(
                DimensionInfo(
                    dimension_key=dv.dimension.key,
                    dimension_name=dv.dimension.name,
                    value_id=str(dv.id),
                    value_name=dv.name,
                    value_code=dv.code,
                ).model_dump()
            )
    return EntityResponse(
        id=str(e.id),
        updated_at=e.updated_at,
        organization_id=str(e.organization_id),
        entity_type_id=str(e.entity_type_id),
        case_number=e.case_number,
        name=e.name,
        meta=e.meta,
        entity_type_name=e.entity_type.name if e.entity_type else None,
        entity_type_key=e.entity_type.key if e.entity_type else None,
        entity_type_config=e.entity_type.config if e.entity_type else None,
        dimensions=dim_infos,
        enrollment_count=enrollment_count,
        activity_count=activity_count,
    ).dump()


# --- Entity Types ---


@entity_type_router.get("/", dependencies=[Depends(require_permissions("entity_type:view"))])
def list_entity_types(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = EntityTypeService(db)
    types = service.list_by_org(current_user.organization_id)
    return [EntityTypeResponse.dump_from_model(t) for t in types]


@entity_type_router.get(
    "/{entity_type_id}",
    dependencies=[Depends(require_permissions("entity_type:view"))],
)
def get_entity_type(
    entity_type_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = EntityTypeService(db)
    et = service.get_by_id(entity_type_id, current_user.organization_id)
    return EntityTypeResponse.dump_from_model(et)


@entity_type_router.post(
    "/",
    dependencies=[Depends(require_permissions("entity_type:manage"))],
    status_code=201,
)
def create_entity_type(
    data: EntityTypeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = EntityTypeService(db)
    et = service.create(
        current_user.organization_id,
        data.model_dump(),
    )
    return EntityTypeResponse.dump_from_model(et)


@entity_type_router.put(
    "/{entity_type_id}",
    dependencies=[Depends(require_permissions("entity_type:manage"))],
)
def update_entity_type(
    entity_type_id: uuid.UUID,
    data: EntityTypeUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = EntityTypeService(db)
    et = service.update(
        entity_type_id,
        current_user.organization_id,
        data.model_dump(exclude_none=True),
    )
    return EntityTypeResponse.dump_from_model(et)


@entity_type_router.delete(
    "/{entity_type_id}",
    dependencies=[Depends(require_permissions("entity_type:manage"))],
)
def delete_entity_type(
    entity_type_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = EntityTypeService(db)
    service.delete(entity_type_id, current_user.organization_id)
    return {"message": "Entity type deleted"}


# --- Entities ---


@entity_router.get("/", dependencies=[Depends(require_permissions("entity:view"))])
def list_entities(
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    search: str | None = Query(None),
    sort_by: str | None = Query(None),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    filters: str | None = Query(None),
    # Legacy param — still supported, but prefer filters JSON
    entity_type_id: uuid.UUID | None = Query(None),
    current_user: User = Depends(get_current_user),
    accessible_dv_ids: list[uuid.UUID] | None = Depends(get_accessible_dimension_value_ids),
    db: Session = Depends(get_db),
):
    import json

    service = EntityService(db)

    # Merge legacy entity_type_id param into filters if provided
    merged_filters = filters
    if entity_type_id:
        try:
            f = json.loads(filters) if filters else {}
        except (json.JSONDecodeError, TypeError):
            f = {}
        f["entity_type_id"] = str(entity_type_id)
        merged_filters = json.dumps(f)

    params = ListParams(
        page=page, limit=limit, search=search,
        sort_by=sort_by, sort_order=sort_order, filters=merged_filters,
    )
    rows, total = service.list_by_org_paginated(
        current_user.organization_id,
        params=params,
        accessible_dv_ids=accessible_dv_ids,
    )
    data = [
        _build_entity_response(entity, enrollment_count, activity_count)
        for entity, enrollment_count, activity_count in rows
    ]
    return PaginatedResponse(count=total, data=data)


@entity_router.get("/filters", dependencies=[Depends(require_permissions("entity:view"))])
def get_entity_filters(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return available filter definitions for entity list."""
    from app.modules.dimension.model import Dimension, DimensionValue
    from app.modules.organization.service import MetaFieldSchemaService

    org_id = current_user.organization_id

    result = []

    # Entity type filter
    et_service = EntityTypeService(db)
    entity_types = et_service.list_by_org(org_id)
    if entity_types:
        result.append({
            "key": "entity_type_id",
            "label": "Entity Type",
            "type": "select",
            "options": [{"value": str(et.id), "label": et.name} for et in entity_types],
        })

    # Dimension filters (non-system)
    dims = (
        db.query(Dimension)
        .filter_by(organization_id=org_id)
        .filter(Dimension.is_system.is_(None))
        .order_by(Dimension.sort_order)
        .all()
    )
    for dim in dims:
        values = (
            db.query(DimensionValue)
            .filter_by(dimension_id=dim.id)
            .order_by(DimensionValue.sort_order, DimensionValue.name)
            .all()
        )
        if values:
            result.append({
                "key": f"dim:{dim.id}",
                "label": dim.name,
                "type": "select",
                "options": [{"value": str(v.id), "label": v.name} for v in values],
            })

    # Meta field filters (where is_filterable=true)
    meta_service = MetaFieldSchemaService(db)
    # Get entity-scoped meta fields
    for et in entity_types:
        scope_key = f"entity:{et.id}"
        fields = meta_service.get_schema(org_id, scope_key)
        for field in fields:
            if field.get("is_filterable"):
                ftype = field.get("type", "text")
                filter_def: dict = {
                    "key": f"meta:{field['key']}",
                    "label": field.get("label", field["key"]),
                }
                if ftype in ("select", "multiselect") and field.get("options"):
                    filter_def["type"] = "select"
                    filter_def["options"] = [
                        {"value": o, "label": o} for o in field["options"]
                    ]
                elif ftype == "number":
                    filter_def["type"] = "range"
                elif ftype == "date":
                    filter_def["type"] = "date_range"
                elif ftype == "boolean":
                    filter_def["type"] = "boolean"
                else:
                    filter_def["type"] = "text"
                result.append(filter_def)

    # Date filter for created_at
    result.append({
        "key": "created_at",
        "label": "Created Date",
        "type": "date_range",
    })

    return {"filters": result}


@entity_router.get(
    "/{entity_id}",
    dependencies=[Depends(require_permissions("entity:view"))],
)
def get_entity(
    entity=Depends(get_accessible_entity),
):
    return _build_entity_response(entity)


@entity_router.post(
    "/",
    dependencies=[Depends(require_permissions("entity:create"))],
    status_code=201,
)
def create_entity(
    data: EntityCreate,
    current_user: User = Depends(get_current_user),
    accessible_dv_ids: list[uuid.UUID] | None = Depends(get_accessible_dimension_value_ids),
    db: Session = Depends(get_db),
):
    service = EntityService(db)
    entity = service.create(
        current_user.organization_id,
        data.model_dump(exclude={"dimension_value_ids"}),
        dimension_value_ids=data.dimension_value_ids,
        accessible_dv_ids=accessible_dv_ids,
    )
    return _build_entity_response(entity)


@entity_router.put(
    "/{entity_id}",
    dependencies=[Depends(require_permissions("entity:edit"))],
)
def update_entity(
    data: EntityUpdate,
    entity=Depends(get_accessible_entity),
    db: Session = Depends(get_db),
):
    service = EntityService(db)
    entity = service.update(
        entity.id,
        entity.organization_id,
        data.model_dump(exclude_none=True),
    )
    return _build_entity_response(entity)


@entity_router.put(
    "/{entity_id}/dimensions",
    dependencies=[Depends(require_permissions("entity:edit"))],
)
def update_entity_dimensions(
    dimension_value_ids: list[str],
    entity=Depends(get_accessible_entity),
    accessible_dv_ids: list[uuid.UUID] | None = Depends(get_accessible_dimension_value_ids),
    db: Session = Depends(get_db),
):
    service = EntityService(db)
    entity = service.update_dimensions(
        entity.id,
        entity.organization_id,
        dimension_value_ids,
        accessible_dv_ids=accessible_dv_ids,
    )
    return _build_entity_response(entity)


router.include_router(entity_type_router)
router.include_router(entity_router)
