"""
Activity, ActivityType, ActivityParticipant routes
"""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.common.dependencies import (
    get_accessible_activity,
    get_accessible_dimension_value_ids,
    get_current_user,
    require_permissions,
)
from app.common.exceptions import ValidationError
from app.common.schemas.base_response import PaginatedResponse
from app.common.schemas.list_params import ListParams
from app.core.database import get_db
from app.modules.activity.schemas import (
    ActivityCreate,
    ActivityResponse,
    ActivityTypeCreate,
    ActivityTypeResponse,
    ActivityTypeUpdate,
    ActivityUpdate,
    DimensionInfo,
    ParticipantBulkCreate,
    ParticipantResponse,
)
from app.modules.activity.service import (
    ActivityParticipantService,
    ActivityService,
    ActivityTypeService,
)
from app.modules.auth.model import User
from app.modules.dimension.model import Dimension, DimensionValue
from app.modules.organization.service import MetaFieldSchemaService

router = APIRouter(tags=["activities"])


# --- Activity Types ---

activity_type_router = APIRouter(prefix="/activity-types")


@activity_type_router.get("/", dependencies=[Depends(require_permissions("activity_type:view"))])
def list_activity_types(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = ActivityTypeService(db)
    types = service.list_by_org(current_user.organization_id)
    return [ActivityTypeResponse.dump_from_model(t) for t in types]


@activity_type_router.get(
    "/{activity_type_id}",
    dependencies=[Depends(require_permissions("activity_type:view"))],
)
def get_activity_type(
    activity_type_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = ActivityTypeService(db)
    at = service.get_by_id(activity_type_id, current_user.organization_id)
    return ActivityTypeResponse.dump_from_model(at)


@activity_type_router.post(
    "/",
    dependencies=[Depends(require_permissions("activity_type:manage"))],
    status_code=201,
)
def create_activity_type(
    data: ActivityTypeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = ActivityTypeService(db)
    at = service.create(
        current_user.organization_id,
        data.model_dump(),
    )
    return ActivityTypeResponse.dump_from_model(at)


@activity_type_router.put(
    "/{activity_type_id}",
    dependencies=[Depends(require_permissions("activity_type:manage"))],
)
def update_activity_type(
    activity_type_id: uuid.UUID,
    data: ActivityTypeUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = ActivityTypeService(db)
    at = service.update(
        activity_type_id,
        current_user.organization_id,
        data.model_dump(exclude_none=True),
    )
    return ActivityTypeResponse.dump_from_model(at)


@activity_type_router.delete(
    "/{activity_type_id}",
    dependencies=[Depends(require_permissions("activity_type:manage"))],
)
def delete_activity_type(
    activity_type_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = ActivityTypeService(db)
    service.delete(activity_type_id, current_user.organization_id)
    return {"message": "Activity type deleted"}


# --- Activities ---

activity_router = APIRouter(prefix="/activities")


def _collect_field_defs(
    db: Session,
    org_id: uuid.UUID,
    activity_type_id: uuid.UUID | None,
    dimension_value_ids: list[uuid.UUID] | None = None,
) -> dict[str, dict]:
    """Collect all applicable meta field definitions for an activity."""
    meta_service = MetaFieldSchemaService(db)
    all_field_defs: dict[str, dict] = {}
    # Base scope
    for fd in meta_service.get_schema_by_scope(org_id, "activity"):
        all_field_defs[fd["key"]] = fd
    # Activity-type scope
    if activity_type_id:
        for fd in meta_service.get_schema_by_scope(
            org_id, "activity", activity_type_id=activity_type_id
        ):
            all_field_defs[fd["key"]] = fd
    # Dimension-value scopes
    for dv_id in (dimension_value_ids or []):
        for fd in meta_service.get_schema_by_scope(
            org_id, "activity", dimension_value_id=dv_id
        ):
            all_field_defs[fd["key"]] = fd
        if activity_type_id:
            for fd in meta_service.get_schema_by_scope(
                org_id, "activity",
                activity_type_id=activity_type_id, dimension_value_id=dv_id,
            ):
                all_field_defs[fd["key"]] = fd
    return all_field_defs


def _resolve_generated_title(activity, field_defs: dict[str, dict]) -> str | None:
    """Compose a generated title from dimension values based on title field config."""
    title_def = field_defs.get("title")
    if not title_def:
        return None
    config = title_def.get("config") or {}
    if config.get("mode") != "generated":
        return None
    dimension_ids = config.get("dimension_ids", [])
    separator = config.get("separator", " - ")
    if not dimension_ids:
        return None
    parts = []
    for dim_id in dimension_ids:
        for d in activity.dimensions or []:
            dv = d.dimension_value
            if dv and dv.dimension and str(dv.dimension.id) == dim_id:
                parts.append(dv.name)
                break
    return separator.join(parts) if parts else None


def _build_activity_response(a, field_defs: dict[str, dict] | None = None) -> dict:
    """Build ActivityResponse dict from an Activity model instance."""
    meta = a.meta or {}
    dim_infos = []
    for d in a.dimensions or []:
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

    activity_type_name = a.activity_type.name if a.activity_type else None

    # Resolve title: generated from dimensions, or from meta
    title = _resolve_generated_title(a, field_defs or {}) or meta.get("title")

    return ActivityResponse(
        id=str(a.id),
        created_at=a.created_at,
        updated_at=a.updated_at,
        organization_id=str(a.organization_id),
        activity_type_id=str(a.activity_type_id) if a.activity_type_id else None,
        title=title,
        start_date=meta.get("start_date", ""),
        end_date=meta.get("end_date"),
        notes=meta.get("notes"),
        created_by=str(a.created_by) if a.created_by else None,
        meta=meta,
        activity_type_name=activity_type_name,
        dimensions=dim_infos,
    ).dump()


def _load_field_defs_by_type(db: Session, activities: list, org_id: uuid.UUID) -> dict:
    """Load field defs for each unique activity_type_id, keyed by type ID string."""
    defs: dict = {}
    for a in activities:
        key = str(a.activity_type_id) if a.activity_type_id else None
        if key and key not in defs:
            defs[key] = _collect_field_defs(db, org_id, a.activity_type_id)
    return defs


@activity_router.get("/", dependencies=[Depends(require_permissions("activity:view"))])
def list_activities(
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    search: str | None = Query(None),
    sort_by: str | None = Query(None),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    filters: str | None = Query(None),
    activity_type_id: uuid.UUID | None = Query(None),
    current_user: User = Depends(get_current_user),
    accessible_dv_ids: list[uuid.UUID] | None = Depends(get_accessible_dimension_value_ids),
    db: Session = Depends(get_db),
):
    import json

    service = ActivityService(db)

    # Merge activity_type_id into filters JSON so apply_filters handles it uniformly
    merged_filters = filters
    if activity_type_id:
        try:
            f = json.loads(filters) if filters else {}
        except (json.JSONDecodeError, TypeError):
            f = {}
        f["activity_type_id"] = str(activity_type_id)
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
    if activity_type_id:
        from app.modules.organization.service import ListConfigService

        list_columns = ListConfigService(db).get_config(
            current_user.organization_id, f"activity:{activity_type_id}"
        )

    rows, total = service.list_by_org_paginated(
        current_user.organization_id,
        params=params,
        accessible_dv_ids=accessible_dv_ids,
        list_columns=list_columns,
    )

    # Load field defs for generated title resolution
    activities = [activity for activity, _count in rows]
    all_defs = _load_field_defs_by_type(db, activities, current_user.organization_id)

    data = []
    for activity, participant_count in rows:
        resp = _build_activity_response(
            activity,
            all_defs.get(str(activity.activity_type_id)) if activity.activity_type_id else None,
        )
        resp["participant_count"] = participant_count or 0
        data.append(resp)

    return PaginatedResponse(count=total, data=data)


@activity_router.get("/filters", dependencies=[Depends(require_permissions("activity:view"))])
def get_activity_filters(
    activity_type_id: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    accessible_dv_ids: list[uuid.UUID] | None = Depends(get_accessible_dimension_value_ids),
    db: Session = Depends(get_db),
):
    """Return available filter definitions, sortable keys, and visible columns for activity list."""
    from app.common.helpers.filter_definitions import build_list_filter_response

    org_id = current_user.organization_id

    # Build type filter
    at_service = ActivityTypeService(db)
    activity_types = at_service.list_by_org(org_id)
    type_filter = None
    if activity_types:
        type_filter = {
            "key": "activity_type_id",
            "label": "Activity Type",
            "type": "select",
            "options": [{"value": str(at.id), "label": at.name} for at in activity_types],
        }

    # Build meta scopes
    meta_scopes = [{"scope_type": "activity"}]
    if activity_type_id:
        meta_scopes.append({"scope_type": "activity", "activity_type_id": activity_type_id})
    else:
        meta_scopes.extend(
            {"scope_type": "activity", "activity_type_id": at.id} for at in activity_types
        )

    return build_list_filter_response(
        db,
        org_id,
        accessible_dv_ids,
        type_filter=type_filter,
        type_id=activity_type_id,
        scope_prefix="activity",
        meta_scopes=meta_scopes,
        date_filters=[
            {"key": "created_at", "label": "Created Date"},
        ],
        default_sortable_keys=["created_at"],
    )


@activity_router.get(
    "/entity/{entity_id}",
    dependencies=[Depends(require_permissions("activity:view"))],
)
def list_activities_by_entity(
    entity_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = ActivityService(db)
    activities = service.list_by_entity(entity_id, current_user.organization_id)
    all_defs = _load_field_defs_by_type(db, activities, current_user.organization_id)
    return [
        _build_activity_response(
            a, all_defs.get(str(a.activity_type_id)) if a.activity_type_id else None
        )
        for a in activities
    ]


@activity_router.get(
    "/{activity_id}",
    dependencies=[Depends(require_permissions("activity:view"))],
)
def get_activity(
    activity=Depends(get_accessible_activity),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    field_defs = _collect_field_defs(
        db, current_user.organization_id, activity.activity_type_id
    )
    return _build_activity_response(activity, field_defs)


@activity_router.post(
    "/",
    dependencies=[Depends(require_permissions("activity:create"))],
    status_code=201,
)
def create_activity(
    data: ActivityCreate,
    current_user: User = Depends(get_current_user),
    accessible_dv_ids: list[uuid.UUID] | None = Depends(get_accessible_dimension_value_ids),
    db: Session = Depends(get_db),
):
    activity_type_id = data.activity_type_id
    type_uuid = uuid.UUID(activity_type_id) if activity_type_id else None
    dv_uuids = [uuid.UUID(v) for v in (data.dimension_value_ids or [])]

    # Collect all field definitions from meta schemas
    all_field_defs = _collect_field_defs(
        db, current_user.organization_id, type_uuid, dv_uuids
    )

    submitted_meta = data.meta or {}

    # Validate required fields
    # Resolve which dimension IDs are covered by submitted values
    submitted_dim_ids = set()
    if data.dimension_value_ids:
        dvs = (
            db.query(DimensionValue.dimension_id)
            .filter(DimensionValue.id.in_(dv_uuids))
            .all()
        )
        submitted_dim_ids = {str(row[0]) for row in dvs}

    for fd in all_field_defs.values():
        if not fd.get("required"):
            continue
        stage = fd.get("stage") or "both"
        if stage not in ("both", "create"):
            continue

        fd_type = fd.get("type")
        if fd_type == "dimension":
            dim_id = fd.get("dimension_id")
            if dim_id and dim_id not in submitted_dim_ids:
                raise ValidationError(f"{fd.get('label', 'Dimension')} is required")
        elif fd_type in ("entity_list", "user_list"):
            pass  # validated at participant save time
        else:
            val = submitted_meta.get(fd["key"])
            if val is None or val == "":
                raise ValidationError(f"{fd.get('label', fd['key'])} is required")

    service = ActivityService(db)
    activity = service.create(
        current_user.organization_id,
        current_user.id,
        data.model_dump(exclude={"dimension_value_ids"}),
        data.dimension_value_ids,
        accessible_dv_ids=accessible_dv_ids,
    )
    return _build_activity_response(activity, all_field_defs)


@activity_router.put(
    "/{activity_id}",
    dependencies=[Depends(require_permissions("activity:create"))],
)
def update_activity(
    data: ActivityUpdate,
    activity=Depends(get_accessible_activity),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Validate required fields for the edit/record stage
    if data.meta is not None and activity.activity_type_id:
        all_field_defs = _collect_field_defs(
            db, current_user.organization_id, activity.activity_type_id
        )
        submitted_meta = data.meta or {}

        for fd in all_field_defs.values():
            if not fd.get("required"):
                continue
            stage = fd.get("stage") or "both"
            if stage not in ("both", "record"):
                continue
            fd_type = fd.get("type")
            if fd_type in ("dimension", "entity_list", "user_list"):
                continue
            val = submitted_meta.get(fd["key"])
            if val is None or val == "":
                raise ValidationError(f"{fd.get('label', fd['key'])} is required")

    service = ActivityService(db)
    updated = service.update(activity.id, data.model_dump(exclude_none=True))
    field_defs = _collect_field_defs(
        db, current_user.organization_id, updated.activity_type_id
    )
    return _build_activity_response(updated, field_defs)


@activity_router.delete(
    "/{activity_id}",
    dependencies=[Depends(require_permissions("activity:create"))],
)
def delete_activity(
    activity=Depends(get_accessible_activity),
    db: Session = Depends(get_db),
):
    service = ActivityService(db)
    service.delete(activity.id)
    return {"message": "Activity deleted"}


# --- Activity Participants ---


def _resolve_participant_name(db, participant_type, participant_id):
    """Look up participant name based on type."""
    if participant_type == "entity":
        from app.modules.entity.model import Entity

        entity = db.query(Entity).filter_by(id=participant_id).first()
        return (entity.meta or {}).get("name") if entity else None
    elif participant_type == "user":
        from app.modules.auth.model import User as UserModel

        user = UserModel
        u = db.query(user).filter_by(id=participant_id).first()
        if u:
            return f"{u.first_name} {u.last_name}".strip()
    return None


@activity_router.get(
    "/{activity_id}/participants",
    dependencies=[Depends(require_permissions("activity:view"))],
)
def get_participants(
    activity=Depends(get_accessible_activity),
    db: Session = Depends(get_db),
):
    service = ActivityParticipantService(db)
    participants = service.list_by_activity(activity.id)
    results = []
    for p in participants:
        name = _resolve_participant_name(db, p.participant_type, p.participant_id)
        resp = ParticipantResponse(
            id=str(p.id),
            updated_at=p.updated_at,
            activity_id=str(p.activity_id),
            participant_type=p.participant_type,
            participant_id=str(p.participant_id),
            section_key=p.section_key,
            status=p.status,
            meta=p.meta,
            participant_name=name,
        )
        results.append(resp.dump())
    return results


@activity_router.post(
    "/{activity_id}/participants",
    dependencies=[Depends(require_permissions("activity:create"))],
    status_code=201,
)
def save_participants(
    data: ParticipantBulkCreate,
    activity=Depends(get_accessible_activity),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Validate required entity_list/user_list sections from field definitions
    if activity.activity_type_id:
        all_field_defs = _collect_field_defs(
            db, current_user.organization_id, activity.activity_type_id
        )
        submitted_sections = {r.section_key for r in data.records}
        for fd in all_field_defs.values():
            fd_type = fd.get("type")
            if fd_type not in ("entity_list", "user_list") or not fd.get("required"):
                continue
            if fd_type == "user_list":
                section_key = "user"
            else:
                section_key = fd.get("entity_type_id") or fd["key"]
            if section_key not in submitted_sections:
                label = fd.get("label", "Participants")
                raise ValidationError(f"{label} is required — add at least one participant")

    # Validate required participant meta fields
    meta_service = MetaFieldSchemaService(db)

    activity_dv_ids = [
        ad.dimension_value_id for ad in (activity.dimensions or []) if ad.dimension_value_id
    ]

    for record in data.records:
        entity_type_id = MetaFieldSchemaService._resolve_entity_type_id(record.section_key)

        fields = meta_service.get_participant_schemas(
            current_user.organization_id,
            entity_type_id=entity_type_id,
            activity_type_id=activity.activity_type_id,
            dimension_value_ids=activity_dv_ids,
        )

        meta = record.meta or {}
        for f in fields:
            if f.get("required") and not meta.get(f["key"]):
                raise ValidationError(f'"{f["label"]}" is required for participants')

    service = ActivityParticipantService(db)
    participants = service.bulk_create(
        activity.id,
        [r.model_dump() for r in data.records],
    )
    return [
        ParticipantResponse(
            id=str(p.id),
            updated_at=p.updated_at,
            activity_id=str(p.activity_id),
            participant_type=p.participant_type,
            participant_id=str(p.participant_id),
            section_key=p.section_key,
            status=p.status,
            meta=p.meta,
        ).dump()
        for p in participants
    ]


# Include sub-routers
router.include_router(activity_type_router)
router.include_router(activity_router)
