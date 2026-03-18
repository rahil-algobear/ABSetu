"""
Activity, ActivityType, ActivityCategory, ActivityParticipant routes
"""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.common.dependencies import get_current_user, require_permissions
from app.common.exceptions import ValidationError
from app.modules.auth.model import User
from app.modules.activity.schemas import (
    ActivityCategoryCreate,
    ActivityCategoryResponse,
    ActivityCategoryUpdate,
    ActivityCreate,
    ActivityFormResponse,
    ActivityFormUpdate,
    ActivityResponse,
    ActivityTypeCreate,
    ActivityTypeResponse,
    ActivityTypeUpdate,
    ActivityUpdate,
    DimensionTagInfo,
    ParticipantBulkCreate,
    ParticipantResponse,
)
from app.modules.activity.service import (
    ActivityCategoryService,
    ActivityFormService,
    ActivityParticipantService,
    ActivityService,
    ActivityTypeService,
)
from app.modules.activity.model import Activity, ActivityType
from app.modules.dimension.model import Dimension, DimensionValue
from app.modules.dimension.service import UserDimensionAccessService

router = APIRouter(tags=["activities"])


# --- Activity Categories ---

category_router = APIRouter(prefix="/activity-categories")


@category_router.get("/", dependencies=[Depends(require_permissions("activity_type:view"))])
def list_activity_categories(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = ActivityCategoryService(db)
    categories = service.list_by_org(current_user.organization_id)
    return [ActivityCategoryResponse.dump_from_model(c) for c in categories]


@category_router.get(
    "/{category_id}",
    dependencies=[Depends(require_permissions("activity_type:view"))],
)
def get_activity_category(
    category_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = ActivityCategoryService(db)
    cat = service.get_by_id(category_id, current_user.organization_id)
    return ActivityCategoryResponse.dump_from_model(cat)


@category_router.post(
    "/",
    dependencies=[Depends(require_permissions("activity_type:manage"))],
    status_code=201,
)
def create_activity_category(
    data: ActivityCategoryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = ActivityCategoryService(db)
    cat = service.create(
        current_user.organization_id,
        data.model_dump(),
    )
    return ActivityCategoryResponse.dump_from_model(cat)


@category_router.put(
    "/{category_id}",
    dependencies=[Depends(require_permissions("activity_type:manage"))],
)
def update_activity_category(
    category_id: uuid.UUID,
    data: ActivityCategoryUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = ActivityCategoryService(db)
    cat = service.update(
        category_id,
        current_user.organization_id,
        data.model_dump(exclude_none=True),
    )
    return ActivityCategoryResponse.dump_from_model(cat)


@category_router.delete(
    "/{category_id}",
    dependencies=[Depends(require_permissions("activity_type:manage"))],
)
def delete_activity_category(
    category_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = ActivityCategoryService(db)
    service.delete(category_id, current_user.organization_id)
    return {"message": "Activity category deleted"}


# --- Activity Types ---

type_router = APIRouter(prefix="/activity-types")


def _build_type_response(at) -> dict:
    return ActivityTypeResponse(
        id=str(at.id),
        updated_at=at.updated_at,
        organization_id=str(at.organization_id),
        category_id=str(at.category_id) if at.category_id else None,
        name=at.name,
        description=at.description,
        meta=at.meta,
        category_name=at.category.name if at.category else None,
    ).dump()


@type_router.get("/", dependencies=[Depends(require_permissions("activity_type:view"))])
def list_activity_types(
    category_id: uuid.UUID | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = ActivityTypeService(db)
    types = service.list_by_org(
        current_user.organization_id,
        category_id=category_id,
    )
    return [_build_type_response(t) for t in types]


@type_router.get(
    "/{type_id}",
    dependencies=[Depends(require_permissions("activity_type:view"))],
)
def get_activity_type(
    type_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = ActivityTypeService(db)
    at = service.get_by_id(type_id, current_user.organization_id)
    return _build_type_response(at)


@type_router.post(
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
        data.model_dump(exclude_none=True),
    )
    return _build_type_response(at)


@type_router.put(
    "/{type_id}",
    dependencies=[Depends(require_permissions("activity_type:manage"))],
)
def update_activity_type(
    type_id: uuid.UUID,
    data: ActivityTypeUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = ActivityTypeService(db)
    at = service.update(
        type_id,
        current_user.organization_id,
        data.model_dump(exclude_none=True),
    )
    return _build_type_response(at)


@type_router.delete(
    "/{type_id}",
    dependencies=[Depends(require_permissions("activity_type:manage"))],
)
def delete_activity_type(
    type_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = ActivityTypeService(db)
    service.delete(type_id, current_user.organization_id)
    return {"message": "Activity type deleted"}


# --- Activities ---

activity_router = APIRouter(prefix="/activities")


def _build_activity_response(a) -> dict:
    """Build ActivityResponse dict from an Activity model instance."""
    tag_infos = []
    for t in a.tags or []:
        dv = t.dimension_value
        if dv and dv.dimension:
            tag_infos.append(
                DimensionTagInfo(
                    dimension_key=dv.dimension.key,
                    dimension_name=dv.dimension.name,
                    value_id=str(dv.id),
                    value_name=dv.name,
                    value_code=dv.code,
                ).model_dump()
            )
    at = a.activity_type
    category_name = None
    if at and at.category:
        category_name = at.category.name

    return ActivityResponse(
        id=str(a.id),
        updated_at=a.updated_at,
        organization_id=str(a.organization_id),
        activity_type_id=str(a.activity_type_id),
        date=a.date,
        notes=a.notes,
        created_by=str(a.created_by) if a.created_by else None,
        meta=a.meta,
        type_name=at.name if at else None,
        category_name=category_name,
        tags=tag_infos,
    ).dump()


@activity_router.get("/", dependencies=[Depends(require_permissions("activity:view"))])
def list_activities(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    access_service = UserDimensionAccessService(db)
    dv_ids = access_service.get_access_value_ids(current_user.id)
    accessible = dv_ids if dv_ids else None

    service = ActivityService(db)
    activities = service.list_by_org(
        current_user.organization_id,
        accessible_dv_ids=accessible,
    )
    return [_build_activity_response(a) for a in activities]


@activity_router.get(
    "/{activity_id}",
    dependencies=[Depends(require_permissions("activity:view"))],
)
def get_activity(
    activity_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    service = ActivityService(db)
    a = service.get_by_id(activity_id)
    return _build_activity_response(a)


@activity_router.post(
    "/",
    dependencies=[Depends(require_permissions("activity:create"))],
    status_code=201,
)
def create_activity(
    data: ActivityCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Validate required form elements from form builder config
    at = db.query(ActivityType).filter_by(id=data.activity_type_id).first()
    if at and at.category_id:
        form_service = ActivityFormService(db)
        form = form_service.get_by_category(at.category_id, current_user.organization_id)
        if form and form.elements:
            # Resolve which dimension IDs are covered by the submitted values
            submitted_dim_ids = set()
            if data.dimension_value_ids:
                dvs = db.query(DimensionValue.dimension_id).filter(
                    DimensionValue.id.in_([uuid.UUID(v) for v in data.dimension_value_ids])
                ).all()
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
    )
    return _build_activity_response(activity)


@activity_router.put(
    "/{activity_id}",
    dependencies=[Depends(require_permissions("activity:create"))],
)
def update_activity(
    activity_id: uuid.UUID,
    data: ActivityUpdate,
    db: Session = Depends(get_db),
):
    service = ActivityService(db)
    activity = service.update(activity_id, data.model_dump(exclude_none=True))
    return _build_activity_response(activity)


@activity_router.delete(
    "/{activity_id}",
    dependencies=[Depends(require_permissions("activity:create"))],
)
def delete_activity(
    activity_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    service = ActivityService(db)
    service.delete(activity_id)
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
    activity_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    service = ActivityParticipantService(db)
    participants = service.list_by_activity(activity_id)
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
    activity_id: uuid.UUID,
    data: ParticipantBulkCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Validate required entity_type sections from form builder config
    activity = db.query(Activity).filter_by(id=activity_id).first()
    if activity:
        at = db.query(ActivityType).filter_by(id=activity.activity_type_id).first()
        if at and at.category_id:
            form_service = ActivityFormService(db)
            form = form_service.get_by_category(at.category_id, current_user.organization_id)
            if form and form.elements:
                # Build set of section_keys that have at least one participant
                submitted_sections = {r.section_key for r in data.records}
                for el in form.elements:
                    if (
                        el.get("type") == "entity_type"
                        and el.get("required")
                        and el.get("visible", True)
                    ):
                        section_key = el.get("ref_id") or el.get("type")
                        if section_key not in submitted_sections:
                            # Resolve label
                            ref_id = el.get("ref_id")
                            if ref_id == "user":
                                label = "Users (staff)"
                            else:
                                from app.modules.entity.model import EntityType

                                et = db.query(EntityType).filter_by(id=ref_id).first()
                                label = et.name if et else "Participants"
                            raise ValidationError(
                                f"{label} is required — add at least one participant"
                            )

    service = ActivityParticipantService(db)
    participants = service.bulk_create(
        activity_id,
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
    "/{category_id}",
    dependencies=[Depends(require_permissions("activity_type:view"))],
)
def get_activity_form(
    category_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = ActivityFormService(db)
    form = service.get_by_category(category_id, current_user.organization_id)
    if not form:
        return {"activity_category_id": str(category_id), "elements": []}
    return ActivityFormResponse.dump_from_model(form)


@form_router.put(
    "/{category_id}",
    dependencies=[Depends(require_permissions("activity_type:manage"))],
)
def upsert_activity_form(
    category_id: uuid.UUID,
    data: ActivityFormUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = ActivityFormService(db)
    form = service.upsert(
        current_user.organization_id,
        category_id,
        [e.model_dump() for e in data.elements],
    )
    return ActivityFormResponse.dump_from_model(form)


@form_router.delete(
    "/{category_id}",
    dependencies=[Depends(require_permissions("activity_type:manage"))],
)
def delete_activity_form(
    category_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = ActivityFormService(db)
    service.delete(category_id, current_user.organization_id)
    return {"message": "Activity form deleted"}


# Include sub-routers
router.include_router(category_router)
router.include_router(type_router)
router.include_router(activity_router)
router.include_router(form_router)
