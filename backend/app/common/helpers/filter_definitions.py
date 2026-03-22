"""
Reusable filter/sort definition builders for list endpoints.
Each function returns a list of dicts ready for the frontend or config for the backend.
"""

import uuid
from typing import Any, TypedDict

from sqlalchemy import Numeric
from sqlalchemy.orm import Session


class MetaFieldScope(TypedDict, total=False):
    scope_type: str
    entity_type_id: uuid.UUID | None
    activity_type_id: uuid.UUID | None
    dimension_value_id: uuid.UUID | None
    dimension_id: uuid.UUID | None


def build_dimension_filters(
    db: Session,
    org_id: uuid.UUID,
    accessible_dv_ids: list[uuid.UUID] | None = None,
    allowed_keys: set[str] | None = None,
) -> list[dict]:
    """
    Build dimension filter definitions for an org, scoped by user access.

    If allowed_keys is provided, only include dimensions whose key (dim:{id})
    is in the set (i.e. marked filterable in list config).
    """
    from app.modules.dimension.model import Dimension, DimensionValue

    dims = (
        db.query(Dimension).filter_by(organization_id=org_id).order_by(Dimension.sort_order).all()
    )

    # Build per-dimension access sets if user has restrictions
    restricted_dims: dict[uuid.UUID, set[uuid.UUID]] = {}
    if accessible_dv_ids:
        dv_dim_rows = (
            db.query(DimensionValue.id, DimensionValue.dimension_id)
            .filter(DimensionValue.id.in_(accessible_dv_ids))
            .all()
        )
        for dv_id, dim_id in dv_dim_rows:
            restricted_dims.setdefault(dim_id, set()).add(dv_id)

    result = []
    for dim in dims:
        dim_key = f"dim:{dim.id}"
        if allowed_keys is not None and dim_key not in allowed_keys:
            continue

        values = (
            db.query(DimensionValue)
            .filter_by(dimension_id=dim.id)
            .order_by(DimensionValue.sort_order, DimensionValue.name)
            .all()
        )

        # Scope values: if user has restrictions for this dimension, filter
        if dim.id in restricted_dims:
            allowed = restricted_dims[dim.id]
            values = [v for v in values if v.id in allowed]

        if values:
            result.append(
                {
                    "key": dim_key,
                    "label": dim.name,
                    "type": "select",
                    "options": [{"value": str(v.id), "label": v.name} for v in values],
                }
            )

    return result


def _collect_fields(
    db: Session,
    org_id: uuid.UUID,
    scopes: list[MetaFieldScope],
) -> list[tuple[str, dict]]:
    """Collect meta field definitions from multiple scopes, deduplicating by key."""
    from app.modules.organization.service import MetaFieldSchemaService

    meta_service = MetaFieldSchemaService(db)
    seen_keys: set[str] = set()
    result: list[tuple[str, dict]] = []

    for scope in scopes:
        fields = meta_service.get_schema_by_scope(
            org_id,
            scope_type=scope["scope_type"],
            entity_type_id=scope.get("entity_type_id"),
            activity_type_id=scope.get("activity_type_id"),
            dimension_value_id=scope.get("dimension_value_id"),
            dimension_id=scope.get("dimension_id"),
        )
        for field in fields:
            meta_key = f"meta:{field['key']}"
            if meta_key not in seen_keys:
                seen_keys.add(meta_key)
                result.append((meta_key, field))

    return result


def build_meta_field_filters(
    db: Session,
    org_id: uuid.UUID,
    scopes: list[MetaFieldScope],
    allowed_keys: set[str] | None = None,
) -> list[dict]:
    """
    Build meta field filter definitions for given scopes.

    If allowed_keys is provided, only include meta fields whose key (meta:{key})
    is in the set (i.e. marked filterable in list config).
    """
    result = []
    for meta_key, field in _collect_fields(db, org_id, scopes):
        if allowed_keys is not None and meta_key not in allowed_keys:
            continue

        ftype = field.get("type", "text")
        filter_def: dict = {
            "key": meta_key,
            "label": field.get("label", field["key"]),
        }
        if ftype in ("select", "multiselect") and field.get("options"):
            filter_def["type"] = "select"
            filter_def["options"] = [{"value": o, "label": o} for o in field["options"]]
        elif ftype == "number":
            filter_def["type"] = "range"
        elif ftype in ("date", "datetime"):
            filter_def["type"] = "date_range"
            if ftype == "datetime":
                filter_def["allowTime"] = True
        elif ftype == "boolean":
            filter_def["type"] = "boolean"
        else:
            filter_def["type"] = "text"
        result.append(filter_def)

    return result


def build_meta_field_filter_config(
    db: Session,
    org_id: uuid.UUID,
    scopes: list[MetaFieldScope],
    meta_column: Any,
    allowed_keys: set[str] | None = None,
) -> dict[str, dict]:
    """
    Build apply_filters-compatible config for meta fields.

    If allowed_keys provided, only include those meta field keys.
    """
    config: dict[str, dict] = {}

    for meta_key, field in _collect_fields(db, org_id, scopes):
        if allowed_keys is not None and meta_key not in allowed_keys:
            continue

        ftype = field.get("type", "text")
        if ftype in ("select", "multiselect"):
            config[meta_key] = {
                "type": "meta_select",
                "meta_key": field["key"],
                "meta_column": meta_column,
            }
        elif ftype == "number":
            config[meta_key] = {
                "type": "meta_range",
                "meta_key": field["key"],
                "meta_column": meta_column,
            }
        elif ftype == "boolean":
            config[meta_key] = {
                "type": "boolean",
                "meta_key": field["key"],
                "meta_column": meta_column,
            }
        elif ftype in ("date", "datetime"):
            config[meta_key] = {
                "type": "meta_date_range",
                "meta_key": field["key"],
                "meta_column": meta_column,
            }
        else:
            config[meta_key] = {
                "type": "meta_select",
                "meta_key": field["key"],
                "meta_column": meta_column,
            }

    return config


def build_meta_field_sort_config(
    db: Session,
    org_id: uuid.UUID,
    scopes: list[MetaFieldScope],
    meta_column: Any,
    allowed_keys: set[str] | None = None,
) -> dict[str, Any]:
    """
    Build sort config entries for sortable meta fields.

    If allowed_keys provided, only include those meta field keys.
    """
    config: dict[str, Any] = {}

    for meta_key, field in _collect_fields(db, org_id, scopes):
        if allowed_keys is not None and meta_key not in allowed_keys:
            continue

        ftype = field.get("type", "text")
        if ftype == "number":
            config[meta_key] = meta_column[field["key"]].astext.cast(Numeric)
        else:
            config[meta_key] = meta_column[field["key"]].astext

    return config


def build_dimension_filter_config(
    db: Session,
    org_id: uuid.UUID,
    assoc_fk: Any,
    assoc_dv: Any,
    parent_pk: Any,
) -> dict[str, dict]:
    """
    Build apply_filters-compatible dimension config from org's dimensions.

    Shared by EntityService and ActivityService — only the association
    model columns differ between callers.
    """
    from app.modules.dimension.model import Dimension

    dims = db.query(Dimension).filter_by(organization_id=org_id).all()
    config: dict[str, dict] = {}
    for dim in dims:
        config[f"dim:{dim.id}"] = {
            "type": "dimension",
            "assoc_fk": assoc_fk,
            "assoc_dv": assoc_dv,
            "parent_pk": parent_pk,
        }
    return config


def build_list_filter_response(
    db: Session,
    org_id: uuid.UUID,
    accessible_dv_ids: list[uuid.UUID] | None,
    *,
    type_filter: dict | None = None,
    type_id: str | None = None,
    scope_prefix: str,
    meta_scopes: list[MetaFieldScope],
    date_filters: list[dict],
    default_sortable_keys: list[str],
) -> dict:
    """
    Build the complete /filters endpoint response.

    Shared by entity and activity /filters routes. Handles:
    - Type filter (entity_type or activity_type dropdown)
    - List config loading (columns, filterable/sortable keys)
    - Dimension filters (scoped by user access + list config)
    - Meta field filters (scoped by list config)
    - Date filters (scoped by list config)
    - Column ordering by list config sort_order

    Args:
        type_filter: Optional pre-built type filter dict
            e.g. {"key": "entity_type_id", "label": "Entity Type", "options": [...]}
        type_id: Selected type ID for list config scoping (None = all types)
        scope_prefix: "entity" or "activity" — used for list config scope key
        meta_scopes: Scopes for meta field schema lookup
        date_filters: Static date filter definitions
            e.g. [{"key": "created_at", "label": "Created Date"}]
        default_sortable_keys: Default sortable keys when no list config exists
    """
    from app.modules.organization.service import ListConfigService

    filters: list[dict] = []
    if type_filter:
        filters.append(type_filter)

    # Load list config for the selected type
    columns: list[dict] = []
    filterable_keys: set[str] | None = None
    sortable_keys = list(default_sortable_keys)

    if type_id:
        scope = f"{scope_prefix}:{type_id}"
        columns = ListConfigService(db).get_config(org_id, scope)
        filterable_keys = {c["key"] for c in columns if c.get("filterable")}
        sortable_keys = [c["key"] for c in columns if c.get("sortable")]

    # Build field-level filters
    field_filters: list[dict] = []

    # Dimension filters (scoped by user access + list config)
    field_filters.extend(build_dimension_filters(db, org_id, accessible_dv_ids, filterable_keys))

    # Meta field filters (scoped by list config)
    field_filters.extend(build_meta_field_filters(db, org_id, meta_scopes, filterable_keys))

    # Date filters (only if list config allows or no config)
    for df in date_filters:
        if filterable_keys is None or df["key"] in filterable_keys:
            field_filters.append(
                {
                    "key": df["key"],
                    "label": df["label"],
                    "type": "date_range",
                }
            )

    # Sort field filters to match list config column order
    if columns:
        order_map = {c["key"]: c.get("sort_order", 0) for c in columns}
        field_filters.sort(key=lambda f: order_map.get(f["key"], 9999))

    filters.extend(field_filters)

    # Visible columns sorted by sort_order
    visible_columns = sorted(
        [c for c in columns if c.get("visible")],
        key=lambda c: c.get("sort_order", 0),
    )

    return {
        "filters": filters,
        "sortable_keys": sortable_keys,
        "columns": visible_columns,
    }
