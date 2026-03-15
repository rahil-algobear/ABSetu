"""
Dimension, DimensionValue, TagRule services
"""

import uuid

from sqlalchemy.orm import Session

from app.common.exceptions import NotFoundError, ValidationError
from app.modules.dimension.model import (
    Dimension,
    DimensionValue,
    TagRule,
    UserDimensionAccess,
)


class DimensionService:
    def __init__(self, db: Session):
        self.db = db

    def list_by_org(self, org_id: uuid.UUID) -> list[Dimension]:
        return (
            self.db.query(Dimension)
            .filter_by(organization_id=org_id)
            .order_by(Dimension.sort_order, Dimension.name)
            .all()
        )

    def get_by_id(self, dimension_id: uuid.UUID, org_id: uuid.UUID) -> Dimension:
        dimension = (
            self.db.query(Dimension).filter_by(id=dimension_id, organization_id=org_id).first()
        )
        if not dimension:
            raise NotFoundError("Dimension not found")
        return dimension

    def create(self, org_id: uuid.UUID, data: dict) -> Dimension:
        existing = (
            self.db.query(Dimension).filter_by(organization_id=org_id, key=data["key"]).first()
        )
        if existing:
            raise ValidationError(f"Dimension with key '{data['key']}' already exists")
        dimension = Dimension(organization_id=org_id, **data)
        self.db.add(dimension)
        self.db.commit()
        self.db.refresh(dimension)
        return dimension

    def update(self, dimension_id: uuid.UUID, org_id: uuid.UUID, data: dict) -> Dimension:
        dimension = self.get_by_id(dimension_id, org_id)
        for key, value in data.items():
            if value is not None:
                setattr(dimension, key, value)
        self.db.commit()
        self.db.refresh(dimension)
        return dimension

    def delete(self, dimension_id: uuid.UUID, org_id: uuid.UUID) -> None:
        dimension = self.get_by_id(dimension_id, org_id)
        if dimension.is_system:
            raise ValidationError("Cannot delete a system-managed dimension")
        self.db.delete(dimension)
        self.db.commit()


class DimensionValueService:
    def __init__(self, db: Session):
        self.db = db

    def list_by_dimension(self, dimension_id: uuid.UUID) -> list[DimensionValue]:
        return (
            self.db.query(DimensionValue)
            .filter_by(dimension_id=dimension_id)
            .order_by(DimensionValue.sort_order, DimensionValue.name)
            .all()
        )

    def get_by_id(self, value_id: uuid.UUID) -> DimensionValue:
        value = self.db.query(DimensionValue).filter_by(id=value_id).first()
        if not value:
            raise NotFoundError("Dimension value not found")
        return value

    def create(self, org_id: uuid.UUID, dimension_id: uuid.UUID, data: dict) -> DimensionValue:
        value = DimensionValue(organization_id=org_id, dimension_id=dimension_id, **data)
        self.db.add(value)
        self.db.commit()
        self.db.refresh(value)
        return value

    def update(self, value_id: uuid.UUID, data: dict) -> DimensionValue:
        value = self.get_by_id(value_id)
        for key, val in data.items():
            if val is not None:
                setattr(value, key, val)
        self.db.commit()
        self.db.refresh(value)
        return value

    def delete(self, value_id: uuid.UUID) -> None:
        value = self.get_by_id(value_id)
        self.db.delete(value)
        self.db.commit()


class TagRuleService:
    def __init__(self, db: Session):
        self.db = db

    def list_by_org(
        self,
        org_id: uuid.UUID,
        dimension_id_1: uuid.UUID | None = None,
        dimension_id_2: uuid.UUID | None = None,
    ) -> list[TagRule]:
        query = self.db.query(TagRule).filter_by(organization_id=org_id)

        if dimension_id_1 and dimension_id_2:
            # Get values for each dimension to filter rules
            vals_1 = (
                self.db.query(DimensionValue.id).filter_by(dimension_id=dimension_id_1).subquery()
            )
            vals_2 = (
                self.db.query(DimensionValue.id).filter_by(dimension_id=dimension_id_2).subquery()
            )
            from sqlalchemy import or_, and_

            query = query.filter(
                or_(
                    and_(
                        TagRule.dimension_value_id_1.in_(vals_1),
                        TagRule.dimension_value_id_2.in_(vals_2),
                    ),
                    and_(
                        TagRule.dimension_value_id_1.in_(vals_2),
                        TagRule.dimension_value_id_2.in_(vals_1),
                    ),
                )
            )
        return query.all()

    def create(self, org_id: uuid.UUID, dv_id_1: uuid.UUID, dv_id_2: uuid.UUID) -> TagRule:
        # Normalize order (smaller UUID first) to prevent duplicates
        if str(dv_id_1) > str(dv_id_2):
            dv_id_1, dv_id_2 = dv_id_2, dv_id_1

        existing = (
            self.db.query(TagRule)
            .filter_by(
                dimension_value_id_1=dv_id_1,
                dimension_value_id_2=dv_id_2,
            )
            .first()
        )
        if existing:
            raise ValidationError("This tag rule already exists")

        rule = TagRule(
            organization_id=org_id,
            dimension_value_id_1=dv_id_1,
            dimension_value_id_2=dv_id_2,
        )
        self.db.add(rule)
        self.db.commit()
        self.db.refresh(rule)
        return rule

    def delete(self, rule_id: uuid.UUID) -> None:
        rule = self.db.query(TagRule).filter_by(id=rule_id).first()
        if not rule:
            raise NotFoundError("Tag rule not found")
        self.db.delete(rule)
        self.db.commit()

    def bulk_sync(
        self,
        org_id: uuid.UUID,
        dimension_id_1: uuid.UUID,
        dimension_id_2: uuid.UUID,
        pairs: list[tuple[uuid.UUID, uuid.UUID]],
    ) -> list[TagRule]:
        """Sync tag rules: add missing, remove stale."""
        # Normalize all pairs
        normalized = set()
        for a, b in pairs:
            if str(a) > str(b):
                a, b = b, a
            normalized.add((a, b))

        # Get existing rules between these dimensions
        existing_rules = self.list_by_org(org_id, dimension_id_1, dimension_id_2)
        existing_pairs = {
            (r.dimension_value_id_1, r.dimension_value_id_2): r for r in existing_rules
        }

        # Delete rules not in the new set
        for pair, rule in existing_pairs.items():
            if pair not in normalized:
                self.db.delete(rule)

        # Add new rules
        new_rules = []
        for a, b in normalized:
            if (a, b) not in existing_pairs:
                rule = TagRule(
                    organization_id=org_id,
                    dimension_value_id_1=a,
                    dimension_value_id_2=b,
                )
                self.db.add(rule)
                new_rules.append(rule)

        self.db.commit()
        return self.list_by_org(org_id, dimension_id_1, dimension_id_2)


class UserDimensionAccessService:
    def __init__(self, db: Session):
        self.db = db

    def get_access(self, user_id: uuid.UUID) -> list[UserDimensionAccess]:
        return self.db.query(UserDimensionAccess).filter_by(user_id=user_id).all()

    def get_access_value_ids(self, user_id: uuid.UUID) -> list[uuid.UUID]:
        rows = self.get_access(user_id)
        return [r.dimension_value_id for r in rows]

    def update_access(
        self, user_id: uuid.UUID, dimension_value_ids: list[uuid.UUID]
    ) -> list[UserDimensionAccess]:
        """Bulk-replace a user's dimension access."""
        self.db.query(UserDimensionAccess).filter_by(user_id=user_id).delete()
        for dv_id in dimension_value_ids:
            self.db.add(UserDimensionAccess(user_id=user_id, dimension_value_id=dv_id))
        self.db.commit()
        return self.get_access(user_id)
