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
    """Manage meta field schemas stored in the meta_field_schemas table."""

    def __init__(self, db: Session):
        self.db = db

    def get_schema(self, org_id: uuid.UUID, scope_key: str) -> list[dict]:
        from app.modules.organization.model import MetaFieldSchema

        row = (
            self.db.query(MetaFieldSchema)
            .filter_by(organization_id=org_id, scope_key=scope_key)
            .first()
        )
        return row.fields if row else []

    def get_all_schemas(self, org_id: uuid.UUID) -> dict[str, list[dict]]:
        from app.modules.organization.model import MetaFieldSchema

        rows = self.db.query(MetaFieldSchema).filter_by(organization_id=org_id).all()
        return {row.scope_key: row.fields for row in rows}

    def update_schema(self, org_id: uuid.UUID, scope_key: str, fields: list[dict]) -> list[dict]:
        from app.modules.organization.model import MetaFieldSchema

        row = (
            self.db.query(MetaFieldSchema)
            .filter_by(organization_id=org_id, scope_key=scope_key)
            .first()
        )
        if row:
            row.fields = fields
        else:
            row = MetaFieldSchema(organization_id=org_id, scope_key=scope_key, fields=fields)
            self.db.add(row)
        self.db.commit()
        return fields
