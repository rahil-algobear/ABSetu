"""
Organization services
"""

import uuid

from sqlalchemy.orm import Session

from app.common.exceptions import NotFoundError, ValidationError
from app.modules.organization.model import ListConfig, Organization


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


# Types that cannot be sorted/filtered meaningfully
_UNSORTABLE_META_TYPES = {"multiselect", "boolean"}
_UNFILTERABLE_META_TYPES: set[str] = set()  # all types can be filtered


class ListConfigService:
    """Manage per-type list page column configuration."""

    def __init__(self, db: Session):
        self.db = db

    # ── public API ──────────────────────────────────────────────

    def get_config(self, org_id: uuid.UUID, scope: str) -> list[dict]:
        """Get list config. Auto-generates defaults if none saved, merges new columns."""
        row = (
            self.db.query(ListConfig)
            .filter_by(organization_id=org_id, scope=scope)
            .first()
        )
        defaults = self._generate_defaults(org_id, scope)
        if not row:
            return defaults
        return self._merge_with_current(row.columns, defaults)

    def update_config(
        self, org_id: uuid.UUID, scope: str, columns: list[dict]
    ) -> list[dict]:
        """Save list config."""
        row = (
            self.db.query(ListConfig)
            .filter_by(organization_id=org_id, scope=scope)
            .first()
        )
        if row:
            row.columns = columns
        else:
            row = ListConfig(organization_id=org_id, scope=scope, columns=columns)
            self.db.add(row)
        self.db.commit()
        return columns

    # ── default generation ──────────────────────────────────────

    def _generate_defaults(self, org_id: uuid.UUID, scope: str) -> list[dict]:
        """Auto-generate default columns from static fields + dimensions + meta fields."""
        if scope.startswith("entity:"):
            return self._entity_defaults(org_id, scope)
        elif scope.startswith("activity:"):
            return self._activity_defaults(org_id, scope)
        return []

    def _entity_defaults(self, org_id: uuid.UUID, scope: str) -> list[dict]:
        from app.modules.entity.model import EntityType

        type_id = uuid.UUID(scope.split(":", 1)[1])
        et = self.db.query(EntityType).filter_by(id=type_id, organization_id=org_id).first()
        if not et:
            raise ValidationError("Entity type not found")

        cols: list[dict] = []
        order = 0

        # Static: name
        cols.append(self._col("static", "name", "Name", order, sortable=True))
        order += 1

        # Static: case_number (if enabled)
        config = et.config or {}
        if config.get("case_number_enabled"):
            cols.append(self._col("static", "case_number", "Case No.", order, sortable=True))
            order += 1

        # Meta fields
        meta_service = MetaFieldSchemaService(self.db)
        fields = meta_service.get_schema(org_id, f"entity:{type_id}")
        for f in fields:
            ftype = f.get("type", "text")
            cols.append(self._col(
                "meta", f"meta:{f['key']}", f.get("label", f["key"]), order,
                filterable=ftype not in _UNFILTERABLE_META_TYPES,
                sortable=ftype not in _UNSORTABLE_META_TYPES,
                meta_type=ftype,
            ))
            order += 1

        # Static: counts
        cols.append(self._col("static", "enrollment_count", "Enrollments", order))
        order += 1
        cols.append(self._col("static", "activity_count", "Activities", order))
        order += 1

        # Static: created_at
        cols.append(self._col("static", "created_at", "Created", order, sortable=True, filterable=True))

        return cols

    def _activity_defaults(self, org_id: uuid.UUID, scope: str) -> list[dict]:
        from app.modules.activity.model import ActivityType

        type_id = uuid.UUID(scope.split(":", 1)[1])
        at = self.db.query(ActivityType).filter_by(id=type_id, organization_id=org_id).first()
        if not at:
            raise ValidationError("Activity type not found")

        cols: list[dict] = []
        order = 0

        cols.append(self._col("static", "start_date", "Start Date", order, sortable=True, filterable=True))
        order += 1
        cols.append(self._col("static", "end_date", "End Date", order, sortable=True))
        order += 1
        cols.append(self._col("static", "title", "Title", order, sortable=True))
        order += 1

        # Meta fields
        meta_service = MetaFieldSchemaService(self.db)
        fields = meta_service.get_schema(org_id, f"activity:{type_id}")
        for f in fields:
            ftype = f.get("type", "text")
            cols.append(self._col(
                "meta", f"meta:{f['key']}", f.get("label", f["key"]), order,
                filterable=ftype not in _UNFILTERABLE_META_TYPES,
                sortable=ftype not in _UNSORTABLE_META_TYPES,
                meta_type=ftype,
            ))
            order += 1

        cols.append(self._col("static", "participant_count", "Participants", order))
        order += 1
        cols.append(self._col("static", "created_at", "Created", order, sortable=True))

        return cols

    @staticmethod
    def _col(
        source: str,
        key: str,
        label: str,
        sort_order: int,
        visible: bool = True,
        filterable: bool = False,
        sortable: bool = False,
        meta_type: str | None = None,
    ) -> dict:
        col = {
            "source": source,
            "key": key,
            "label": label,
            "visible": visible,
            "filterable": filterable,
            "sortable": sortable,
            "sort_order": sort_order,
        }
        if meta_type:
            col["meta_type"] = meta_type
        return col

    # ── merge logic ─────────────────────────────────────────────

    @staticmethod
    def _merge_with_current(saved: list[dict], defaults: list[dict]) -> list[dict]:
        """Merge saved config with current defaults.

        - Preserve saved columns order/visibility/flags
        - Drop columns whose key no longer exists in defaults
        - Append new columns (present in defaults but not saved) at the end
        """
        default_keys = {d["key"] for d in defaults}

        # Keep saved columns that still exist
        result = [c for c in saved if c["key"] in default_keys]
        existing_keys = {c["key"] for c in result}

        # Append new defaults
        max_order = max((c.get("sort_order", 0) for c in result), default=0) + 1
        for d in defaults:
            if d["key"] not in existing_keys:
                d["sort_order"] = max_order
                max_order += 1
                result.append(d)

        return result
