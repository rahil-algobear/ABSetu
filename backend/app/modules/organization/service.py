"""
Organization, Center, Programme services
"""

import uuid

from sqlalchemy.orm import Session

from app.common.exceptions import NotFoundError, ValidationError
from app.modules.organization.model import Center, Organization, Programme, ProgrammeCenter


class OrganizationService:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, org_id: uuid.UUID) -> Organization:
        org = self.db.query(Organization).filter_by(id=org_id).first()
        if not org:
            raise NotFoundError("Organization not found")
        return org

    def update(self, org_id: uuid.UUID, data: dict) -> Organization:
        org = self.get_by_id(org_id)
        for key, value in data.items():
            if value is not None:
                setattr(org, key, value)
        self.db.commit()
        self.db.refresh(org)
        return org


class CenterService:
    def __init__(self, db: Session):
        self.db = db

    def list_by_org(
        self, org_id: uuid.UUID, accessible_ids: list[uuid.UUID] | None = None
    ) -> list[Center]:
        query = self.db.query(Center).filter_by(organization_id=org_id)
        if accessible_ids is not None:
            query = query.filter(Center.id.in_(accessible_ids))
        return query.all()

    def get_by_id(self, center_id: uuid.UUID, org_id: uuid.UUID) -> Center:
        center = self.db.query(Center).filter_by(id=center_id, organization_id=org_id).first()
        if not center:
            raise NotFoundError("Center not found")
        return center

    def create(self, org_id: uuid.UUID, data: dict) -> Center:
        center = Center(organization_id=org_id, **data)
        self.db.add(center)
        self.db.commit()
        self.db.refresh(center)
        return center

    def update(self, center_id: uuid.UUID, org_id: uuid.UUID, data: dict) -> Center:
        center = self.get_by_id(center_id, org_id)
        for key, value in data.items():
            if value is not None:
                setattr(center, key, value)
        self.db.commit()
        self.db.refresh(center)
        return center

    def delete(self, center_id: uuid.UUID, org_id: uuid.UUID) -> None:
        center = self.get_by_id(center_id, org_id)
        self.db.delete(center)
        self.db.commit()


class ProgrammeService:
    def __init__(self, db: Session):
        self.db = db

    def list_by_org(
        self, org_id: uuid.UUID, accessible_ids: list[uuid.UUID] | None = None
    ) -> list[Programme]:
        query = self.db.query(Programme).filter_by(organization_id=org_id)
        if accessible_ids is not None:
            query = query.filter(Programme.id.in_(accessible_ids))
        return query.all()

    def get_by_id(self, programme_id: uuid.UUID, org_id: uuid.UUID) -> Programme:
        programme = (
            self.db.query(Programme).filter_by(id=programme_id, organization_id=org_id).first()
        )
        if not programme:
            raise NotFoundError("Programme not found")
        return programme

    def create(self, org_id: uuid.UUID, data: dict) -> Programme:
        programme = Programme(organization_id=org_id, **data)
        self.db.add(programme)
        self.db.commit()
        self.db.refresh(programme)
        return programme

    def update(self, programme_id: uuid.UUID, org_id: uuid.UUID, data: dict) -> Programme:
        programme = self.get_by_id(programme_id, org_id)
        for key, value in data.items():
            if value is not None:
                setattr(programme, key, value)
        self.db.commit()
        self.db.refresh(programme)
        return programme

    def delete(self, programme_id: uuid.UUID, org_id: uuid.UUID) -> None:
        programme = self.get_by_id(programme_id, org_id)
        self.db.delete(programme)
        self.db.commit()


class ProgrammeCenterService:
    def __init__(self, db: Session):
        self.db = db

    def list_by_org(
        self,
        org_id: uuid.UUID,
        accessible_center_ids: list[uuid.UUID] | None = None,
        accessible_programme_ids: list[uuid.UUID] | None = None,
    ) -> list[ProgrammeCenter]:
        query = (
            self.db.query(ProgrammeCenter)
            .join(Programme, ProgrammeCenter.programme_id == Programme.id)
            .filter(Programme.organization_id == org_id)
        )
        if accessible_center_ids is not None:
            query = query.filter(ProgrammeCenter.center_id.in_(accessible_center_ids))
        if accessible_programme_ids is not None:
            query = query.filter(ProgrammeCenter.programme_id.in_(accessible_programme_ids))
        return query.all()

    def create(
        self, org_id: uuid.UUID, programme_id: uuid.UUID, center_id: uuid.UUID
    ) -> ProgrammeCenter:
        # Verify both belong to same org
        programme = (
            self.db.query(Programme).filter_by(id=programme_id, organization_id=org_id).first()
        )
        if not programme:
            raise ValidationError("Programme not found in this organization")

        center = self.db.query(Center).filter_by(id=center_id, organization_id=org_id).first()
        if not center:
            raise ValidationError("Center not found in this organization")

        existing = (
            self.db.query(ProgrammeCenter)
            .filter_by(programme_id=programme_id, center_id=center_id)
            .first()
        )
        if existing:
            raise ValidationError("This programme-center combination already exists")

        pc = ProgrammeCenter(programme_id=programme_id, center_id=center_id)
        self.db.add(pc)
        self.db.commit()
        self.db.refresh(pc)
        return pc

    def delete(self, pc_id: uuid.UUID) -> None:
        pc = self.db.query(ProgrammeCenter).filter_by(id=pc_id).first()
        if not pc:
            raise NotFoundError("Programme-Center assignment not found")
        self.db.delete(pc)
        self.db.commit()


class MetaFieldSchemaService:
    """Manage meta field schemas stored in Organization.meta['meta_field_schemas']."""

    def __init__(self, db: Session):
        self.db = db

    def _get_org(self, org_id: uuid.UUID) -> Organization:
        org = self.db.query(Organization).filter_by(id=org_id).first()
        if not org:
            raise NotFoundError("Organization not found")
        return org

    def get_schema(self, org_id: uuid.UUID, entity_type: str) -> list[dict]:
        org = self._get_org(org_id)
        meta = org.meta or {}
        schemas = meta.get("meta_field_schemas", {})
        return schemas.get(entity_type, [])

    def get_all_schemas(self, org_id: uuid.UUID) -> dict[str, list[dict]]:
        org = self._get_org(org_id)
        meta = org.meta or {}
        return meta.get("meta_field_schemas", {})

    def update_schema(self, org_id: uuid.UUID, entity_type: str, fields: list[dict]) -> list[dict]:
        org = self._get_org(org_id)
        meta = dict(org.meta) if org.meta else {}
        schemas = dict(meta.get("meta_field_schemas", {}))
        schemas[entity_type] = fields
        meta["meta_field_schemas"] = schemas
        org.meta = meta
        self.db.commit()
        self.db.refresh(org)
        return fields
