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
    ActivityFormResponse,
    ActivityFormUpdate,
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
    ActivityFormService,
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


def _resolve_generated_title(activity, form) -> str | None:
    """Compose a generated title from dimension values based on form config."""
    if not form or not form.elements:
        return None
    title_el = next(
        (el for el in form.elements if el.get("type") == "default" and el.get("ref_id") == "title"),
        None,
    )
    if not title_el:
        return None
    config = title_el.get("config") or {}
    if config.get("mode") != "generated":
        return None
    dimension_ids = config.get("dimension_ids", [])
    separator = config.get("separator", " - ")
    if not dimension_ids:
        return None
    # Build title from dimension values in the configured order
    parts = []
    for dim_id in dimension_ids:
        for d in activity.dimensions or []:
            dv = d.dimension_value
            if dv and dv.dimension and str(dv.dimension.id) == dim_id:
                parts.append(dv.name)
                break
    return separator.join(parts) if parts else None


def _build_activity_response(a, form=None) -> dict:
    """Build ActivityResponse dict from an Activity model instance."""
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

    # Resolve title: generated from dimensions, or free-text from DB
    title = _resolve_generated_title(a, form) or a.title

    return ActivityResponse(
        id=str(a.id),
        updated_at=a.updated_at,
        organization_id=str(a.organization_id),
        activity_type_id=str(a.activity_type_id) if a.activity_type_id else None,
        title=title,
        start_date=a.start_date,
        end_date=a.end_date,
        notes=a.notes,
        created_by=str(a.created_by) if a.created_by else None,
        meta=a.meta,
        activity_type_name=activity_type_name,
        dimensions=dim_infos,
    ).dump()


def _load_forms_by_type(db: Session, activities: list, org_id: uuid.UUID) -> dict:
    """Load ActivityForm for each unique activity_type_id, keyed by type ID string."""
    form_service = ActivityFormService(db)
    forms: dict = {}
    for a in activities:
        key = str(a.activity_type_id) if a.activity_type_id else None
        if key and key not in forms:
            forms[key] = form_service.get_by_type(a.activity_type_id, org_id)
    return forms


@activity_router.get("/", dependencies=[Depends(require_permissions("activity:view"))])
def list_activities(
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    search: str | None = Query(None),
    sort_by: str | None = Query(None),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    filters: str | None = Query(None),
    # Legacy param — still supported, but prefer filters JSON
    activity_type_id: uuid.UUID | None = Query(None),
    current_user: User = Depends(get_current_user),
    accessible_dv_ids: list[uuid.UUID] | None = Depends(get_accessible_dimension_value_ids),
    db: Session = Depends(get_db),
):
    import json

    service = ActivityService(db)

    # Merge legacy activity_type_id param into filters if provided
    merged_filters = filters
    if activity_type_id:
        try:
            f = json.loads(filters) if filters else {}
        except (json.JSONDecodeError, TypeError):
            f = {}
        f["activity_type_id"] = str(activity_type_id)
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

    # Load forms for generated title resolution
    activities = [activity for activity, _count in rows]
    forms = _load_forms_by_type(db, activities, current_user.organization_id)

    data = []
    for activity, participant_count in rows:
        resp = _build_activity_response(
            activity, forms.get(str(activity.activity_type_id)) if activity.activity_type_id else None
        )
        resp["participant_count"] = participant_count or 0
        data.append(resp)

    return PaginatedResponse(count=total, data=data)


@activity_router.get("/filters", dependencies=[Depends(require_permissions("activity:view"))])
def get_activity_filters(
    current_user: User = Depends(get_current_user),
    accessible_dv_ids: list[uuid.UUID] | None = Depends(get_accessible_dimension_value_ids),
    db: Session = Depends(get_db),
):
    """Return available filter definitions for activity list."""
    from app.common.helpers.filter_definitions import (
        build_dimension_filters,
        build_meta_field_filters,
    )

    org_id = current_user.organization_id
    result = []

    # Activity type filter
    at_service = ActivityTypeService(db)
    activity_types = at_service.list_by_org(org_id)
    if activity_types:
        result.append({
            "key": "activity_type_id",
            "label": "Activity Type",
            "type": "select",
            "options": [{"value": str(at.id), "label": at.name} for at in activity_types],
        })

    # Dimension filters (scoped by user access)
    result.extend(build_dimension_filters(db, org_id, accessible_dv_ids))

    # Meta field filters (where is_filterable=true)
    scope_keys = [f"activity:{at.id}" for at in activity_types]
    result.extend(build_meta_field_filters(db, org_id, scope_keys))

    # Date filter for start_date
    result.append({
        "key": "start_date",
        "label": "Start Date",
        "type": "date_range",
    })

    # Sortable keys (static + meta)
    sort_config = ActivityService(db).get_sort_config(org_id)
    sortable_keys = list(sort_config.keys())

    return {"filters": result, "sortable_keys": sortable_keys}


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
    forms = _load_forms_by_type(db, activities, current_user.organization_id)
    return [
        _build_activity_response(
            a, forms.get(str(a.activity_type_id)) if a.activity_type_id else None
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
    form = None
    if activity.activity_type_id:
        form_service = ActivityFormService(db)
        form = form_service.get_by_type(activity.activity_type_id, current_user.organization_id)
    return _build_activity_response(activity, form)


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
    # Validate required form elements from form builder config
    activity_type_id = data.activity_type_id
    form = None
    if activity_type_id:
        form_service = ActivityFormService(db)
        form = form_service.get_by_type(uuid.UUID(activity_type_id), current_user.organization_id)
        if form and form.elements:
            # Resolve which dimension IDs are covered by the submitted values
            submitted_dim_ids = set()
            if data.dimension_value_ids:
                dvs = (
                    db.query(DimensionValue.dimension_id)
                    .filter(DimensionValue.id.in_([uuid.UUID(v) for v in data.dimension_value_ids]))
                    .all()
                )
                submitted_dim_ids = {str(row[0]) for row in dvs}

            for el in form.elements:
                if not el.get("required") or not el.get("visible", True):
                    continue
                el_type = el.get("type")
                if el_type == "dimension":
                    ref_id = el.get("ref_id")
                    if ref_id and ref_id not in submitted_dim_ids:
                        dim = db.query(Dimension).filter_by(id=ref_id).first()
                        dim_name = dim.name if dim else "Dimension"
                        raise ValidationError(f"{dim_name} is required")

    service = ActivityService(db)
    activity = service.create(
        current_user.organization_id,
        current_user.id,
        data.model_dump(exclude={"dimension_value_ids"}),
        data.dimension_value_ids,
        accessible_dv_ids=accessible_dv_ids,
    )
    return _build_activity_response(activity, form)


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
    service = ActivityService(db)
    updated = service.update(activity.id, data.model_dump(exclude_none=True))
    form = None
    if updated.activity_type_id:
        form_service = ActivityFormService(db)
        form = form_service.get_by_type(updated.activity_type_id, current_user.organization_id)
    return _build_activity_response(updated, form)


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
        return entity.name if entity else None
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

    # Validate required entity_type sections from form builder config
    if activity.activity_type_id:
        form_service = ActivityFormService(db)
        form = form_service.get_by_type(activity.activity_type_id, current_user.organization_id)
        if form and form.elements:
            submitted_sections = {r.section_key for r in data.records}
            for el in form.elements:
                if (
                    el.get("type") == "entity_type"
                    and el.get("required")
                    and el.get("visible", True)
                ):
                    section_key = el.get("ref_id") or el.get("type")
                    if section_key not in submitted_sections:
                        ref_id = el.get("ref_id")
                        if ref_id == "user":
                            label = "Users (staff)"
                        else:
                            from app.modules.entity.model import EntityType

                            et = db.query(EntityType).filter_by(id=ref_id).first()
                            label = et.name if et else "Participants"
                        raise ValidationError(f"{label} is required — add at least one participant")

    # Validate required participant meta fields
    meta_service = MetaFieldSchemaService(db)
    all_schemas = meta_service.get_all_schemas(current_user.organization_id)

    activity_type_id_str = (
        str(activity.activity_type_id) if activity.activity_type_id else None
    )
    activity_dv_ids = []
    for ad in activity.dimensions or []:
        if ad.dimension_value_id:
            activity_dv_ids.append(str(ad.dimension_value_id))

    for record in data.records:
        base = f"participant:entity:{record.section_key}"
        # Collect all applicable meta field definitions for this participant
        fields: list[dict] = []
        fields.extend(all_schemas.get(base, []))
        if activity_type_id_str:
            fields.extend(all_schemas.get(f"{base}:activity_type:{activity_type_id_str}", []))
        for dv_id in activity_dv_ids:
            fields.extend(all_schemas.get(f"{base}:dimension_value:{dv_id}", []))
            if activity_type_id_str:
                fields.extend(
                    all_schemas.get(
                        f"{base}:activity_type:{activity_type_id_str}:dimension_value:{dv_id}", []
                    )
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


# --- Activity Forms ---

form_router = APIRouter(prefix="/activity-forms")


@form_router.get(
    "/{activity_type_id}",
    dependencies=[Depends(require_permissions("activity_type:view"))],
)
def get_activity_form(
    activity_type_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = ActivityFormService(db)
    form = service.get_by_type(activity_type_id, current_user.organization_id)
    if not form:
        return {
            "activity_type_id": str(activity_type_id),
            "elements": list(ActivityFormService.DEFAULT_ELEMENTS),
        }
    # Ensure new default elements are present in existing forms
    patched_elements = ActivityFormService._ensure_defaults(list(form.elements))
    resp = ActivityFormResponse.dump_from_model(form)
    resp["elements"] = patched_elements
    return resp


@form_router.put(
    "/{activity_type_id}",
    dependencies=[Depends(require_permissions("activity_type:manage"))],
)
def upsert_activity_form(
    activity_type_id: uuid.UUID,
    data: ActivityFormUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = ActivityFormService(db)
    form = service.upsert(
        current_user.organization_id,
        activity_type_id,
        [e.model_dump() for e in data.elements],
    )
    return ActivityFormResponse.dump_from_model(form)


@form_router.delete(
    "/{activity_type_id}",
    dependencies=[Depends(require_permissions("activity_type:manage"))],
)
def delete_activity_form(
    activity_type_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = ActivityFormService(db)
    service.delete(activity_type_id, current_user.organization_id)
    return {"message": "Activity form deleted"}


# Include sub-routers
router.include_router(activity_type_router)
router.include_router(activity_router)
router.include_router(form_router)
