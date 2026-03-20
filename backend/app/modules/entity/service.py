"""
Entity and EntityType services
"""

import uuid
from datetime import datetime

from sqlalchemy import exists, func, or_
from sqlalchemy.orm import Session

from app.common.exceptions import NotFoundError, ValidationError
from app.common.helpers.slugify import slugify
from app.modules.activity.model import ActivityParticipant
from app.modules.beneficiary.model import Enrollment
from app.modules.dimension.model import DimensionValue, EntityDimension
from app.modules.entity.model import Entity, EntityType
from app.modules.organization.model import Organization


class EntityTypeService:
    def __init__(self, db: Session):
        self.db = db

    def list_by_org(self, org_id: uuid.UUID) -> list[EntityType]:
        return (
            self.db.query(EntityType)
            .filter_by(organization_id=org_id)
            .order_by(EntityType.sort_order)
            .all()
        )

    def get_by_id(self, entity_type_id: uuid.UUID, org_id: uuid.UUID) -> EntityType:
        et = self.db.query(EntityType).filter_by(id=entity_type_id, organization_id=org_id).first()
        if not et:
            raise NotFoundError("Entity type not found")
        return et

    def create(self, org_id: uuid.UUID, data: dict) -> EntityType:
        data["key"] = slugify(data["name"])
        et = EntityType(organization_id=org_id, **data)
        self.db.add(et)
        self.db.commit()
        self.db.refresh(et)
        return et

    def update(self, entity_type_id: uuid.UUID, org_id: uuid.UUID, data: dict) -> EntityType:
        et = self.get_by_id(entity_type_id, org_id)
        if "name" in data and data["name"] is not None:
            data["key"] = slugify(data["name"])
        for key, value in data.items():
            if value is not None:
                setattr(et, key, value)
        self.db.commit()
        self.db.refresh(et)
        return et

    def delete(self, entity_type_id: uuid.UUID, org_id: uuid.UUID) -> None:
        et = self.get_by_id(entity_type_id, org_id)
        # Check if any entities exist for this type
        count = self.db.query(Entity).filter_by(entity_type_id=entity_type_id).count()
        if count > 0:
            raise ValidationError(
                f"Cannot delete entity type with {count} existing entities. Remove them first."
            )
        self.db.delete(et)
        self.db.commit()


class EntityService:
    def __init__(self, db: Session):
        self.db = db

    def _generate_case_number(self, org: Organization, entity_type: EntityType) -> str | None:
        """Generate a case number if the entity type has case_number_enabled."""
        config = entity_type.config or {}
        if not config.get("case_number_enabled", False):
            return None

        fmt = org.case_number_format or "{ORG_CODE}-{SERIAL}"
        year_2 = datetime.now().strftime("%y")
        year_4 = datetime.now().strftime("%Y")

        count = self.db.query(Entity).filter_by(organization_id=org.id).count()
        serial = str(count + 1).zfill(3)

        return (
            fmt.replace("{ORG_CODE}", org.code)
            .replace("{YY}", year_2)
            .replace("{YYYY}", year_4)
            .replace("{SERIAL}", serial)
        )

    def list_by_org(
        self,
        org_id: uuid.UUID,
        entity_type_id: uuid.UUID | None = None,
        accessible_dv_ids: list[uuid.UUID] | None = None,
    ) -> list[tuple]:
        enrollment_count = (
            self.db.query(func.count(Enrollment.id))
            .filter(Enrollment.entity_id == Entity.id)
            .correlate(Entity)
            .scalar_subquery()
        )
        activity_count = (
            self.db.query(func.count(ActivityParticipant.id))
            .filter(
                ActivityParticipant.participant_type == "entity",
                ActivityParticipant.participant_id == Entity.id,
            )
            .correlate(Entity)
            .scalar_subquery()
        )

        query = self.db.query(Entity, enrollment_count, activity_count).filter_by(
            organization_id=org_id
        )

        if entity_type_id:
            query = query.filter(Entity.entity_type_id == entity_type_id)

        if accessible_dv_ids:
            # Per-dimension scoping: only filter dimensions where user has restrictions.
            # If user has no assignments for a dimension, they see all values for it.
            dv_dim_rows = (
                self.db.query(DimensionValue.id, DimensionValue.dimension_id)
                .filter(DimensionValue.id.in_(accessible_dv_ids))
                .all()
            )
            restricted_dims: dict[uuid.UUID, list[uuid.UUID]] = {}
            for dv_id, dim_id in dv_dim_rows:
                restricted_dims.setdefault(dim_id, []).append(dv_id)

            for dim_id, allowed_ids in restricted_dims.items():
                dim_values_subq = (
                    self.db.query(DimensionValue.id)
                    .filter(DimensionValue.dimension_id == dim_id)
                    .subquery()
                )
                query = query.filter(
                    or_(
                        # Entity has no values from this dimension → unrestricted
                        ~exists()
                        .where(EntityDimension.entity_id == Entity.id)
                        .where(EntityDimension.dimension_value_id.in_(dim_values_subq)),
                        # Entity has at least one allowed value from this dimension
                        exists()
                        .where(EntityDimension.entity_id == Entity.id)
                        .where(EntityDimension.dimension_value_id.in_(allowed_ids)),
                    )
                )

        return query.order_by(Entity.created_at.desc()).all()

    def get_by_id(self, entity_id: uuid.UUID, org_id: uuid.UUID) -> Entity:
        entity = self.db.query(Entity).filter_by(id=entity_id, organization_id=org_id).first()
        if not entity:
            raise NotFoundError("Entity not found")
        return entity

    def create(
        self,
        org_id: uuid.UUID,
        data: dict,
        dimension_value_ids: list[str] | None = None,
        accessible_dv_ids: list[uuid.UUID] | None = None,
    ) -> Entity:
        from app.modules.dimension.service import UserDimensionAccessService

        UserDimensionAccessService(self.db).validate_dimension_values(
            accessible_dv_ids, dimension_value_ids or []
        )

        org = self.db.query(Organization).filter_by(id=org_id).first()
        if not org:
            raise NotFoundError("Organization not found")

        entity_type = (
            self.db.query(EntityType)
            .filter_by(id=uuid.UUID(data["entity_type_id"]), organization_id=org_id)
            .first()
        )
        if not entity_type:
            raise ValidationError("Entity type not found in this organization")

        case_number = self._generate_case_number(org, entity_type)
        entity = Entity(
            organization_id=org_id,
            entity_type_id=entity_type.id,
            case_number=case_number,
            name=data["name"],
            meta=data.get("meta"),
        )
        self.db.add(entity)
        self.db.flush()

        for dv_id in dimension_value_ids or []:
            dim = EntityDimension(
                entity_id=entity.id,
                dimension_value_id=uuid.UUID(dv_id),
            )
            self.db.add(dim)

        self.db.commit()
        self.db.refresh(entity)
        return entity

    def update(self, entity_id: uuid.UUID, org_id: uuid.UUID, data: dict) -> Entity:
        entity = self.get_by_id(entity_id, org_id)
        for key, value in data.items():
            if value is not None:
                setattr(entity, key, value)
        self.db.commit()
        self.db.refresh(entity)
        return entity

    def update_dimensions(
        self,
        entity_id: uuid.UUID,
        org_id: uuid.UUID,
        dimension_value_ids: list[str],
        accessible_dv_ids: list[uuid.UUID] | None = None,
    ) -> Entity:
        from app.modules.dimension.service import UserDimensionAccessService

        UserDimensionAccessService(self.db).validate_dimension_values(
            accessible_dv_ids, dimension_value_ids or []
        )
        entity = self.get_by_id(entity_id, org_id)
        self.db.query(EntityDimension).filter_by(entity_id=entity.id).delete()
        for dv_id in dimension_value_ids:
            dim = EntityDimension(
                entity_id=entity.id,
                dimension_value_id=uuid.UUID(dv_id),
            )
            self.db.add(dim)
        self.db.commit()
        self.db.refresh(entity)
        return entity
