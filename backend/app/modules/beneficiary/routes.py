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
    EnrollmentCreate,
    EnrollmentResponse,
    EnrollmentUpdate,
)
from app.modules.beneficiary.service import BeneficiaryService, EnrollmentService
from app.modules.user.service import UserService

router = APIRouter(tags=["beneficiaries"])

beneficiary_router = APIRouter(prefix="/beneficiaries")
enrollment_router = APIRouter(prefix="/enrollments")


# --- Beneficiaries ---


@beneficiary_router.get("/", dependencies=[Depends(require_permissions("beneficiary:view"))])
def list_beneficiaries(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    access = UserService.get_access_ids(current_user)
    service = BeneficiaryService(db)
    beneficiaries = service.list_by_org(
        current_user.organization_id,
        accessible_center_ids=access["center_ids"] if access["center_ids"] else None,
        accessible_programme_ids=access["programme_ids"] if access["programme_ids"] else None,
    )
    return [BeneficiaryResponse.dump_from_model(b) for b in beneficiaries]


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
    return BeneficiaryResponse.dump_from_model(beneficiary)


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
        data.model_dump(exclude_none=True),
    )
    return BeneficiaryResponse.dump_from_model(beneficiary)


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
    return BeneficiaryResponse.dump_from_model(beneficiary)


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
    results = []
    for e in enrollments:
        resp = EnrollmentResponse(
            id=str(e.id),
            updated_at=e.updated_at,
            beneficiary_id=str(e.beneficiary_id),
            programme_center_id=str(e.programme_center_id),
            admission_date=e.admission_date,
            release_date=e.release_date,
            meta=e.meta,
            beneficiary_name=e.beneficiary.name if e.beneficiary else None,
            programme_name=(
                e.programme_center.programme.name
                if e.programme_center and e.programme_center.programme
                else None
            ),
            center_name=(
                e.programme_center.center.name
                if e.programme_center and e.programme_center.center
                else None
            ),
        )
        results.append(resp.dump())
    return results


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
        data.model_dump(),
    )
    return EnrollmentResponse(
        id=str(enrollment.id),
        updated_at=enrollment.updated_at,
        beneficiary_id=str(enrollment.beneficiary_id),
        programme_center_id=str(enrollment.programme_center_id),
        admission_date=enrollment.admission_date,
        release_date=enrollment.release_date,
        meta=enrollment.meta,
    ).dump()


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
    return EnrollmentResponse(
        id=str(enrollment.id),
        updated_at=enrollment.updated_at,
        beneficiary_id=str(enrollment.beneficiary_id),
        programme_center_id=str(enrollment.programme_center_id),
        admission_date=enrollment.admission_date,
        release_date=enrollment.release_date,
        meta=enrollment.meta,
    ).dump()


router.include_router(beneficiary_router)
router.include_router(enrollment_router)
