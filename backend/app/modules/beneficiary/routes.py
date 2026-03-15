"""
Beneficiary and Enrollment routes
"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.common.dependencies import get_current_user, require_permissions
from app.modules.auth.model import User
from app.modules.beneficiary.schemas import (
    BeneficiaryCreate,
    BeneficiaryResponse,
    BeneficiaryUpdate,
    DimensionTagInfo,
    EnrollmentCreate,
    EnrollmentResponse,
    EnrollmentUpdate,
)
from app.modules.beneficiary.service import BeneficiaryService, EnrollmentService
from app.modules.dimension.service import UserDimensionAccessService

router = APIRouter(tags=["beneficiaries"])

beneficiary_router = APIRouter(prefix="/beneficiaries")
enrollment_router = APIRouter(prefix="/enrollments")


def _build_beneficiary_response(b) -> dict:
    tag_infos = []
    for t in b.tags or []:
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
    return BeneficiaryResponse(
        id=str(b.id),
        updated_at=b.updated_at,
        organization_id=str(b.organization_id),
        case_number=b.case_number,
        name=b.name,
        meta=b.meta,
        tags=tag_infos,
    ).dump()


def _build_enrollment_response(e) -> dict:
    tag_infos = []
    for t in e.tags or []:
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
    return EnrollmentResponse(
        id=str(e.id),
        updated_at=e.updated_at,
        organization_id=str(e.organization_id),
        beneficiary_id=str(e.beneficiary_id),
        admission_date=e.admission_date,
        release_date=e.release_date,
        meta=e.meta,
        beneficiary_name=e.beneficiary.name if e.beneficiary else None,
        tags=tag_infos,
    ).dump()


# --- Beneficiaries ---


@beneficiary_router.get("/", dependencies=[Depends(require_permissions("beneficiary:view"))])
def list_beneficiaries(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    access_service = UserDimensionAccessService(db)
    dv_ids = access_service.get_access_value_ids(current_user.id)
    accessible = dv_ids if dv_ids else None

    service = BeneficiaryService(db)
    beneficiaries = service.list_by_org(
        current_user.organization_id,
        accessible_dv_ids=accessible,
    )
    return [_build_beneficiary_response(b) for b in beneficiaries]


@beneficiary_router.get(
    "/{beneficiary_id}", dependencies=[Depends(require_permissions("beneficiary:view"))]
)
def get_beneficiary(
    beneficiary_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = BeneficiaryService(db)
    beneficiary = service.get_by_id(beneficiary_id, current_user.organization_id)
    return _build_beneficiary_response(beneficiary)


@beneficiary_router.post(
    "/", dependencies=[Depends(require_permissions("beneficiary:create"))], status_code=201
)
def create_beneficiary(
    data: BeneficiaryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = BeneficiaryService(db)
    beneficiary = service.create(
        current_user.organization_id,
        data.model_dump(exclude={"dimension_value_ids"}),
        dimension_value_ids=data.dimension_value_ids,
    )
    return _build_beneficiary_response(beneficiary)


@beneficiary_router.put(
    "/{beneficiary_id}", dependencies=[Depends(require_permissions("beneficiary:edit"))]
)
def update_beneficiary(
    beneficiary_id: uuid.UUID,
    data: BeneficiaryUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = BeneficiaryService(db)
    beneficiary = service.update(
        beneficiary_id,
        current_user.organization_id,
        data.model_dump(exclude_none=True),
    )
    return _build_beneficiary_response(beneficiary)


# --- Enrollments ---


@enrollment_router.get(
    "/beneficiary/{beneficiary_id}", dependencies=[Depends(require_permissions("enrollment:view"))]
)
def list_enrollments_by_beneficiary(
    beneficiary_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    service = EnrollmentService(db)
    enrollments = service.list_by_beneficiary(beneficiary_id)
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


router.include_router(beneficiary_router)
router.include_router(enrollment_router)
