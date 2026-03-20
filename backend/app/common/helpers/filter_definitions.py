"""
Reusable filter/sort definition builders for list endpoints.
Each function returns a list of dicts ready for the frontend or sort config for the backend.
"""

import uuid
from typing import Any

from sqlalchemy import Integer, Numeric, String
from sqlalchemy.orm import Session


def build_dimension_filters(
    db: Session,
    org_id: uuid.UUID,
    accessible_dv_ids: list[uuid.UUID] | None = None,
) -> list[dict]:
    """
    Build dimension filter definitions for an org, scoped by user access.

    Returns a list of filter dicts like:
        {"key": "dim:<uuid>", "label": "Location", "type": "select", "options": [...]}

    If accessible_dv_ids is provided, only dimension values the user can access
    are included. Dimensions where the user has no assignments are unrestricted.
    """
    from app.modules.dimension.model import Dimension, DimensionValue

    dims = (
        db.query(Dimension)
        .filter_by(organization_id=org_id)
        .order_by(Dimension.sort_order)
        .all()
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
            result.append({
                "key": f"dim:{dim.id}",
                "label": dim.name,
                "type": "select",
                "options": [{"value": str(v.id), "label": v.name} for v in values],
            })

    return result


def build_meta_field_filters(
    db: Session,
    org_id: uuid.UUID,
    scope_keys: list[str],
) -> list[dict]:
    """
    Build meta field filter definitions for given scope keys.

    scope_keys: list of meta field schema scope keys, e.g. ["entity:<uuid>", "activity"]

    Only includes fields where is_filterable=True in the schema.
    """
    from app.modules.organization.service import MetaFieldSchemaService

    meta_service = MetaFieldSchemaService(db)
    result = []

    for scope_key in scope_keys:
        fields = meta_service.get_schema(org_id, scope_key)
        for field in fields:
            if not field.get("is_filterable"):
                continue

            ftype = field.get("type", "text")
            filter_def: dict = {
                "key": f"meta:{field['key']}",
                "label": field.get("label", field["key"]),
            }
            if ftype in ("select", "multiselect") and field.get("options"):
                filter_def["type"] = "select"
                filter_def["options"] = [
                    {"value": o, "label": o} for o in field["options"]
                ]
            elif ftype == "number":
                filter_def["type"] = "range"
            elif ftype == "date":
                filter_def["type"] = "date_range"
            elif ftype == "boolean":
                filter_def["type"] = "boolean"
            else:
                filter_def["type"] = "text"
            result.append(filter_def)

    return result


def build_meta_field_filter_config(
    db: Session,
    org_id: uuid.UUID,
    scope_keys: list[str],
    meta_column: Any,
) -> dict[str, dict]:
    """
    Build filter config entries for meta fields marked is_filterable.

    Returns a dict suitable for apply_filters(), e.g.:
        {"meta:age": {"type": "meta_range", "meta_key": "age", "meta_column": Entity.meta}, ...}

    meta_column: the SQLAlchemy JSONB column (e.g. Entity.meta)
    """
    from app.modules.organization.service import MetaFieldSchemaService

    meta_service = MetaFieldSchemaService(db)
    config: dict[str, dict] = {}

    for scope_key in scope_keys:
        fields = meta_service.get_schema(org_id, scope_key)
        for field in fields:
            if not field.get("is_filterable"):
                continue

            key = f"meta:{field['key']}"
            if key in config:
                continue

            ftype = field.get("type", "text")
            if ftype in ("select", "multiselect"):
                config[key] = {
                    "type": "meta_select",
                    "meta_key": field["key"],
                    "meta_column": meta_column,
                }
            elif ftype == "number":
                config[key] = {
                    "type": "meta_range",
                    "meta_key": field["key"],
                    "meta_column": meta_column,
                }
            elif ftype == "boolean":
                config[key] = {
                    "type": "boolean",
                    "meta_key": field["key"],
                    "meta_column": meta_column,
                }
            elif ftype == "date":
                config[key] = {
                    "type": "date_range",
                    "column": meta_column[field["key"]].astext,
                }
            else:
                # text — use ILIKE via meta_select with single value
                config[key] = {
                    "type": "meta_select",
                    "meta_key": field["key"],
                    "meta_column": meta_column,
                }

    return config


def build_meta_field_sort_config(
    db: Session,
    org_id: uuid.UUID,
    scope_keys: list[str],
    meta_column: Any,
) -> dict[str, Any]:
    """
    Build sort config entries for meta fields marked is_sortable.

    Returns a dict like:
        {"meta:age": <cast expression>, "meta:name": <cast expression>}

    meta_column: the SQLAlchemy JSONB column (e.g. Entity.meta)
    """
    from app.modules.organization.service import MetaFieldSchemaService

    meta_service = MetaFieldSchemaService(db)
    config: dict[str, Any] = {}

    # Types that cannot be sorted
    unsortable_types = {"multiselect", "boolean"}

    for scope_key in scope_keys:
        fields = meta_service.get_schema(org_id, scope_key)
        for field in fields:
            if not field.get("is_sortable"):
                continue
            ftype = field.get("type", "text")
            if ftype in unsortable_types:
                continue

            key = f"meta:{field['key']}"
            if key in config:
                continue  # avoid duplicates across scopes

            # Cast based on type for correct ordering
            if ftype == "number":
                config[key] = meta_column[field["key"]].astext.cast(Numeric)
            elif ftype == "date":
                config[key] = meta_column[field["key"]].astext
            else:
                # text, select — alphabetical
                config[key] = meta_column[field["key"]].astext

    return config
