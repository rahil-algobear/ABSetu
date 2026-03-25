"""
Enrollment routes (legacy beneficiary module — Beneficiary replaced by Entity)
"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.common.dependencies import get_current_user, require_permissions
from app.modules.auth.model import User
from app.modules.beneficiary.schemas import (
    DimensionInfo,
    EnrollmentCreate,
    EnrollmentResponse,
    EnrollmentUpdate,
)
from app.modules.beneficiary.service import EnrollmentService
from app.modules.entity.routes import _resolve_meta_value

router = APIRouter(tags=["enrollments"])

enrollment_router = APIRouter(prefix="/enrollments")


def _build_enrollment_response(e) -> dict:
    meta = e.meta or {}
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
    entity_meta = e.entity.meta if e.entity else None
    return EnrollmentResponse(
        id=str(e.id),
        updated_at=e.updated_at,
        organization_id=str(e.organization_id),
        entity_id=str(e.entity_id),
        admission_date=meta.get("admission_date"),
        release_date=meta.get("release_date"),
        meta=meta,
        entity_name=_resolve_meta_value(entity_meta or {}, "name") or None if entity_meta else None,
        dimensions=dim_infos,
    ).dump()


@enrollment_router.get(
    "/entity/{entity_id}", dependencies=[Depends(require_permissions("enrollment:view"))]
)
def list_enrollments_by_entity(
    entity_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    service = EnrollmentService(db)
    enrollments = service.list_by_entity(entity_id)
    return [_build_enrollment_response(e) for e in enrollments]


@enrollment_router.get("/", dependencies=[Depends(require_permissions("enrollment:view"))])
def list_enrollments(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = EnrollmentService(db)
    enrollments = service.list_by_org(current_user.organization_id)
    return [_build_enrollment_response(e) for e in enrollments]


@enrollment_router.post(
    "/", dependencies=[Depends(require_permissions("enrollment:manage"))], status_code=201
)
def create_enrollment(
    data: EnrollmentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = EnrollmentService(db)
    enrollment = service.create(
        current_user.organization_id,
        data.model_dump(exclude={"dimension_value_ids"}),
        dimension_value_ids=data.dimension_value_ids,
    )
    return _build_enrollment_response(enrollment)


@enrollment_router.put(
    "/{enrollment_id}", dependencies=[Depends(require_permissions("enrollment:manage"))]
)
def update_enrollment(
    enrollment_id: uuid.UUID,
    data: EnrollmentUpdate,
    db: Session = Depends(get_db),
):
    service = EnrollmentService(db)
    enrollment = service.update(
        enrollment_id,
        data.model_dump(exclude_none=True),
    )
    return _build_enrollment_response(enrollment)


@enrollment_router.put(
    "/{enrollment_id}/dimensions",
    dependencies=[Depends(require_permissions("enrollment:manage"))],
)
def update_enrollment_dimensions(
    enrollment_id: uuid.UUID,
    dimension_value_ids: list[str],
    db: Session = Depends(get_db),
):
    service = EnrollmentService(db)
    enrollment = service.update_dimensions(enrollment_id, dimension_value_ids)
    return _build_enrollment_response(enrollment)


router.include_router(enrollment_router)
