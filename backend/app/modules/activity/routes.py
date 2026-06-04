"""
Activity, ActivityType, ActivityParticipant routes
"""

import uuid

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.common.dependencies import (
    get_accessible_activity,
    get_accessible_dimension_value_ids,
    get_current_user,
    require_permissions,
)
from app.common.exceptions import ValidationError
from app.common.export import EXPORT_ROW_CAP, build_xlsx, export_filename, format_export_value
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
    ParticipantBulkPatchPayload,
    ParticipantResponse,
    PickerAddPayload,
    PickerCreateAndAddPayload,
    PickerEnrollAndAddPayload,
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
    for dv_id in dimension_value_ids or []:
        for fd in meta_service.get_schema_by_scope(org_id, "activity", dimension_value_id=dv_id):
            all_field_defs[fd["key"]] = fd
        if activity_type_id:
            for fd in meta_service.get_schema_by_scope(
                org_id,
                "activity",
                activity_type_id=activity_type_id,
                dimension_value_id=dv_id,
            ):
                all_field_defs[fd["key"]] = fd
    return all_field_defs


def _build_activity_response(
    a, field_defs: dict[str, dict] | None = None, created_by_name: str | None = None
) -> dict:
    """Build ActivityResponse dict from an Activity model instance."""
    meta = a.meta or {}
    dim_infos = []
    for d in a.dimensions or []:
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

    activity_type_name = a.activity_type.name if a.activity_type else None

    return ActivityResponse(
        id=str(a.id),
        created_at=a.created_at,
        updated_at=a.updated_at,
        organization_id=str(a.organization_id),
        activity_type_id=str(a.activity_type_id) if a.activity_type_id else None,
        created_by=str(a.created_by) if a.created_by else None,
        created_by_name=created_by_name,
        meta=meta,
        activity_type_name=activity_type_name,
        dimensions=dim_infos,
    ).dump()


def _export_activity_cell(activity, participant_count, created_by_name, section_counts, col: dict):
    """Resolve one column's value for an activity export row.

    Mirrors the frontend renderCellValue: static built-ins, per-section
    participant counts (entity_list / user_list), dimension names, and meta
    fields formatted via the shared export formatter.
    """
    field_type = col.get("field_type")
    key = col["key"]

    if field_type == "static":
        return {
            "participant_count": participant_count or 0,
            "created_at": activity.created_at,
            "created_by": created_by_name or "",
        }.get(key, "")

    # entity_list / user_list columns render a participant count (keyed by the
    # same meta:<field_key> the section-count map uses). Checked before the
    # meta branch since these keys also start with "meta:".
    if field_type in ("entity_list", "user_list"):
        return section_counts.get(key, 0)

    if field_type == "dimension":
        dim_key = col.get("dimension_key")
        names = [
            d.dimension_value.name
            for d in (activity.dimensions or [])
            if d.dimension_value
            and d.dimension_value.dimension
            and d.dimension_value.dimension.key == dim_key
        ]
        return ", ".join(names)

    meta_key = key[len("meta:") :] if key.startswith("meta:") else key
    return format_export_value(field_type, (activity.meta or {}).get(meta_key))


@activity_router.get("/", dependencies=[Depends(require_permissions("activity:view"))])
def list_activities(
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    search: str | None = Query(None),
    sort_by: str | None = Query(None),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    filters: str | None = Query(None),
    activity_type_id: uuid.UUID | None = Query(None),
    entity_id: uuid.UUID | None = Query(None),
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
        participant_entity_id=entity_id,
    )

    # Per-section participant counts, keyed by the column key the list
    # config uses (meta:<field_key>), so entity_list / user_list columns
    # can render a count instead of "—". Only meaningful when scoped to a
    # single activity type (the list always is) — that's where we know
    # the section → column mapping from the schema.
    section_to_colkey: dict[str, str] = {}
    if activity_type_id:
        for fd in _collect_field_defs(
            db, current_user.organization_id, activity_type_id
        ).values():
            ftype = fd.get("type")
            if ftype == "user_list":
                section_to_colkey["user"] = f"meta:{fd['key']}"
            elif ftype == "entity_list":
                skey = fd.get("entity_type_id") or fd["key"]
                section_to_colkey[str(skey)] = f"meta:{fd['key']}"

    counts_by_activity: dict[uuid.UUID, dict[str, int]] = {}
    if section_to_colkey:
        from sqlalchemy import func as _func

        from app.modules.activity.model import ActivityParticipant

        activity_ids = [a.id for a, _, _ in rows]
        if activity_ids:
            grouped = (
                db.query(
                    ActivityParticipant.activity_id,
                    ActivityParticipant.section_key,
                    _func.count(ActivityParticipant.id),
                )
                .filter(ActivityParticipant.activity_id.in_(activity_ids))
                .group_by(
                    ActivityParticipant.activity_id,
                    ActivityParticipant.section_key,
                )
                .all()
            )
            for aid, skey, cnt in grouped:
                counts_by_activity.setdefault(aid, {})[str(skey)] = cnt

    data = []
    for activity, participant_count, created_by_name in rows:
        resp = _build_activity_response(activity, created_by_name=created_by_name)
        resp["participant_count"] = participant_count or 0
        if section_to_colkey:
            per_section = counts_by_activity.get(activity.id, {})
            resp["section_counts"] = {
                colkey: per_section.get(skey, 0)
                for skey, colkey in section_to_colkey.items()
            }
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
        type_id=activity_type_id,
        scope_prefix="activity",
        meta_scopes=meta_scopes,
        date_filters=[
            {"key": "created_at", "label": "Created Date"},
        ],
        default_sortable_keys=["created_at"],
        extra_filters=[created_by_filter],
    )


@activity_router.get("/export", dependencies=[Depends(require_permissions("activity:export"))])
def export_activities(
    search: str | None = Query(None),
    sort_by: str | None = Query(None),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    filters: str | None = Query(None),
    activity_type_id: uuid.UUID | None = Query(None),
    entity_id: uuid.UUID | None = Query(None),
    columns: str = Query(
        "all",
        pattern="^(all|visible)$",
        description="Which columns to include: 'all' defined fields (default) or "
        "only the 'visible' listing columns.",
    ),
    current_user: User = Depends(get_current_user),
    accessible_dv_ids: list[uuid.UUID] | None = Depends(get_accessible_dimension_value_ids),
    db: Session = Depends(get_db),
):
    """Download activities as an Excel file.

    Honors the same search / filters / sort and org + dimension scoping as the
    activity list. Pass the active list filters for a "current view" export, or
    omit them for "all". `columns` selects all defined fields (default) or only
    the visible listing columns. XLSX only.
    """
    import json

    service = ActivityService(db)

    # Merge activity_type_id into filters JSON (matches the list endpoint).
    merged_filters = filters
    if activity_type_id:
        try:
            f = json.loads(filters) if filters else {}
        except (json.JSONDecodeError, TypeError):
            f = {}
        f["activity_type_id"] = str(activity_type_id)
        merged_filters = json.dumps(f)

    # page/limit are unused by the export path but required by ListParams.
    params = ListParams(
        page=1,
        limit=1,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
        filters=merged_filters,
    )

    # `list_columns` (the configured listing columns) drives the export query so
    # the filter/search/sort and the resulting row set match the listing.
    # `output_columns` is the full field catalog — every defined field, not just
    # the visible ones — and drives which columns land in the spreadsheet.
    list_columns = None
    output_columns = None
    type_name = "Activities"
    if activity_type_id:
        from app.modules.organization.service import ListConfigService

        settings = ListConfigService(db).get_settings(
            current_user.organization_id, f"activity:{activity_type_id}"
        )
        list_columns = settings["columns"]
        output_columns = settings["columns"] + settings["available_columns"]
        at = ActivityTypeService(db).get_by_id(activity_type_id, current_user.organization_id)
        type_name = at.name if at else "Activities"

    rows, truncated = service.list_all_for_export(
        current_user.organization_id,
        params=params,
        accessible_dv_ids=accessible_dv_ids,
        list_columns=list_columns,
    )
    if truncated:
        raise ValidationError(
            f"This export exceeds the {EXPORT_ROW_CAP:,}-row limit. "
            "Apply filters to narrow the results, then download again."
        )

    # Per-section participant counts for entity_list / user_list columns, keyed
    # by the column key the list config uses (meta:<field_key>) — same mapping
    # the list endpoint applies.
    section_to_colkey: dict[str, str] = {}
    if activity_type_id:
        for fd in _collect_field_defs(
            db, current_user.organization_id, activity_type_id
        ).values():
            ftype = fd.get("type")
            if ftype == "user_list":
                section_to_colkey["user"] = f"meta:{fd['key']}"
            elif ftype == "entity_list":
                skey = fd.get("entity_type_id") or fd["key"]
                section_to_colkey[str(skey)] = f"meta:{fd['key']}"

    counts_by_activity: dict[uuid.UUID, dict[str, int]] = {}
    if section_to_colkey:
        from sqlalchemy import func as _func

        from app.modules.activity.model import ActivityParticipant

        activity_ids = [a.id for a, _, _ in rows]
        if activity_ids:
            grouped = (
                db.query(
                    ActivityParticipant.activity_id,
                    ActivityParticipant.section_key,
                    _func.count(ActivityParticipant.id),
                )
                .filter(ActivityParticipant.activity_id.in_(activity_ids))
                .group_by(
                    ActivityParticipant.activity_id,
                    ActivityParticipant.section_key,
                )
                .all()
            )
            for aid, skey, cnt in grouped:
                counts_by_activity.setdefault(aid, {})[str(skey)] = cnt

    # Pick the output columns: all defined fields (default) or only the visible
    # listing columns, per the `columns` query param. With no type scope
    # (all-types export) fall back to a minimal static set.
    if columns == "visible":
        export_columns = [c for c in (list_columns or []) if c.get("visible", True)]
    else:
        export_columns = output_columns
    if not export_columns:
        export_columns = [
            {"key": "participant_count", "label": "Participants", "field_type": "static"},
            {"key": "created_at", "label": "Created", "field_type": "static"},
            {"key": "created_by", "label": "Created By", "field_type": "static"},
        ]

    headers = [c["label"] for c in export_columns]
    data_rows = []
    for activity, participant_count, created_by_name in rows:
        section_counts: dict[str, int] = {}
        if section_to_colkey:
            per = counts_by_activity.get(activity.id, {})
            section_counts = {
                colkey: per.get(skey, 0) for skey, colkey in section_to_colkey.items()
            }
        data_rows.append(
            [
                _export_activity_cell(
                    activity, participant_count, created_by_name, section_counts, col
                )
                for col in export_columns
            ]
        )

    content = build_xlsx(headers, data_rows, sheet_name=type_name)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{export_filename(type_name)}"'
        },
    )


@activity_router.get(
    "/entity/{entity_id}",
    dependencies=[Depends(require_permissions("activity:view"))],
)
def list_activities_by_entity(
    entity_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    accessible_dv_ids: list[uuid.UUID] | None = Depends(get_accessible_dimension_value_ids),
    db: Session = Depends(get_db),
):
    service = ActivityService(db)
    activities = service.list_by_entity(
        entity_id,
        current_user.organization_id,
        accessible_dv_ids=accessible_dv_ids,
    )
    return [_build_activity_response(a) for a in activities]


@activity_router.get(
    "/{activity_id}",
    dependencies=[Depends(require_permissions("activity:view"))],
)
def get_activity(
    activity=Depends(get_accessible_activity),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _build_activity_response(activity)


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
    all_field_defs = _collect_field_defs(db, current_user.organization_id, type_uuid, dv_uuids)

    submitted_meta = data.meta or {}

    # Validate required fields
    # Resolve which dimension IDs are covered by submitted values
    submitted_dim_ids = set()
    if data.dimension_value_ids:
        dvs = db.query(DimensionValue.dimension_id).filter(DimensionValue.id.in_(dv_uuids)).all()
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
    return _build_activity_response(activity)


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
            if stage not in ("both", "edit"):
                continue
            fd_type = fd.get("type")
            if fd_type in ("dimension", "entity_list", "user_list"):
                continue
            val = submitted_meta.get(fd["key"])
            if val is None or val == "":
                raise ValidationError(f"{fd.get('label', fd['key'])} is required")

    service = ActivityService(db)
    updated = service.update(activity.id, data.model_dump(exclude_none=True))
    return _build_activity_response(updated)


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
        resp = ParticipantResponse(
            id=str(p.id),
            updated_at=p.updated_at,
            activity_id=str(p.activity_id),
            participant_type=p.participant_type,
            participant_id=str(p.participant_id),
            section_key=p.section_key,
            status=p.status,
            meta=p.meta,
        )
        results.append(resp.dump())
    return results


@activity_router.get(
    "/{activity_id}/participants/page",
    dependencies=[Depends(require_permissions("activity:view"))],
)
def get_participants_paginated(
    section_key: str = Query(..., min_length=1),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    search: str | None = Query(None),
    sort_by: str | None = Query(None),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    activity=Depends(get_accessible_activity),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Paginated participants scoped to a single section of an activity.

    Supports search and sort_by=name. Each row carries a resolved
    display_name (entity: first visible meta column of its type's list
    config; user: first + last name) so the frontend doesn't have to
    batch-fetch names per page.
    """
    service = ActivityParticipantService(db)
    rows, total = service.list_by_activity_paginated(
        org_id=current_user.organization_id,
        activity_id=activity.id,
        section_key=section_key,
        page=page,
        limit=limit,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    name_by_row_id = service.resolve_display_names(
        current_user.organization_id, rows
    )
    data = [
        ParticipantResponse(
            id=str(p.id),
            updated_at=p.updated_at,
            activity_id=str(p.activity_id),
            participant_type=p.participant_type,
            participant_id=str(p.participant_id),
            section_key=p.section_key,
            status=p.status,
            meta=p.meta,
            display_name=name_by_row_id.get(p.id),
        ).dump()
        for p in rows
    ]
    return PaginatedResponse(count=total, data=data)


@activity_router.patch(
    "/{activity_id}/participants",
    dependencies=[Depends(require_permissions("activity:create"))],
)
def bulk_patch_participants(
    data: ParticipantBulkPatchPayload,
    activity=Depends(get_accessible_activity),
    db: Session = Depends(get_db),
):
    """Apply per-row participant updates and removes atomically. Rows
    not in either list are left untouched — the page-by-page edit flow
    relies on this to save only the rows the user actually touched."""
    service = ActivityParticipantService(db)
    service.bulk_patch(
        activity_id=activity.id,
        updates=[u.model_dump() for u in data.updates],
        removes=[r.model_dump() for r in data.removes],
    )
    return {"ok": True}


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


# --- Smart picker (Phase 3) — per-action endpoints ---


def _participant_response(p) -> dict:
    return ParticipantResponse(
        id=str(p.id),
        updated_at=p.updated_at,
        activity_id=str(p.activity_id),
        participant_type=p.participant_type,
        participant_id=str(p.participant_id),
        section_key=p.section_key,
        status=p.status,
        meta=p.meta,
    ).dump()


def _create_picker_participant(
    db: Session,
    activity_id: uuid.UUID,
    entity_id: uuid.UUID,
    section_key: str,
    participant_type: str = "entity",
):
    """Common tail of every picker action — creates the ActivityParticipant
    row. Caller is responsible for the surrounding transaction."""
    from sqlalchemy.exc import IntegrityError as SAIntegrityError

    from app.modules.activity.model import ActivityParticipant

    p = ActivityParticipant(
        activity_id=activity_id,
        participant_type=participant_type,
        participant_id=entity_id,
        section_key=section_key,
    )
    db.add(p)
    try:
        db.flush()
    except SAIntegrityError:
        db.rollback()
        raise ValidationError("This participant is already in this activity.")
    return p


def _verify_dimensions_cover_activity(
    db: Session,
    org_id: uuid.UUID,
    entity_type_id: uuid.UUID,
    activity,
    submitted_dv_ids: list[str],
) -> None:
    """The picker auto-supplies activity dimensions to new enrollments;
    we still verify server-side that the submitted set covers them.
    Only the activity dimensions on axes the enrollment form actually
    tracks are required — extra activity dims (e.g. Project,
    Intervention) are ignored."""
    from app.common.helpers.enrollment_scope import (
        get_enrollment_relevant_dim_ids,
        scope_activity_dvs,
    )

    all_activity_dvs = {ad.dimension_value_id for ad in (activity.dimensions or [])}
    relevant_dim_ids = get_enrollment_relevant_dim_ids(db, org_id, entity_type_id)
    required = scope_activity_dvs(db, all_activity_dvs, relevant_dim_ids)
    if not required:
        return
    submitted = {uuid.UUID(d) for d in submitted_dv_ids}
    if not required.issubset(submitted):
        raise ValidationError(
            "Enrollment dimensions must include this activity's enrollment-tracked dimensions."
        )


@activity_router.post(
    "/{activity_id}/participants/add",
    dependencies=[Depends(require_permissions("activity:create"))],
    status_code=201,
)
def picker_add(
    data: PickerAddPayload,
    activity=Depends(get_accessible_activity),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a participant via the picker.

    Smart-mode entity rows: beneficiary already has an active enrollment
    in scope (verified server-side here). Basic-mode entity rows (non-
    enrollable type or dimensionless activity) and user rows skip the
    scope check entirely."""
    from app.modules.enrollment.model import Enrollment

    participant_uuid = uuid.UUID(data.entity_id)

    # User participants skip all entity/enrollment checks — they're
    # facilitators/staff, not beneficiaries.
    if data.participant_type == "entity":
        # Re-derive correctness when activity has dimensions AND the
        # entity type is enrollable. Otherwise (Basic mode) skip the
        # scope check.
        activity_dv_ids = {ad.dimension_value_id for ad in (activity.dimensions or [])}
        if activity_dv_ids:
            from app.common.helpers.enrollment_scope import enrollment_in_activity_scope
            from app.modules.entity.model import Entity

            entity = (
                db.query(Entity)
                .filter_by(id=participant_uuid, organization_id=current_user.organization_id)
                .first()
            )
            if not entity:
                raise ValidationError("Beneficiary not found in this organization.")
            if entity.entity_type.can_enroll:
                actives = (
                    db.query(Enrollment)
                    .filter(
                        Enrollment.entity_id == participant_uuid,
                        Enrollment.is_active.is_(True),
                    )
                    .all()
                )
                in_scope = any(
                    enrollment_in_activity_scope(
                        db,
                        current_user.organization_id,
                        entity.entity_type_id,
                        {d.dimension_value_id for d in (e.dimensions or [])},
                        activity_dv_ids,
                    )
                    for e in actives
                )
                if not in_scope:
                    raise ValidationError(
                        "This beneficiary has no active enrollment matching this "
                        "activity's scope. Use Enroll & Add instead."
                    )

    p = _create_picker_participant(
        db,
        activity.id,
        participant_uuid,
        data.section_key,
        participant_type=data.participant_type,
    )
    db.commit()
    db.refresh(p)
    return _participant_response(p)


@activity_router.post(
    "/{activity_id}/participants/enroll_and_add",
    dependencies=[Depends(require_permissions("activity:create"))],
    status_code=201,
)
def picker_enroll_and_add(
    data: PickerEnrollAndAddPayload,
    activity=Depends(get_accessible_activity),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Smart-picker action: existing beneficiary, no active enrollment
    in scope. Creates a fresh active enrollment (any old inactive ones
    stay as historical record) and adds as participant. Atomic."""
    from app.modules.enrollment.service import EnrollmentService
    from app.modules.entity.model import Entity

    entity_row = (
        db.query(Entity.entity_type_id)
        .filter_by(
            id=uuid.UUID(data.entity_id),
            organization_id=current_user.organization_id,
        )
        .first()
    )
    if not entity_row:
        raise ValidationError("Beneficiary not found in this organization.")
    _verify_dimensions_cover_activity(
        db,
        current_user.organization_id,
        entity_row[0],
        activity,
        data.enrollment_dimension_value_ids,
    )

    enrollment_service = EnrollmentService(db)
    try:
        enrollment_service.create(
            current_user.organization_id,
            {
                "entity_id": data.entity_id,
                "meta": data.enrollment_meta or {},
                "is_active": True,
            },
            dimension_value_ids=data.enrollment_dimension_value_ids,
            commit=False,
        )
        p = _create_picker_participant(db, activity.id, uuid.UUID(data.entity_id), data.section_key)
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(p)
    return _participant_response(p)


@activity_router.post(
    "/{activity_id}/participants/create_and_add",
    dependencies=[Depends(require_permissions("activity:create"))],
    status_code=201,
)
def picker_create_and_add(
    data: PickerCreateAndAddPayload,
    activity=Depends(get_accessible_activity),
    current_user: User = Depends(get_current_user),
    accessible_dv_ids: list[uuid.UUID] | None = Depends(get_accessible_dimension_value_ids),
    db: Session = Depends(get_db),
):
    """Picker action: brand new entity + (optional) active enrollment +
    participant in one transaction. Enrollment is skipped when the
    entity type isn't enrollable (e.g., Facilitator). Any step failing
    rolls everything back."""
    from app.modules.entity.model import EntityType
    from app.modules.enrollment.service import EnrollmentService
    from app.modules.entity.service import EntityService

    entity_type = (
        db.query(EntityType)
        .filter_by(
            id=uuid.UUID(data.entity_type_id),
            organization_id=current_user.organization_id,
        )
        .first()
    )
    if not entity_type:
        raise ValidationError("Entity type not found in this organization")

    can_enroll = bool(entity_type.can_enroll)

    if can_enroll:
        _verify_dimensions_cover_activity(
            db,
            current_user.organization_id,
            uuid.UUID(data.entity_type_id),
            activity,
            data.enrollment_dimension_value_ids,
        )

    entity_service = EntityService(db)
    enrollment_service = EnrollmentService(db)
    try:
        entity = entity_service.create(
            current_user.organization_id,
            {
                "entity_type_id": data.entity_type_id,
                "meta": data.entity_meta or {},
            },
            dimension_value_ids=data.entity_dimension_value_ids,
            accessible_dv_ids=accessible_dv_ids,
            created_by=current_user.id,
            commit=False,
        )
        if can_enroll:
            enrollment_service.create(
                current_user.organization_id,
                {
                    "entity_id": str(entity.id),
                    "meta": data.enrollment_meta or {},
                    "is_active": True,
                },
                dimension_value_ids=data.enrollment_dimension_value_ids,
                commit=False,
            )
        p = _create_picker_participant(db, activity.id, entity.id, data.section_key)
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(p)
    return _participant_response(p)


# Include sub-routers
router.include_router(activity_type_router)
router.include_router(activity_router)
