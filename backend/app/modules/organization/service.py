"""
Organization services
"""

import re
import uuid

from sqlalchemy.orm import Session

from app.common.exceptions import NotFoundError, ValidationError
from app.modules.organization.model import (
    USER_ENTITY_SENTINEL,
    ListConfig,
    MetaFieldSchema,
    Organization,
)


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

    _PREFIX_PATTERN = re.compile(r"^[a-z0-9]{4}_")

    @classmethod
    def _ensure_field_keys(
        cls, fields: list[dict], existing: list[dict] | None = None
    ) -> list[dict]:
        """Give every field a stable ``id`` and a unique, immutable ``key``.

        Each field carries two identifiers:
        - ``id``: an opaque uuid — the field's permanent identity.
        - ``key``: the slug used as the storage key inside row ``meta`` JSONB.

        Both are immutable for a field's lifetime. Incoming fields are matched
        against the previously-stored schema (``existing``) by ``id``; on a
        match, the stored id and key are restored verbatim and any
        client-supplied drift is ignored. This guarantees the storage slug
        never changes under an existing field, so values already written to row
        ``meta`` are never orphaned. A field with no matching id is treated as
        new: it receives a fresh uuid and a freshly generated key
        (format: ``{4-char random}_{descriptive_base}``, e.g. ``a3x9_name``).
        """
        import random
        import string

        existing = existing or []
        existing_by_id = {f["id"]: f for f in existing if f.get("id")}
        # Reserve keys already taken by stored fields (including any that were
        # dropped from this update) so a new field never collides with — or
        # silently reclaims the orphaned data of — an old slug.
        used_keys = {f["key"] for f in existing if f.get("key")}

        result = []
        for f in fields:
            f = dict(f)
            prior = existing_by_id.get(f.get("id"))
            if prior:
                # Existing field — pin its identity. id + key never change.
                f["id"] = prior["id"]
                f["key"] = prior["key"]
                used_keys.add(prior["key"])
                result.append(f)
                continue

            # New field — mint a permanent id (ignore any unmatched client id).
            f["id"] = str(uuid.uuid4())

            key = f.get("key") or ""
            # Honor a pre-supplied prefixed key only if it doesn't collide.
            if key and cls._PREFIX_PATTERN.search(key) and key not in used_keys:
                used_keys.add(key)
                result.append(f)
                continue
            # Generate a descriptive base from the field
            if f.get("type") == "dimension" and f.get("dimension_id"):
                base = "dim"
            elif f.get("type") == "entity_list" and f.get("entity_type_id"):
                base = "el"
            elif f.get("type") == "user_list":
                base = "ul"
            elif key:
                base = re.compile(r"[^a-z0-9_]").sub("", key.lower().replace(" ", "_"))
            else:
                label = f.get("label", "field")
                base = re.compile(r"[^a-z0-9_]").sub("", label.lower().replace(" ", "_"))
            # Generate prefix and ensure uniqueness
            for _ in range(100):
                prefix = "".join(random.choices(string.ascii_lowercase + string.digits, k=4))
                new_key = f"{prefix}_{base}"
                if new_key not in used_keys:
                    break
            f["key"] = new_key
            used_keys.add(new_key)
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
        # Reconcile against the currently-stored fields so existing fields keep
        # their id + storage key (slug). Only genuinely new fields get fresh ones.
        fields = self._ensure_field_keys(fields, row.fields if row else [])
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

    Columns are explicitly chosen by the admin.  Meta-field columns must
    be added via the list-settings UI; they are NOT auto-included.
    Built-in static columns (counts, created_at) are always present.
    """

    def __init__(self, db: Session):
        self.db = db

    # ── public API ──────────────────────────────────────────────

    def get_config(self, org_id: uuid.UUID, scope: str) -> list[dict]:
        """Return active columns for a scope.

        If no config is saved, returns only the built-in static columns.
        Saved configs are merged with current static columns (structural
        props refreshed, stale keys dropped) but new meta-field columns
        are NOT auto-added — the admin must add them explicitly.
        """
        row = (
            self.db.query(ListConfig)
            .filter_by(
                organization_id=org_id,
                scope=scope,
            )
            .first()
        )
        static = self._static_defaults(scope)
        if not row:
            return static
        catalog = self._all_meta_columns(org_id, scope)
        return self._merge_saved(row.columns, static, catalog)

    def get_settings(self, org_id: uuid.UUID, scope: str) -> dict:
        """Return columns + available (not-yet-added) meta columns.

        Used by the list-settings admin page.
        """
        columns = self.get_config(org_id, scope)
        catalog = self._all_meta_columns(org_id, scope)
        active_keys = {c["key"] for c in columns}
        available = [c for c in catalog if c["key"] not in active_keys]
        return {"columns": columns, "available_columns": available}

    def update_config(self, org_id: uuid.UUID, scope: str, columns: list[dict]) -> list[dict]:
        """Save list config."""
        row = (
            self.db.query(ListConfig)
            .filter_by(
                organization_id=org_id,
                scope=scope,
            )
            .first()
        )
        if row:
            row.columns = columns
        else:
            row = ListConfig(organization_id=org_id, scope=scope, columns=columns)
            self.db.add(row)
        self.db.commit()
        return columns

    # ── column helpers ──────────────────────────────────────────

    def _field_to_col(self, f: dict, order: int) -> dict:
        """Convert a meta field schema field dict to a list column dict."""
        ftype = f.get("type", "text")
        if ftype == "dimension" and f.get("dimension_id"):
            key = f"dim:{f['dimension_id']}"
        else:
            key = f"meta:{f['key']}"
        col: dict = {
            "key": key,
            "label": f.get("label", f["key"]),
            "field_type": ftype,
            "visible": True,
            "filterable": ftype == "dimension",
            "sortable": False,
            "searchable": ftype == "text",
            "sort_order": order,
            "filter_supported": ftype
            in (
                "text",
                "number",
                "date",
                "datetime",
                "select",
                "multiselect",
                "boolean",
                "dimension",
            ),
            "search_supported": ftype in ("text", "number", "select", "dimension"),
        }
        if ftype == "dimension" and f.get("dimension_id"):
            from app.modules.dimension.model import Dimension

            dim = self.db.query(Dimension).filter_by(id=f["dimension_id"]).first()
            if dim:
                col["dimension_key"] = dim.key
        return col

    @staticmethod
    def _static_col(key: str, label: str, order: int, **kwargs) -> dict:
        return {
            "key": key,
            "label": label,
            "field_type": "static",
            "visible": True,
            "filterable": kwargs.get("filterable", False),
            "sortable": kwargs.get("sortable", False),
            "searchable": kwargs.get("searchable", False),
            "sort_order": order,
            "filter_supported": kwargs.get("filter_supported", False),
            "search_supported": kwargs.get("search_supported", False),
        }

    # ── static (built-in) defaults ──────────────────────────────

    def _entity_type_can_enroll(self, entity_type_id: str) -> bool:
        """Whether the entity type allows enrollments. Defaults True if the
        type can't be resolved (defensive — don't silently hide columns)."""
        from app.modules.entity.model import EntityType

        try:
            et_uuid = uuid.UUID(entity_type_id)
        except (ValueError, AttributeError):
            return True
        et = self.db.query(EntityType).filter_by(id=et_uuid).first()
        return et.can_enroll if et else True

    def _static_defaults(self, scope: str) -> list[dict]:
        """Built-in columns that are always present."""
        if scope.startswith("entity:"):
            cols = []
            cols.append(
                self._static_col(
                    "code",
                    "Code",
                    len(cols),
                    sortable=True,
                    searchable=True,
                    search_supported=True,
                )
            )
            if self._entity_type_can_enroll(scope[len("entity:") :]):
                cols.append(self._static_col("enrollment_count", "Enrollments", len(cols)))
            cols.append(self._static_col("activity_count", "Activities", len(cols)))
            cols.append(
                self._static_col(
                    "created_at",
                    "Created",
                    len(cols),
                    sortable=True,
                    filterable=True,
                    filter_supported=True,
                )
            )
            cols.append(
                self._static_col(
                    "created_by",
                    "Created By",
                    len(cols),
                    sortable=True,
                    filterable=True,
                    filter_supported=True,
                )
            )
            return cols
        elif scope.startswith("activity:"):
            return [
                self._static_col("participant_count", "Participants", 0),
                self._static_col(
                    "created_at",
                    "Created",
                    1,
                    sortable=True,
                    filter_supported=True,
                ),
                self._static_col(
                    "created_by",
                    "Created By",
                    2,
                    sortable=True,
                    filterable=True,
                    filter_supported=True,
                ),
            ]
        return []

    # ── full meta-field catalog ─────────────────────────────────

    def _all_meta_columns(self, org_id: uuid.UUID, scope: str) -> list[dict]:
        """All possible meta-field columns for a scope (the 'catalog')."""
        meta_service = MetaFieldSchemaService(self.db)
        fields: list[dict] = []

        if scope.startswith("entity:"):
            type_id = uuid.UUID(scope.split(":", 1)[1])
            fields = meta_service.get_schema_by_scope(
                org_id,
                "entity",
                entity_type_id=type_id,
            )
        elif scope.startswith("activity:"):
            type_id = uuid.UUID(scope.split(":", 1)[1])
            seen_keys: set[str] = set()
            for f in meta_service.get_schema_by_scope(org_id, "activity"):
                if f["key"] not in seen_keys:
                    seen_keys.add(f["key"])
                    fields.append(f)
            for f in meta_service.get_schema_by_scope(
                org_id,
                "activity",
                activity_type_id=type_id,
            ):
                if f["key"] not in seen_keys:
                    seen_keys.add(f["key"])
                    fields.append(f)

        fields.sort(key=lambda f: f.get("sort_order", 0))
        cols: list[dict] = []
        for i, f in enumerate(fields):
            if f.get("visible") is False:
                continue
            cols.append(self._field_to_col(f, i))
        return cols

    # ── merge logic ─────────────────────────────────────────────

    _STRUCTURAL_PROPS = {
        "field_type",
        "label",
        "dimension_key",
        "filter_supported",
        "search_supported",
    }

    @classmethod
    def _merge_saved(
        cls,
        saved: list[dict],
        static: list[dict],
        catalog: list[dict],
    ) -> list[dict]:
        """Merge saved config with current truth.

        - Keep saved columns in their order with user-set flags.
        - Sync structural properties from the catalog / static defaults.
        - Drop columns whose key no longer exists in catalog or static.
        - Ensure static columns are present (append missing ones).
        - Do NOT auto-add new meta-field columns.
        """
        known = {c["key"]: c for c in catalog}
        known.update({c["key"]: c for c in static})

        result = []
        for c in saved:
            if c["key"] not in known:
                continue
            merged = {**c}
            merged.pop("source", None)
            merged.pop("meta_type", None)
            dflt = known[c["key"]]
            for prop in cls._STRUCTURAL_PROPS:
                if prop in dflt:
                    merged[prop] = dflt[prop]
                elif prop in merged:
                    del merged[prop]
            result.append(merged)

        # Ensure all static columns are present
        existing_keys = {c["key"] for c in result}
        max_order = max((c.get("sort_order", 0) for c in result), default=-1) + 1
        for s in static:
            if s["key"] not in existing_keys:
                s_copy = {**s, "sort_order": max_order}
                max_order += 1
                result.append(s_copy)

        return result
