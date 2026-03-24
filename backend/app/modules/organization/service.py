"""
Organization services
"""

import uuid

from sqlalchemy.orm import Session

from app.common.exceptions import NotFoundError, ValidationError
from app.modules.organization.model import ListConfig, MetaFieldSchema, USER_ENTITY_SENTINEL
from app.modules.organization.model import Organization
from app.modules.organization.system_fields import get_system_fields, merge_system_fields


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
        """Get fields for a specific scope, with system fields merged."""
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
        db_fields = row.fields if row else []

        # System fields only apply to base scope (no dimension/activity sub-scoping)
        is_base_scope = not activity_type_id and not dimension_value_id and not dimension_id
        # For entity scope: base = entity_type_id set, no other sub-scoping
        # For activity scope: base = no activity_type_id, no dimension_value_id
        if is_base_scope and scope_type in ("entity", "activity"):
            return merge_system_fields(scope_type, db_fields)

        return db_fields

    def get_all_schemas(self, org_id: uuid.UUID) -> list[MetaFieldSchema]:
        """Get all schema rows for an org."""
        return self.db.query(MetaFieldSchema).filter_by(organization_id=org_id).all()

    def get_all_schemas_with_system_fields(self, org_id: uuid.UUID) -> list[dict]:
        """Get all schema rows as dicts, with system fields merged into base scopes.

        Returns a list of dicts matching MetaFieldSchemaResponse format.
        """
        rows = self.get_all_schemas(org_id)

        # Track which base scopes we've seen (for injecting system field scopes)
        seen_base_scopes: set[str] = set()
        results = []

        for row in rows:
            scope_type = row.scope_type
            is_base = (
                not row.activity_type_id and not row.dimension_value_id and not row.dimension_id
            )

            if is_base and scope_type in ("entity", "activity"):
                # Merge system fields into this row's fields
                merged = merge_system_fields(scope_type, row.fields)
                seen_base_scopes.add(f"{scope_type}:{row.entity_type_id or ''}")
                results.append(
                    {
                        "row": row,
                        "fields": merged,
                    }
                )
            else:
                results.append(
                    {
                        "row": row,
                        "fields": row.fields,
                    }
                )

        # Inject system-field-only scopes that have no DB row yet
        # For "activity" scope: always inject if no base activity row exists
        if "activity:" not in seen_base_scopes:
            system = get_system_fields("activity")
            if system:
                results.append(
                    {
                        "row": None,
                        "scope_type": "activity",
                        "entity_type_id": None,
                        "activity_type_id": None,
                        "dimension_value_id": None,
                        "dimension_id": None,
                        "fields": system,
                    }
                )

        # For "entity" scope: inject for each entity type that has no DB row
        from app.modules.entity.model import EntityType

        entity_types = self.db.query(EntityType).filter_by(organization_id=org_id).all()
        for et in entity_types:
            scope_key = f"entity:{et.id}"
            if scope_key not in seen_base_scopes:
                system = get_system_fields("entity")
                if system:
                    results.append(
                        {
                            "row": None,
                            "scope_type": "entity",
                            "entity_type_id": et.id,
                            "activity_type_id": None,
                            "dimension_value_id": None,
                            "dimension_id": None,
                            "fields": system,
                        }
                    )

        return results

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

        System fields cannot be deleted or have their key/type changed.
        Only overridable properties (label, required, display_type, stage,
        visible) are stored for system fields.
        """
        from app.modules.organization.system_fields import (
            SYSTEM_FIELD_IMMUTABLE_PROPS,
            SYSTEM_FIELD_OVERRIDABLE_PROPS,
        )

        # Check if this is a base scope that has system fields
        is_base_scope = not activity_type_id and not dimension_value_id and not dimension_id
        system_defaults = get_system_fields(scope_type) if is_base_scope else []
        system_keys = {f["key"] for f in system_defaults}
        system_by_key = {f["key"]: f for f in system_defaults}

        if system_keys:
            # Validate: system fields cannot be deleted
            submitted_keys = {f["key"] for f in fields if f.get("system")}
            missing = system_keys - submitted_keys
            if missing:
                raise ValidationError(f"System fields cannot be deleted: {', '.join(missing)}")

            # Validate: system field immutable props cannot change
            for f in fields:
                if not f.get("system"):
                    continue
                default = system_by_key.get(f["key"])
                if not default:
                    raise ValidationError(f"Unknown system field: {f['key']}")
                for prop in SYSTEM_FIELD_IMMUTABLE_PROPS:
                    if prop in f and f[prop] != default[prop]:
                        raise ValidationError(
                            f"Cannot change '{prop}' of system field '{f['key']}'"
                        )

        # For storage: keep override properties for system fields
        # Always store system fields (even without overrides) to preserve ordering
        fields_to_store = []
        for f in fields:
            if f.get("system") and f["key"] in system_by_key:
                default = system_by_key[f["key"]]
                override = {"key": f["key"], "system": True}
                for prop in SYSTEM_FIELD_OVERRIDABLE_PROPS:
                    if prop in f and f[prop] != default.get(prop):
                        override[prop] = f[prop]
                fields_to_store.append(override)
            else:
                fields_to_store.append(f)

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
            row.fields = fields_to_store
        else:
            row = MetaFieldSchema(
                organization_id=org_id,
                scope_type=scope_type,
                entity_type_id=entity_type_id,
                activity_type_id=activity_type_id,
                dimension_value_id=dimension_value_id,
                dimension_id=dimension_id,
                fields=fields_to_store,
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

        # Build a lookup for entity system field overrides (label)
        meta_service = MetaFieldSchemaService(self.db)
        sys_fields: dict[str, dict] = {}
        for f in meta_service.get_schema_by_scope(org_id, "entity", entity_type_id=type_id):
            if f.get("system"):
                sys_fields[f["key"]] = f

        # System field: name (stored in meta, rendered as "static" key for backward compat)
        if sys_fields.get("name", {}).get("visible", True) is not False:
            cols.append(
                self._col(
                    "static",
                    "name",
                    sys_fields.get("name", {}).get("label", "Name"),
                    order,
                    sortable=True,
                )
            )
            order += 1

        # System field: case_number (stored in meta, if enabled)
        config = et.config or {}
        if (
            config.get("case_number_enabled")
            and sys_fields.get("case_number", {}).get("visible", True) is not False
        ):
            cols.append(
                self._col(
                    "static",
                    "case_number",
                    sys_fields.get("case_number", {}).get("label", "Case No."),
                    order,
                    sortable=True,
                )
            )
            order += 1

        # Custom meta fields (skip system fields – already added above)
        fields = meta_service.get_schema_by_scope(org_id, "entity", entity_type_id=type_id)
        for f in fields:
            if f.get("system"):
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

        # Build a lookup for system field overrides (label, type)
        meta_service = MetaFieldSchemaService(self.db)
        sys_fields: dict[str, dict] = {}
        for f in meta_service.get_schema_by_scope(org_id, "activity"):
            if f.get("system"):
                sys_fields[f["key"]] = f

        def sys_prop(key: str, prop: str, default: str) -> str:
            return sys_fields.get(key, {}).get(prop, default)

        def sys_visible(key: str) -> bool:
            return sys_fields.get(key, {}).get("visible", True) is not False

        if sys_visible("start_date"):
            cols.append(
                self._col(
                    "static",
                    "start_date",
                    sys_prop("start_date", "label", "Start Date"),
                    order,
                    sortable=True,
                    filterable=True,
                    filter_supported=True,
                    meta_type=sys_prop("start_date", "type", "datetime"),
                )
            )
            order += 1
        if sys_visible("end_date"):
            cols.append(
                self._col(
                    "static",
                    "end_date",
                    sys_prop("end_date", "label", "End Date"),
                    order,
                    sortable=True,
                    filterable=True,
                    filter_supported=True,
                    meta_type=sys_prop("end_date", "type", "datetime"),
                )
            )
            order += 1
        if sys_visible("title"):
            cols.append(
                self._col(
                    "static", "title", sys_prop("title", "label", "Title"), order, sortable=True
                )
            )
            order += 1

        # Dimensions (visible + filterable for activities)
        order = self._add_dimension_columns(cols, org_id, order, visible=True)

        # Meta fields (base "activity" scope + type-specific scope)
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
        fields = all_fields
        for f in fields:
            if f.get("system"):
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
