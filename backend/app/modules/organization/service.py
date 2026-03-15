"""
Organization services
"""

import uuid

from sqlalchemy.orm import Session

from app.common.exceptions import NotFoundError
from app.modules.organization.model import Organization


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
