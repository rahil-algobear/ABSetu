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
from app.common.exceptions import ValidationError
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
    limit: int = Query(25, ge=1, le=1000),
    search: str | None = Query(None),
    sort_by: str | None = Query(None),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    filters: str | None = Query(None),
    entity_type_id: uuid.UUID | None = Query(None),
    ids: str
    | None = Query(
        None,
        description=(
            "Comma-separated list of entity UUIDs. When set, the response is "
            "restricted to these entities only — used by surfaces that need "
            "name lookups for a known set of IDs without pulling a full org."
        ),
    ),
    with_enrollment_status_for_activity: uuid.UUID
    | None = Query(
        None,
        description=(
            "When set, each row gets an enrollment_status field indicating "
            "whether the entity has an active enrollment whose dimensions "
            "cover this activity's dimension scope."
        ),
    ),
    enrollment_status_filter: str
    | None = Query(
        None,
        pattern="^(active_in_scope|no_active_in_scope)$",
        description=(
            "Filter rows by enrollment_status. Requires "
            "with_enrollment_status_for_activity. Applied before pagination "
            "so totals reflect the filtered set — backs the picker's "
            "accurate Enrolled count."
        ),
    ),
    current_user: User = Depends(get_current_user),
    accessible_dv_ids: list[uuid.UUID] | None = Depends(get_accessible_dimension_value_ids),
    db: Session = Depends(get_db),
):
    import json

    service = EntityService(db)

    # Early return path: explicit ID list (used by surfaces that need
    # name lookups for a known set without pulling a full org page).
    if ids:
        try:
            id_list = [uuid.UUID(s.strip()) for s in ids.split(",") if s.strip()]
        except ValueError:
            raise ValidationError("Invalid UUID in `ids` parameter.")
        if not id_list:
            return PaginatedResponse(count=0, data=[])
        # Hard cap to keep this from being abused; participant lookups
        # don't need more than a few hundred per page.
        if len(id_list) > 500:
            raise ValidationError("`ids` is capped at 500 entries per request.")
        rows = service.list_by_ids(
            current_user.organization_id, id_list, accessible_dv_ids=accessible_dv_ids
        )
        data = [
            _build_entity_response(entity, enrollment_count, activity_count, created_by_name)
            for entity, enrollment_count, activity_count, created_by_name in rows
        ]
        return PaginatedResponse(count=len(data), data=data)

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

    # If the caller wants enrollment_status info or a filter, compute the
    # active-in-scope entity set up front. Cheaper than per-row status
    # computation and also gives us accurate filtered totals.
    active_in_scope_ids: set[uuid.UUID] | None = None
    activity_dv_ids: set[uuid.UUID] = set()
    if with_enrollment_status_for_activity is not None:
        from app.common.helpers.enrollment_scope import (
            get_entities_active_in_activity_scope,
        )
        from app.modules.dimension.model import ActivityDimension

        activity_dvs = (
            db.query(ActivityDimension.dimension_value_id)
            .filter(ActivityDimension.activity_id == with_enrollment_status_for_activity)
            .all()
        )
        activity_dv_ids = {row[0] for row in activity_dvs}
        active_in_scope_ids = get_entities_active_in_activity_scope(
            db,
            current_user.organization_id,
            entity_type_id,
            activity_dv_ids,
        )

    include_ids: set[uuid.UUID] | None = None
    exclude_ids: set[uuid.UUID] | None = None
    if enrollment_status_filter == "active_in_scope":
        include_ids = active_in_scope_ids or set()
    elif enrollment_status_filter == "no_active_in_scope":
        exclude_ids = active_in_scope_ids or set()

    rows, total = service.list_by_org_paginated(
        current_user.organization_id,
        params=params,
        accessible_dv_ids=accessible_dv_ids,
        list_columns=list_columns,
        include_entity_ids=include_ids,
        exclude_entity_ids=exclude_ids,
    )

    status_map: dict[uuid.UUID, str] = {}
    if with_enrollment_status_for_activity is not None and active_in_scope_ids is not None:
        for entity, *_ in rows:
            status_map[entity.id] = (
                "active_in_scope" if entity.id in active_in_scope_ids else "no_active_in_scope"
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
