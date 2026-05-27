"""
Enrollment service
"""

import uuid

from sqlalchemy.orm import Session

from app.common.exceptions import NotFoundError, ValidationError
from app.common.helpers.meta_normalize import normalize_meta_datetimes
from app.modules.enrollment.model import Enrollment
from app.modules.dimension.model import EnrollmentDimension
from app.modules.entity.model import Entity



class EnrollmentService:
    def __init__(self, db: Session):
        self.db = db

    def list_by_entity(self, entity_id: uuid.UUID) -> list[Enrollment]:
        return (
            self.db.query(Enrollment)
            .filter_by(entity_id=entity_id)
            .order_by(Enrollment.created_at.asc())
            .all()
        )

    def list_by_org(self, org_id: uuid.UUID) -> list[Enrollment]:
        return (
            self.db.query(Enrollment)
            .filter_by(organization_id=org_id)
            .order_by(Enrollment.created_at.asc())
            .all()
        )

    def create(
        self,
        org_id: uuid.UUID,
        data: dict,
        dimension_value_ids: list[str] | None = None,
    ) -> Enrollment:
        # Verify entity belongs to org
        entity = (
            self.db.query(Entity)
            .filter_by(
                id=uuid.UUID(data["entity_id"]),
                organization_id=org_id,
            )
            .first()
        )
        if not entity:
            raise ValidationError("Entity not found in this organization")

        # Verify entity type allows enrollment
        if not entity.entity_type.can_enroll:
            raise ValidationError(
                f"Entity type '{entity.entity_type.name}' does not support enrollments"
            )

        meta = normalize_meta_datetimes(dict(data.get("meta") or {}))

        enrollment = Enrollment(
            organization_id=org_id,
            entity_id=entity.id,
            meta=meta,
            is_active=data.get("is_active", True),
        )
        self.db.add(enrollment)
        self.db.flush()

        for dv_id in dimension_value_ids or []:
            dim = EnrollmentDimension(
                enrollment_id=enrollment.id,
                dimension_value_id=uuid.UUID(dv_id),
            )
            self.db.add(dim)

        self.db.commit()
        self.db.refresh(enrollment)
        return enrollment

    def update(self, enrollment_id: uuid.UUID, data: dict) -> Enrollment:
        enrollment = self.db.query(Enrollment).filter_by(id=enrollment_id).first()
        if not enrollment:
            raise NotFoundError("Enrollment not found")

        # Merge existing meta with updates
        if "meta" in data:
            existing_meta = dict(enrollment.meta or {})
            incoming_meta = data.get("meta") or {}
            existing_meta.update(incoming_meta)
            enrollment.meta = normalize_meta_datetimes(existing_meta)

        if "is_active" in data:
            enrollment.is_active = data["is_active"]

        self.db.commit()
        self.db.refresh(enrollment)
        return enrollment

    def update_dimensions(
        self, enrollment_id: uuid.UUID, dimension_value_ids: list[str]
    ) -> Enrollment:
        enrollment = self.db.query(Enrollment).filter_by(id=enrollment_id).first()
        if not enrollment:
            raise NotFoundError("Enrollment not found")

        self.db.query(EnrollmentDimension).filter_by(enrollment_id=enrollment.id).delete()
        for dv_id in dimension_value_ids:
            dim = EnrollmentDimension(
                enrollment_id=enrollment.id,
                dimension_value_id=uuid.UUID(dv_id),
            )
            self.db.add(dim)

        self.db.commit()
        self.db.refresh(enrollment)
        return enrollment
