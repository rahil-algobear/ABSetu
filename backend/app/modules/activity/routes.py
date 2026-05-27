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

    data = []
    for activity, participant_count, created_by_name in rows:
        resp = _build_activity_response(activity, created_by_name=created_by_name)
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
    db: Session, activity_id: uuid.UUID, entity_id: uuid.UUID, section_key: str
):
    """Common tail of every picker action — creates the ActivityParticipant
    row. Caller is responsible for the surrounding transaction."""
    from sqlalchemy.exc import IntegrityError as SAIntegrityError

    from app.modules.activity.model import ActivityParticipant

    p = ActivityParticipant(
        activity_id=activity_id,
        participant_type="entity",
        participant_id=entity_id,
        section_key=section_key,
    )
    db.add(p)
    try:
        db.flush()
    except SAIntegrityError:
        db.rollback()
        raise ValidationError("This beneficiary is already a participant in this activity.")
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
    from app.modules.dimension.model import DimensionValue
    from app.modules.entity.routes import _enrollment_relevant_dim_ids

    all_required = {ad.dimension_value_id for ad in (activity.dimensions or [])}
    if not all_required:
        return

    relevant_dim_ids = _enrollment_relevant_dim_ids(db, org_id, entity_type_id)
    if not relevant_dim_ids:
        return

    dv_rows = (
        db.query(DimensionValue.id, DimensionValue.dimension_id)
        .filter(DimensionValue.id.in_(all_required))
        .all()
    )
    required = {dv_id for dv_id, dim_id in dv_rows if dim_id in relevant_dim_ids}
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
    """Smart-picker action: beneficiary already has an active enrollment
    in scope (verified server-side). Just create the ActivityParticipant.

    Used for both Smart mode active-in-scope rows and Basic mode rows
    (non-enrollable entity types or dimensionless activities) — those
    just skip the scope verification."""
    from app.modules.enrollment.model import Enrollment

    entity_uuid = uuid.UUID(data.entity_id)
    # Re-derive correctness when activity has dimensions AND the entity
    # type is enrollable. Otherwise (Basic mode) skip the scope check.
    activity_dv_ids = {ad.dimension_value_id for ad in (activity.dimensions or [])}
    if activity_dv_ids:
        from app.modules.entity.model import Entity

        entity = (
            db.query(Entity)
            .filter_by(id=entity_uuid, organization_id=current_user.organization_id)
            .first()
        )
        if not entity:
            raise ValidationError("Beneficiary not found in this organization.")
        if entity.entity_type.can_enroll:
            actives = (
                db.query(Enrollment)
                .filter(
                    Enrollment.entity_id == entity_uuid,
                    Enrollment.is_active.is_(True),
                )
                .all()
            )
            in_scope = any(
                activity_dv_ids.issubset({d.dimension_value_id for d in (e.dimensions or [])})
                for e in actives
            )
            if not in_scope:
                raise ValidationError(
                    "This beneficiary has no active enrollment matching this "
                    "activity's scope. Use Enroll & Add instead."
                )

    p = _create_picker_participant(db, activity.id, entity_uuid, data.section_key)
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
    """Smart-picker action: brand new beneficiary. Creates entity +
    active enrollment + participant in one transaction. Any step
    failing rolls everything back."""
    from app.modules.enrollment.service import EnrollmentService
    from app.modules.entity.service import EntityService

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
