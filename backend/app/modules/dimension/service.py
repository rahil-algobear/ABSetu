"""
Dimension, DimensionValue services
"""

import uuid

from sqlalchemy.orm import Session

from app.common.exceptions import NotFoundError, ValidationError
from app.modules.dimension.model import (
    Dimension,
    DimensionValue,
    DimensionValueRelationship,
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


class DimensionValueRelationshipService:
    def __init__(self, db: Session):
        self.db = db

    def list_by_org(self, org_id: uuid.UUID) -> list[DimensionValueRelationship]:
        """List all relationships for an org (via dimension values)."""
        return (
            self.db.query(DimensionValueRelationship)
            .join(
                DimensionValue,
                DimensionValueRelationship.parent_dimension_value_id == DimensionValue.id,
            )
            .filter(DimensionValue.organization_id == org_id)
            .all()
        )

    def bulk_replace(
        self, org_id: uuid.UUID, relationships: list[dict]
    ) -> list[DimensionValueRelationship]:
        """Bulk-replace all relationships for an org."""
        # Delete existing
        existing = self.list_by_org(org_id)
        for rel in existing:
            self.db.delete(rel)
        self.db.flush()

        # Insert new
        for item in relationships:
            self.db.add(
                DimensionValueRelationship(
                    parent_dimension_value_id=item["parent_dimension_value_id"],
                    child_dimension_value_id=item["child_dimension_value_id"],
                )
            )
        self.db.commit()
        return self.list_by_org(org_id)


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
