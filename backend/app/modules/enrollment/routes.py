"""
Enrollment routes
"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.common.dependencies import get_current_user, require_permissions
from app.common.exceptions import ValidationError
from app.core.database import get_db
from app.modules.auth.model import User
from app.modules.dimension.model import DimensionValue
from app.modules.entity.model import Entity
from app.modules.enrollment.schemas import (
    DimensionInfo,
    EnrollmentCreate,
    EnrollmentResponse,
    EnrollmentUpdate,
)
from app.modules.enrollment.service import EnrollmentService
from app.modules.organization.service import MetaFieldSchemaService

router = APIRouter(tags=["enrollments"])

enrollment_router = APIRouter(prefix="/enrollments")


def _collect_enrollment_field_defs(
    db: Session,
    org_id: uuid.UUID,
    entity_type_id: uuid.UUID | None,
    dimension_value_ids: list[uuid.UUID] | None = None,
) -> dict[str, dict]:
    """Collect all applicable meta field definitions for an enrollment."""
    meta_service = MetaFieldSchemaService(db)
    all_field_defs: dict[str, dict] = {}
    for fd in meta_service.get_schema_by_scope(org_id, "enrollment"):
        all_field_defs[fd["key"]] = fd
    if entity_type_id:
        for fd in meta_service.get_schema_by_scope(
            org_id, "enrollment", entity_type_id=entity_type_id
        ):
            all_field_defs[fd["key"]] = fd
    for dv_id in dimension_value_ids or []:
        for fd in meta_service.get_schema_by_scope(org_id, "enrollment", dimension_value_id=dv_id):
            all_field_defs[fd["key"]] = fd
        if entity_type_id:
            for fd in meta_service.get_schema_by_scope(
                org_id,
                "enrollment",
                entity_type_id=entity_type_id,
                dimension_value_id=dv_id,
            ):
                all_field_defs[fd["key"]] = fd
    return all_field_defs


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
    return EnrollmentResponse(
        id=str(e.id),
        updated_at=e.updated_at,
        organization_id=str(e.organization_id),
        entity_id=str(e.entity_id),
        meta=meta,
        is_active=e.is_active,
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
    dv_uuids = [uuid.UUID(v) for v in (data.dimension_value_ids or [])]

    # Resolve entity type for scope-aware validation; service.create
    # raises if the entity itself doesn't exist or isn't in this org.
    entity_type_row = (
        db.query(Entity.entity_type_id)
        .filter_by(
            id=uuid.UUID(data.entity_id),
            organization_id=current_user.organization_id,
        )
        .first()
    )
    entity_type_id = entity_type_row[0] if entity_type_row else None

    all_field_defs = _collect_enrollment_field_defs(
        db, current_user.organization_id, entity_type_id, dv_uuids
    )

    submitted_meta = data.meta or {}
    submitted_dim_ids: set[str] = set()
    if dv_uuids:
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
        else:
            val = submitted_meta.get(fd["key"])
            if val is None or val == "":
                raise ValidationError(f"{fd.get('label', fd['key'])} is required")

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
