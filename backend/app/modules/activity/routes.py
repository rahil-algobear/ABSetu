"""
Activity, ActivityType, Facilitator, Participation routes
"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.common.dependencies import get_current_user, require_permissions
from app.modules.auth.model import User
from app.modules.activity.schemas import (
    ActivityCreate,
    ActivityResponse,
    ActivityTypeCreate,
    ActivityTypeResponse,
    ActivityTypeUpdate,
    ActivityUpdate,
    DimensionTagInfo,
    FacilitatorCreate,
    FacilitatorResponse,
    FacilitatorUpdate,
    ParticipationBulkCreate,
    ParticipationResponse,
)
from app.modules.activity.service import (
    ActivityService,
    ActivityTypeService,
    FacilitatorService,
    ParticipationService,
)
from app.modules.dimension.service import UserDimensionAccessService

router = APIRouter(tags=["activities"])


# --- Activity Types ---

type_router = APIRouter(prefix="/activity-types")


@type_router.get("/", dependencies=[Depends(require_permissions("activity_type:view"))])
def list_activity_types(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = ActivityTypeService(db)
    types = service.list_by_org(current_user.organization_id)
    return [ActivityTypeResponse.dump_from_model(t) for t in types]


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
    return ActivityTypeResponse.dump_from_model(at)


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
    return ActivityTypeResponse.dump_from_model(at)


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
    return ActivityTypeResponse.dump_from_model(at)


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


# --- Facilitators ---

facilitator_router = APIRouter(prefix="/facilitators")


@facilitator_router.get("/", dependencies=[Depends(require_permissions("facilitator:view"))])
def list_facilitators(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = FacilitatorService(db)
    facilitators = service.list_by_org(current_user.organization_id)
    return [FacilitatorResponse.dump_from_model(f) for f in facilitators]


@facilitator_router.get(
    "/{facilitator_id}",
    dependencies=[Depends(require_permissions("facilitator:view"))],
)
def get_facilitator(
    facilitator_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = FacilitatorService(db)
    facilitator = service.get_by_id(facilitator_id, current_user.organization_id)
    return FacilitatorResponse.dump_from_model(facilitator)


@facilitator_router.post(
    "/",
    dependencies=[Depends(require_permissions("facilitator:manage"))],
    status_code=201,
)
def create_facilitator(
    data: FacilitatorCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = FacilitatorService(db)
    facilitator = service.create(
        current_user.organization_id,
        data.model_dump(exclude_none=True),
    )
    return FacilitatorResponse.dump_from_model(facilitator)


@facilitator_router.put(
    "/{facilitator_id}",
    dependencies=[Depends(require_permissions("facilitator:manage"))],
)
def update_facilitator(
    facilitator_id: uuid.UUID,
    data: FacilitatorUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = FacilitatorService(db)
    facilitator = service.update(
        facilitator_id,
        current_user.organization_id,
        data.model_dump(exclude_none=True),
    )
    return FacilitatorResponse.dump_from_model(facilitator)


@facilitator_router.delete(
    "/{facilitator_id}",
    dependencies=[Depends(require_permissions("facilitator:manage"))],
)
def delete_facilitator(
    facilitator_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = FacilitatorService(db)
    service.delete(facilitator_id, current_user.organization_id)
    return {"message": "Facilitator deleted"}


# --- Activities ---

activity_router = APIRouter(prefix="/activities")


def _build_activity_response(a) -> dict:
    """Build ActivityResponse dict from an Activity model instance."""
    facilitators = [
        FacilitatorResponse.dump_from_model(af.facilitator)
        for af in a.activity_facilitators
        if af.facilitator
    ]
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
    return ActivityResponse(
        id=str(a.id),
        updated_at=a.updated_at,
        organization_id=str(a.organization_id),
        activity_type_id=str(a.activity_type_id),
        date=a.date,
        notes=a.notes,
        created_by=str(a.created_by) if a.created_by else None,
        meta=a.meta,
        type_name=a.activity_type.name if a.activity_type else None,
        facilitators=facilitators,
        tags=tag_infos,
    ).dump()


@activity_router.get("/", dependencies=[Depends(require_permissions("activity:view"))])
def list_activities(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Get user's dimension access for scoping
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
    service = ActivityService(db)
    activity = service.create(
        current_user.organization_id,
        current_user.id,
        data.model_dump(exclude={"facilitator_ids", "dimension_value_ids"}),
        data.facilitator_ids,
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


# --- Participations ---


@activity_router.get(
    "/{activity_id}/participations",
    dependencies=[Depends(require_permissions("activity:view"))],
)
def get_participations(
    activity_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    service = ParticipationService(db)
    participations = service.list_by_activity(activity_id)
    results = []
    for p in participations:
        resp = ParticipationResponse(
            id=str(p.id),
            updated_at=p.updated_at,
            activity_id=str(p.activity_id),
            beneficiary_id=str(p.beneficiary_id),
            status=p.status,
            meta=p.meta,
            beneficiary_name=p.beneficiary.name if p.beneficiary else None,
        )
        results.append(resp.dump())
    return results


@activity_router.post(
    "/{activity_id}/participations",
    dependencies=[Depends(require_permissions("activity:create"))],
    status_code=201,
)
def mark_participations(
    activity_id: uuid.UUID,
    data: ParticipationBulkCreate,
    db: Session = Depends(get_db),
):
    service = ParticipationService(db)
    participations = service.bulk_create(
        activity_id,
        [r.model_dump() for r in data.records],
    )
    return [
        ParticipationResponse(
            id=str(p.id),
            updated_at=p.updated_at,
            activity_id=str(p.activity_id),
            beneficiary_id=str(p.beneficiary_id),
            status=p.status,
            meta=p.meta,
        ).dump()
        for p in participations
    ]


# Include sub-routers
router.include_router(type_router)
router.include_router(facilitator_router)
router.include_router(activity_router)
