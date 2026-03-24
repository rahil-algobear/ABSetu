"""
Organization services
"""

import uuid

from sqlalchemy.orm import Session

from app.common.exceptions import NotFoundError, ValidationError
from app.modules.organization.model import ListConfig, MetaFieldSchema, USER_ENTITY_SENTINEL
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

    @staticmethod
    def _resolve_entity_type_id(entity_type_id: str | None) -> uuid.UUID | None:
        """Convert 'user' string to sentinel UUID, or parse as UUID, or return None."""
        if not entity_type_id:
            return None
        if entity_type_id == "user":
            return uuid.UUID(USER_ENTITY_SENTINEL)
        return uuid.UUID(entity_type_id)

    @staticmethod
    def _to_uuid_or_none(val: str | None) -> uuid.UUID | None:
        return uuid.UUID(val) if val else None

    def _build_filter(self, org_id: uuid.UUID, scope_type: str, **kwargs):
        """Build a filter dict for querying MetaFieldSchema."""
        filters = {
            "organization_id": org_id,
            "scope_type": scope_type,
        }
        for key in ("entity_type_id", "activity_type_id", "dimension_value_id", "dimension_id"):
            filters[key] = kwargs.get(key)
        return filters

    def get_schema_by_scope(
        self,
        org_id: uuid.UUID,
        scope_type: str,
        entity_type_id: uuid.UUID | None = None,
        activity_type_id: uuid.UUID | None = None,
        dimension_value_id: uuid.UUID | None = None,
        dimension_id: uuid.UUID | None = None,
    ) -> list[dict]:
        """Get fields for a specific scope."""
        row = (
            self.db.query(MetaFieldSchema)
            .filter_by(
                organization_id=org_id,
                scope_type=scope_type,
                entity_type_id=entity_type_id,
                activity_type_id=activity_type_id,
                dimension_value_id=dimension_value_id,
                dimension_id=dimension_id,
            )
            .first()
        )
        return row.fields if row else []

    def get_all_schemas(self, org_id: uuid.UUID) -> list[MetaFieldSchema]:
        """Get all schema rows for an org."""
        return self.db.query(MetaFieldSchema).filter_by(organization_id=org_id).all()

    def get_all_schemas_as_dicts(self, org_id: uuid.UUID) -> list[dict]:
        """Get all schema rows as dicts for API response."""
        rows = self.get_all_schemas(org_id)
        return [{"row": row, "fields": row.fields} for row in rows]

    @staticmethod
    def _ensure_field_keys(fields: list[dict]) -> list[dict]:
        """Ensure every field has a unique key with a random 4-char suffix.

        Fields that already have a suffixed key (containing '_' followed by
        4+ alphanumeric chars at the end) are left as-is. New or legacy
        fields get a suffix appended.
        """
        import random
        import re
        import string

        existing_keys = {f.get("key") for f in fields if f.get("key")}
        result = []
        for f in fields:
            f = dict(f)
            key = f.get("key") or ""
            # Check if key already has a random suffix (e.g. name_a3x9)
            if key and re.search(r"_[a-z0-9]{4,}$", key):
                result.append(f)
                continue
            # Generate a new unique key
            if f.get("type") == "dimension" and f.get("dimension_id"):
                base = "dim"
            elif f.get("type") == "entity_list" and f.get("entity_type_id"):
                base = "el"
            elif f.get("type") == "user_list":
                base = "ul"
            elif key:
                base = re.sub(r"[^a-z0-9_]", "", key.lower().replace(" ", "_"))
            else:
                label = f.get("label", "field")
                base = re.sub(r"[^a-z0-9_]", "", label.lower().replace(" ", "_"))
            # Generate suffix and ensure uniqueness
            for _ in range(100):
                suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=4))
                new_key = f"{base}_{suffix}"
                if new_key not in existing_keys:
                    break
            f["key"] = new_key
            existing_keys.add(new_key)
            result.append(f)
        return result

    def update_schema(
        self,
        org_id: uuid.UUID,
        scope_type: str,
        fields: list[dict],
        entity_type_id: uuid.UUID | None = None,
        activity_type_id: uuid.UUID | None = None,
        dimension_value_id: uuid.UUID | None = None,
        dimension_id: uuid.UUID | None = None,
    ) -> list[dict]:
        """Create or update a meta field schema by structured scope.

        All fields are user-defined — no system field restrictions.
        Automatically ensures all field keys have unique random suffixes.
        """
        fields = self._ensure_field_keys(fields)
        row = (
            self.db.query(MetaFieldSchema)
            .filter_by(
                organization_id=org_id,
                scope_type=scope_type,
                entity_type_id=entity_type_id,
                activity_type_id=activity_type_id,
                dimension_value_id=dimension_value_id,
                dimension_id=dimension_id,
            )
            .first()
        )
        if row:
            row.fields = fields
        else:
            row = MetaFieldSchema(
                organization_id=org_id,
                scope_type=scope_type,
                entity_type_id=entity_type_id,
                activity_type_id=activity_type_id,
                dimension_value_id=dimension_value_id,
                dimension_id=dimension_id,
                fields=fields,
            )
            self.db.add(row)
        self.db.commit()
        return fields

    def get_participant_schemas(
        self,
        org_id: uuid.UUID,
        entity_type_id: uuid.UUID,
        activity_type_id: uuid.UUID | None = None,
        dimension_value_ids: list[uuid.UUID] | None = None,
    ) -> list[dict]:
        """Collect all applicable participant meta fields for a given context.

        Returns the merged list of field definitions from all matching scopes:
        - Base: participant + entity_type
        - Scoped by activity_type (if provided)
        - Scoped by each dimension_value (if provided)
        - Cross-scoped by activity_type + each dimension_value
        """
        fields: list[dict] = []

        # Base scope: participant + entity_type only
        fields.extend(
            self.get_schema_by_scope(org_id, "participant", entity_type_id=entity_type_id)
        )

        if activity_type_id:
            fields.extend(
                self.get_schema_by_scope(
                    org_id,
                    "participant",
                    entity_type_id=entity_type_id,
                    activity_type_id=activity_type_id,
                )
            )

        for dv_id in dimension_value_ids or []:
            fields.extend(
                self.get_schema_by_scope(
                    org_id,
                    "participant",
                    entity_type_id=entity_type_id,
                    dimension_value_id=dv_id,
                )
            )
            if activity_type_id:
                fields.extend(
                    self.get_schema_by_scope(
                        org_id,
                        "participant",
                        entity_type_id=entity_type_id,
                        activity_type_id=activity_type_id,
                        dimension_value_id=dv_id,
                    )
                )

        return fields


class ListConfigService:
    """Manage per-type list page column configuration.

    All field-backed columns are derived from meta_field_schemas.
    Built-in static columns (counts, created_at) are appended at the end.
    """

    def __init__(self, db: Session):
        self.db = db

    # ── public API ──────────────────────────────────────────────

    def get_config(self, org_id: uuid.UUID, scope: str) -> list[dict]:
        """Get list config. Auto-generates defaults if none saved, merges new columns."""
        row = self.db.query(ListConfig).filter_by(organization_id=org_id, scope=scope).first()
        defaults = self._generate_defaults(org_id, scope)
        if not row:
            return defaults
        return self._merge_with_current(row.columns, defaults)

    def update_config(self, org_id: uuid.UUID, scope: str, columns: list[dict]) -> list[dict]:
        """Save list config."""
        row = self.db.query(ListConfig).filter_by(organization_id=org_id, scope=scope).first()
        if row:
            row.columns = columns
        else:
            row = ListConfig(organization_id=org_id, scope=scope, columns=columns)
            self.db.add(row)
        self.db.commit()
        return columns

    # ── default generation (powered by meta_field_schemas) ──────

    def _generate_defaults(self, org_id: uuid.UUID, scope: str) -> list[dict]:
        if scope.startswith("entity:"):
            return self._entity_defaults(org_id, scope)
        elif scope.startswith("activity:"):
            return self._activity_defaults(org_id, scope)
        return []

    def _field_to_col(self, f: dict, order: int) -> dict:
        """Convert a meta field schema field dict to a list column dict."""
        ftype = f.get("type", "text")
        # Use prefixed keys for dimension columns (needed by filter system)
        if ftype == "dimension" and f.get("dimension_id"):
            key = f"dim:{f['dimension_id']}"
        else:
            key = f"meta:{f['key']}"
        col: dict = {
            "key": key,
            "label": f.get("label", f["key"]),
            "field_type": ftype,
            "visible": True,
            "filterable": ftype == "dimension",  # dimensions filterable by default
            "sortable": False,
            "sort_order": order,
            "filter_supported": ftype in (
                "text", "number", "date", "datetime",
                "select", "multiselect", "boolean", "dimension",
            ),
        }
        # Dimension columns need dimension_key for frontend rendering
        if ftype == "dimension" and f.get("dimension_id"):
            from app.modules.dimension.model import Dimension
            dim = self.db.query(Dimension).filter_by(id=f["dimension_id"]).first()
            if dim:
                col["dimension_key"] = dim.key
        return col

    @staticmethod
    def _static_col(key: str, label: str, order: int, **kwargs) -> dict:
        col = {
            "key": key,
            "label": label,
            "field_type": "static",
            "visible": True,
            "filterable": kwargs.get("filterable", False),
            "sortable": kwargs.get("sortable", False),
            "sort_order": order,
            "filter_supported": kwargs.get("filter_supported", False),
        }
        return col

    def _entity_defaults(self, org_id: uuid.UUID, scope: str) -> list[dict]:
        type_id = uuid.UUID(scope.split(":", 1)[1])

        meta_service = MetaFieldSchemaService(self.db)
        fields = meta_service.get_schema_by_scope(org_id, "entity", entity_type_id=type_id)
        # Sort by sort_order
        fields.sort(key=lambda f: f.get("sort_order", 0))

        cols: list[dict] = []
        order = 0
        for f in fields:
            if f.get("visible") is False:
                continue
            cols.append(self._field_to_col(f, order))
            order += 1

        # Built-in static columns
        cols.append(self._static_col("enrollment_count", "Enrollments", order))
        order += 1
        cols.append(self._static_col("activity_count", "Activities", order))
        order += 1
        cols.append(self._static_col(
            "created_at", "Created", order,
            sortable=True, filterable=True, filter_supported=True,
        ))
        return cols

    def _activity_defaults(self, org_id: uuid.UUID, scope: str) -> list[dict]:
        type_id = uuid.UUID(scope.split(":", 1)[1])

        # Collect all fields from base + type-specific scopes (same as collectActivityFields)
        meta_service = MetaFieldSchemaService(self.db)
        seen_keys: set[str] = set()
        all_fields: list[dict] = []
        for f in meta_service.get_schema_by_scope(org_id, "activity"):
            if f["key"] not in seen_keys:
                seen_keys.add(f["key"])
                all_fields.append(f)
        for f in meta_service.get_schema_by_scope(org_id, "activity", activity_type_id=type_id):
            if f["key"] not in seen_keys:
                seen_keys.add(f["key"])
                all_fields.append(f)
        # Sort by sort_order
        all_fields.sort(key=lambda f: f.get("sort_order", 0))

        cols: list[dict] = []
        order = 0
        for f in all_fields:
            if f.get("visible") is False:
                continue
            cols.append(self._field_to_col(f, order))
            order += 1

        # Built-in static columns
        cols.append(self._static_col("participant_count", "Participants", order))
        order += 1
        cols.append(self._static_col(
            "created_at", "Created", order,
            sortable=True, filter_supported=True,
        ))
        return cols

    # ── merge logic ─────────────────────────────────────────────

    _STRUCTURAL_PROPS = {"field_type", "label", "dimension_key", "filter_supported"}

    @classmethod
    def _merge_with_current(cls, saved: list[dict], defaults: list[dict]) -> list[dict]:
        """Merge saved config with current defaults.

        - Preserve saved columns order/visibility/flags
        - Sync structural properties from defaults
        - Drop columns whose key no longer exists in defaults
        - Append new columns at the end
        """
        default_by_key = {d["key"]: d for d in defaults}

        result = []
        for c in saved:
            if c["key"] not in default_by_key:
                # Migration: check old-format keys (meta:key, dim:id)
                # and map to new format if possible
                continue
            merged = {**c}
            # Remove legacy source field if present
            merged.pop("source", None)
            merged.pop("meta_type", None)
            dflt = default_by_key[c["key"]]
            for prop in cls._STRUCTURAL_PROPS:
                if prop in dflt:
                    merged[prop] = dflt[prop]
                elif prop in merged:
                    del merged[prop]
            result.append(merged)

        existing_keys = {c["key"] for c in result}

        max_order = max((c.get("sort_order", 0) for c in result), default=0) + 1
        for d in defaults:
            if d["key"] not in existing_keys:
                d["sort_order"] = max_order
                max_order += 1
                result.append(d)

        return result
