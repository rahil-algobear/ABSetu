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
            elif f.get("type") == "participant_list" and f.get("entity_type_id"):
                base = "pl"
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
    """Manage per-type list page column configuration."""

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

        # All meta fields (no system field distinction)
        meta_service = MetaFieldSchemaService(self.db)
        fields = meta_service.get_schema_by_scope(org_id, "entity", entity_type_id=type_id)
        for f in fields:
            if f.get("visible") is False:
                continue
            ftype = f.get("type", "text")
            cols.append(
                self._col(
                    "meta",
                    f"meta:{f['key']}",
                    f.get("label", f["key"]),
                    order,
                    filterable=False,
                    sortable=False,
                    meta_type=ftype,
                    filter_supported=True,
                )
            )
            order += 1

        # Static: counts
        cols.append(self._col("static", "enrollment_count", "Enrollments", order))
        order += 1
        cols.append(self._col("static", "activity_count", "Activities", order))
        order += 1

        # Static: created_at
        cols.append(
            self._col(
                "static",
                "created_at",
                "Created",
                order,
                sortable=True,
                filterable=True,
                filter_supported=True,
            )
        )

        return cols

    def _activity_defaults(self, org_id: uuid.UUID, scope: str) -> list[dict]:
        from app.modules.activity.model import ActivityType

        type_id = uuid.UUID(scope.split(":", 1)[1])
        at = self.db.query(ActivityType).filter_by(id=type_id, organization_id=org_id).first()
        if not at:
            raise ValidationError("Activity type not found")

        cols: list[dict] = []
        order = 0

        # Dimensions (visible + filterable for activities)
        order = self._add_dimension_columns(cols, org_id, order, visible=True)

        # All meta fields (base "activity" scope + type-specific scope)
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
        for f in all_fields:
            if f.get("visible") is False:
                continue
            ftype = f.get("type", "text")
            cols.append(
                self._col(
                    "meta",
                    f"meta:{f['key']}",
                    f.get("label", f["key"]),
                    order,
                    filterable=False,
                    sortable=False,
                    meta_type=ftype,
                    filter_supported=True,
                )
            )
            order += 1

        cols.append(self._col("static", "participant_count", "Participants", order))
        order += 1
        cols.append(
            self._col(
                "static", "created_at", "Created", order, sortable=True, filter_supported=True
            )
        )

        return cols

    def _add_dimension_columns(
        self,
        cols: list[dict],
        org_id: uuid.UUID,
        order: int,
        visible: bool = False,
    ) -> int:
        """Add dimension columns — filterable=True, sortable=False.

        Dimensions need to be in the list config so their keys appear in
        filterable_keys (used by build_dimension_filters).
        Each column stores ``dimension_key`` (slug) so the frontend can
        match against DimensionInfo.dimension_key for rendering.
        """
        from app.modules.dimension.model import Dimension

        dims = (
            self.db.query(Dimension)
            .filter_by(organization_id=org_id)
            .order_by(Dimension.sort_order)
            .all()
        )
        for dim in dims:
            col = self._col(
                "dimension",
                f"dim:{dim.id}",
                dim.name,
                order,
                visible=visible,
                filterable=True,
                sortable=False,
                filter_supported=True,
            )
            col["dimension_key"] = dim.key
            cols.append(col)
            order += 1
        return order

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
        filter_supported: bool = False,
    ) -> dict:
        col = {
            "source": source,
            "key": key,
            "label": label,
            "visible": visible,
            "filterable": filterable,
            "sortable": sortable,
            "sort_order": sort_order,
            "filter_supported": filter_supported,
        }
        if meta_type:
            col["meta_type"] = meta_type
        return col

    # ── merge logic ─────────────────────────────────────────────

    # Properties that are structural (not user-configurable) and should
    # always be synced from the current defaults, even on saved configs.
    _STRUCTURAL_PROPS = {"source", "label", "meta_type", "dimension_key", "filter_supported"}

    @classmethod
    def _merge_with_current(cls, saved: list[dict], defaults: list[dict]) -> list[dict]:
        """Merge saved config with current defaults.

        - Preserve saved columns order/visibility/flags
        - Sync structural properties (source, meta_type, dimension_key) from defaults
        - Drop columns whose key no longer exists in defaults
        - Append new columns (present in defaults but not saved) at the end
        """
        default_by_key = {d["key"]: d for d in defaults}

        # Keep saved columns that still exist, syncing structural props
        result = []
        for c in saved:
            if c["key"] not in default_by_key:
                continue
            merged = {**c}
            dflt = default_by_key[c["key"]]
            for prop in cls._STRUCTURAL_PROPS:
                if prop in dflt:
                    merged[prop] = dflt[prop]
                elif prop in merged:
                    del merged[prop]
            result.append(merged)

        existing_keys = {c["key"] for c in result}

        # Append new defaults
        max_order = max((c.get("sort_order", 0) for c in result), default=0) + 1
        for d in defaults:
            if d["key"] not in existing_keys:
                d["sort_order"] = max_order
                max_order += 1
                result.append(d)

        return result
