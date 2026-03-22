"""
Reusable list query helpers: search, filter, sort, paginate.
All functions take a SQLAlchemy query and return a modified query — they compose.
"""

import json
import uuid
from typing import Any

from sqlalchemy import String, and_, exists, func, or_
from sqlalchemy.orm import Query


def apply_search(query: Query, search_term: str | None, columns: list) -> Query:
    """
    Apply ILIKE search across multiple columns (OR).

    columns: list of SQLAlchemy column expressions
        e.g. [Entity.name, Entity.case_number]
    """
    if not search_term or not search_term.strip():
        return query

    term = f"%{search_term.strip()}%"
    conditions = [col.ilike(term) for col in columns]
    return query.filter(or_(*conditions))


def apply_sort(
    query: Query,
    sort_by: str | None,
    sort_order: str,
    sort_config: dict[str, Any],
    default_sort: Any,
) -> Query:
    """
    Apply sorting based on sort_config mapping.

    sort_config: maps allowed sort keys to SQLAlchemy column expressions
        e.g. {"name": Entity.name, "created_at": Entity.created_at}
    default_sort: fallback order_by clause (e.g. Entity.created_at.desc())
    """
    if sort_by and sort_by in sort_config:
        col = sort_config[sort_by]
        order = col.desc() if sort_order == "desc" else col.asc()
        return query.order_by(order)

    return query.order_by(default_sort)


def apply_filters(
    query: Query,
    filters_json: str | None,
    filter_config: dict[str, dict],
    model: Any = None,
) -> Query:
    """
    Apply filters to query based on a JSON-encoded filter string and config.

    filters_json: JSON string e.g. '{"entity_type_id": "uuid-1", "dim:location": ["uuid-a"]}'
    filter_config: maps filter keys to their type and column/behavior
        {
            "entity_type_id": {"type": "exact", "column": Entity.entity_type_id},
            "dim:<dimension_id>": {"type": "dimension", "dimension_id": "<uuid>"},
            "meta:<key>": {"type": "meta_select", "meta_key": "<key>", "model": Entity},
            "created_at": {"type": "date_range", "column": Entity.created_at},
        }

    For dimension filters, the caller must provide the EntityDimension (or equivalent)
    model class in the config via "assoc_model" and "assoc_fk" keys.
    """
    if not filters_json:
        return query

    try:
        filters = json.loads(filters_json)
    except (json.JSONDecodeError, TypeError):
        return query

    if not isinstance(filters, dict):
        return query

    for key, value in filters.items():
        if value is None or value == "" or value == []:
            continue

        config = filter_config.get(key)
        if not config:
            continue

        filter_type = config["type"]

        if filter_type == "exact":
            col = config["column"]
            if isinstance(value, list):
                parsed = [uuid.UUID(v) if _is_uuid(v) else v for v in value]
                query = query.filter(col.in_(parsed))
            else:
                parsed_val = uuid.UUID(value) if _is_uuid(value) else value
                query = query.filter(col == parsed_val)

        elif filter_type == "dimension":
            # Filter by dimension value IDs through association table
            assoc_fk = config["assoc_fk"]  # e.g. EntityDimension.entity_id
            assoc_dv = config["assoc_dv"]  # e.g. EntityDimension.dimension_value_id
            parent_pk = config["parent_pk"]  # e.g. Entity.id
            dv_ids = [uuid.UUID(v) for v in (value if isinstance(value, list) else [value])]
            query = query.filter(
                exists()
                .where(assoc_fk == parent_pk)
                .where(assoc_dv.in_(dv_ids))
            )

        elif filter_type == "meta_select":
            # JSONB exact match: meta->>'key' IN (values)
            meta_key = config["meta_key"]
            meta_col = config["meta_column"]  # e.g. Entity.meta
            values = value if isinstance(value, list) else [value]
            query = query.filter(meta_col[meta_key].astext.in_(values))

        elif filter_type == "meta_range":
            # JSONB numeric range: meta->>'key' BETWEEN min AND max
            meta_key = config["meta_key"]
            meta_col = config["meta_column"]
            cast_col = meta_col[meta_key].astext.cast(String)
            if isinstance(value, dict):
                if "min" in value and value["min"] is not None:
                    query = query.filter(
                        func.cast(meta_col[meta_key].astext, String) >= str(value["min"])
                    )
                if "max" in value and value["max"] is not None:
                    query = query.filter(
                        func.cast(meta_col[meta_key].astext, String) <= str(value["max"])
                    )

        elif filter_type == "date_range":
            col = config["column"]
            if isinstance(value, dict):
                if "start" in value and value["start"]:
                    query = query.filter(col >= value["start"])
                if "end" in value and value["end"]:
                    query = query.filter(col <= value["end"])

        elif filter_type == "boolean":
            meta_key = config.get("meta_key")
            if meta_key:
                meta_col = config["meta_column"]
                query = query.filter(
                    meta_col[meta_key].astext == str(value).lower()
                )
            else:
                col = config["column"]
                query = query.filter(col == value)

    return query


def paginate(query: Query, page: int, limit: int) -> tuple[list, int]:
    """
    Apply pagination. Returns (items, total_count).
    Uses two queries: count then slice.
    """
    total = query.count()
    safe_page = max(page, 1)
    skip = (safe_page - 1) * limit
    items = query.offset(skip).limit(limit).all()
    return items, total


def _is_uuid(value: str) -> bool:
    """Check if a string looks like a UUID."""
    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, AttributeError):
        return False
