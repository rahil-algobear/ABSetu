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


def _build_entity_response(
    e,
    enrollment_count: int = 0,
    activity_count: int = 0,
    created_by_name: str | None = None,
    enrollment_status: str | None = None,
) -> dict:
    meta = e.meta or {}
    dim_infos = []
    for d in e.dimensions or []:
        dv = d.dimension_value
        if dv and dv.dimension:
            dim_infos.append(
                DimensionInfo(
                    dimension_id=str(dv.dimension.id),
                    dimension_key=dv.dimension.key,
                    dimension_name=dv.dimension.name,
                    value_id=str(dv.id),
                    value_name=dv.name,
                    value_code=dv.code,
                ).model_dump()
            )
    return EntityResponse(
        id=str(e.id),
        created_at=e.created_at,
        updated_at=e.updated_at,
        organization_id=str(e.organization_id),
        entity_type_id=str(e.entity_type_id),
        code=e.code,
        created_by=str(e.created_by) if e.created_by else None,
        created_by_name=created_by_name,
        meta=meta,
        entity_type_name=e.entity_type.name if e.entity_type else None,
        entity_type_key=e.entity_type.key if e.entity_type else None,
        entity_type_config=e.entity_type.config if e.entity_type else None,
        entity_type_can_enroll=e.entity_type.can_enroll if e.entity_type else True,
        dimensions=dim_infos,
        enrollment_count=enrollment_count,
        activity_count=activity_count,
        enrollment_status=enrollment_status,
    ).dump()


def _enrollment_relevant_dim_ids(
    db: Session, org_id: uuid.UUID, entity_type_id: uuid.UUID | None
) -> set[uuid.UUID]:
    """Dimension IDs that the org's enrollment form-builder tracks for
    this entity type. The smart picker's 'in scope' check filters the
    activity's dimensions down to these — activities can carry extra
    dims (Project, Intervention) that enrollments don't track, and we
    don't want those to exclude otherwise-matching enrollments."""
    from app.modules.organization.service import MetaFieldSchemaService

    meta_service = MetaFieldSchemaService(db)
    relevant: set[uuid.UUID] = set()

    def _harvest(fields: list[dict]) -> None:
        for fd in fields:
            if fd.get("type") == "dimension" and fd.get("dimension_id"):
                relevant.add(uuid.UUID(fd["dimension_id"]))

    _harvest(meta_service.get_schema_by_scope(org_id, "enrollment"))
    if entity_type_id:
        _harvest(
            meta_service.get_schema_by_scope(org_id, "enrollment", entity_type_id=entity_type_id)
        )
    # NOTE: dimension-value scoped enrollment fields are intentionally
    # excluded — they only apply to enrollments that already match those
    # values, so they'd circularly bias the scope check.
    return relevant


def _compute_enrollment_status_map(
    db: Session,
    org_id: uuid.UUID,
    entity_type_id: uuid.UUID | None,
    entity_ids: list[uuid.UUID],
    activity_dv_ids: set[uuid.UUID],
) -> dict[uuid.UUID, str]:
    """Per-entity 'active_in_scope' / 'no_active_in_scope' for the
    smart participant picker. An entity is active_in_scope iff it has
    at least one active enrollment whose dimension values cover all
    enrollment-tracked dimensions the activity carries. Activity dims
    on axes the enrollment doesn't track (e.g. Project/Intervention)
    are ignored — they're activity-scoping, not enrollment-scoping."""
    from app.modules.enrollment.model import Enrollment

    if not entity_ids:
        return {}

    # Filter activity_dv_ids down to the dimensions the enrollment
    # schema actually tracks.
    relevant_dim_ids = _enrollment_relevant_dim_ids(db, org_id, entity_type_id)
    if relevant_dim_ids and activity_dv_ids:
        from app.modules.dimension.model import DimensionValue

        dv_rows = (
            db.query(DimensionValue.id, DimensionValue.dimension_id)
            .filter(DimensionValue.id.in_(activity_dv_ids))
            .all()
        )
        scoped_activity_dvs = {dv_id for dv_id, dim_id in dv_rows if dim_id in relevant_dim_ids}
    else:
        scoped_activity_dvs = set()

    enrollments = (
        db.query(Enrollment)
        .filter(Enrollment.entity_id.in_(entity_ids), Enrollment.is_active.is_(True))
        .all()
    )
    by_entity: dict[uuid.UUID, list[set[uuid.UUID]]] = {}
    for e in enrollments:
        by_entity.setdefault(e.entity_id, []).append(
            {d.dimension_value_id for d in (e.dimensions or [])}
        )
    result: dict[uuid.UUID, str] = {}
    for eid in entity_ids:
        en_dvs = by_entity.get(eid, [])
        if any(scoped_activity_dvs.issubset(s) for s in en_dvs):
            result[eid] = "active_in_scope"
        else:
            result[eid] = "no_active_in_scope"
    return result


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
    # exclude_unset (not exclude_none) so an explicit null on
    # nullable columns like max_active_enrollments can clear them.
    et = service.update(
        entity_type_id,
        current_user.organization_id,
        data.model_dump(exclude_unset=True),
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
    entity_type_id: uuid.UUID | None = Query(None),
    with_enrollment_status_for_activity: uuid.UUID
    | None = Query(
        None,
        description=(
            "When set, each row gets an enrollment_status field indicating "
            "whether the entity has an active enrollment whose dimensions "
            "cover this activity's dimension scope."
        ),
    ),
    current_user: User = Depends(get_current_user),
    accessible_dv_ids: list[uuid.UUID] | None = Depends(get_accessible_dimension_value_ids),
    db: Session = Depends(get_db),
):
    import json

    service = EntityService(db)

    # Merge entity_type_id into filters JSON so apply_filters handles it uniformly
    merged_filters = filters
    if entity_type_id:
        try:
            f = json.loads(filters) if filters else {}
        except (json.JSONDecodeError, TypeError):
            f = {}
        f["entity_type_id"] = str(entity_type_id)
        merged_filters = json.dumps(f)

    params = ListParams(
        page=page,
        limit=limit,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
        filters=merged_filters,
    )

    # Load list config for meta field filter/sort support
    list_columns = None
    if entity_type_id:
        from app.modules.organization.service import ListConfigService

        list_columns = ListConfigService(db).get_config(
            current_user.organization_id, f"entity:{entity_type_id}"
        )

    rows, total = service.list_by_org_paginated(
        current_user.organization_id,
        params=params,
        accessible_dv_ids=accessible_dv_ids,
        list_columns=list_columns,
    )

    status_map: dict[uuid.UUID, str] = {}
    if with_enrollment_status_for_activity is not None:
        from app.modules.dimension.model import ActivityDimension

        activity_dvs = (
            db.query(ActivityDimension.dimension_value_id)
            .filter(ActivityDimension.activity_id == with_enrollment_status_for_activity)
            .all()
        )
        activity_dv_ids = {row[0] for row in activity_dvs}
        page_entity_ids = [entity.id for entity, *_ in rows]
        status_map = _compute_enrollment_status_map(
            db,
            current_user.organization_id,
            entity_type_id,
            page_entity_ids,
            activity_dv_ids,
        )

    data = [
        _build_entity_response(
            entity,
            enrollment_count,
            activity_count,
            created_by_name,
            enrollment_status=status_map.get(entity.id),
        )
        for entity, enrollment_count, activity_count, created_by_name in rows
    ]
    return PaginatedResponse(count=total, data=data)


@entity_router.get("/filters", dependencies=[Depends(require_permissions("entity:view"))])
def get_entity_filters(
    entity_type_id: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    accessible_dv_ids: list[uuid.UUID] | None = Depends(get_accessible_dimension_value_ids),
    db: Session = Depends(get_db),
):
    """Return available filter definitions, sortable keys, and visible columns for entity list."""
    from app.common.helpers.filter_definitions import build_list_filter_response

    org_id = current_user.organization_id

    # Build type filter
    et_service = EntityTypeService(db)
    entity_types = et_service.list_by_org(org_id)
    type_filter = None
    if entity_types:
        type_filter = {
            "key": "entity_type_id",
            "label": "Entity Type",
            "type": "select",
            "options": [{"value": str(et.id), "label": et.name} for et in entity_types],
        }

    # Build meta scopes
    if entity_type_id:
        meta_scopes = [{"scope_type": "entity", "entity_type_id": entity_type_id}]
    else:
        meta_scopes = [{"scope_type": "entity", "entity_type_id": et.id} for et in entity_types]

    # Created-by user dropdown — gated by list config in the helper
    org_users = db.query(User).filter_by(organization_id=org_id).all()
    created_by_filter = {
        "key": "created_by",
        "label": "Created By",
        "type": "select",
        "options": [
            {"value": str(u.id), "label": f"{u.first_name} {u.last_name}"} for u in org_users
        ],
    }

    return build_list_filter_response(
        db,
        org_id,
        accessible_dv_ids,
        type_filter=type_filter,
        type_id=entity_type_id,
        scope_prefix="entity",
        meta_scopes=meta_scopes,
        date_filters=[{"key": "created_at", "label": "Created Date"}],
        default_sortable_keys=["name", "code", "created_at"],
        extra_filters=[created_by_filter],
    )


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
    org_id = current_user.organization_id
    service = EntityService(db)
    entity = service.create(
        org_id,
        data.model_dump(exclude={"dimension_value_ids"}),
        dimension_value_ids=data.dimension_value_ids,
        accessible_dv_ids=accessible_dv_ids,
        created_by=current_user.id,
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
