"""
Reusable list query helpers: search, filter, sort, paginate.
All functions take a SQLAlchemy query and return a modified query — they compose.
"""

import json
import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import String, exists, func, or_
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


def parse_filters(
    filters_json: str | None,
    filter_config: dict[str, dict],
) -> list[dict]:
    """
    Parse and validate a raw filters JSON string against the filter config.

    Returns a list of validated filter dicts, each with:
        - key: the filter key
        - type: filter type (exact, dimension, date_range, etc.)
        - config: the matching filter_config entry
        - value: the coerced/validated value (bad values are silently dropped)

    This is the single entry point for filter parsing — validates types, coerces
    UUIDs and dates, and rejects garbage before it reaches the database.
    """
    if not filters_json:
        return []

    try:
        raw = json.loads(filters_json)
    except (json.JSONDecodeError, TypeError):
        return []

    if not isinstance(raw, dict):
        return []

    parsed: list[dict] = []

    for key, value in raw.items():
        if value is None or value == "" or value == []:
            continue

        config = filter_config.get(key)
        if not config:
            continue

        filter_type = config["type"]

        if filter_type == "exact":
            if isinstance(value, list):
                coerced = [uuid.UUID(v) if _is_uuid(v) else v for v in value]
            else:
                coerced = uuid.UUID(value) if _is_uuid(value) else value
            parsed.append({"key": key, "type": filter_type, "config": config, "value": coerced})

        elif filter_type == "dimension":
            raw_ids = value if isinstance(value, list) else [value]
            try:
                coerced = [uuid.UUID(v) for v in raw_ids]
            except (ValueError, AttributeError):
                continue
            parsed.append({"key": key, "type": filter_type, "config": config, "value": coerced})

        elif filter_type == "meta_select":
            coerced = value if isinstance(value, list) else [value]
            parsed.append({"key": key, "type": filter_type, "config": config, "value": coerced})

        elif filter_type == "meta_range":
            if not isinstance(value, dict):
                continue
            coerced = {}
            if "min" in value and value["min"] is not None:
                coerced["min"] = value["min"]
            if "max" in value and value["max"] is not None:
                coerced["max"] = value["max"]
            if coerced:
                parsed.append({"key": key, "type": filter_type, "config": config, "value": coerced})

        elif filter_type == "date_range":
            if not isinstance(value, dict):
                continue
            coerced = {}
            start = _parse_date(value.get("start"))
            end = _parse_date(value.get("end"))
            if start:
                coerced["start"] = start
            if end:
                coerced["end"] = end
            if coerced:
                parsed.append({"key": key, "type": filter_type, "config": config, "value": coerced})

        elif filter_type == "boolean":
            parsed.append({"key": key, "type": filter_type, "config": config, "value": value})

    return parsed


def apply_filters(
    query: Query,
    filters_json: str | None,
    filter_config: dict[str, dict],
    model: Any = None,
) -> Query:
    """
    Parse filters JSON and apply them to a SQLAlchemy query.

    Delegates to parse_filters() for validation/coercion, then applies
    each validated filter to the query.
    """
    parsed = parse_filters(filters_json, filter_config)

    for f in parsed:
        config = f["config"]
        value = f["value"]
        filter_type = f["type"]

        if filter_type == "exact":
            col = config["column"]
            if isinstance(value, list):
                query = query.filter(col.in_(value))
            else:
                query = query.filter(col == value)

        elif filter_type == "dimension":
            assoc_fk = config["assoc_fk"]
            assoc_dv = config["assoc_dv"]
            parent_pk = config["parent_pk"]
            query = query.filter(
                exists()
                .where(assoc_fk == parent_pk)
                .where(assoc_dv.in_(value))
            )

        elif filter_type == "meta_select":
            meta_col = config["meta_column"]
            query = query.filter(meta_col[config["meta_key"]].astext.in_(value))

        elif filter_type == "meta_range":
            meta_col = config["meta_column"]
            meta_key = config["meta_key"]
            if "min" in value:
                query = query.filter(
                    func.cast(meta_col[meta_key].astext, String) >= str(value["min"])
                )
            if "max" in value:
                query = query.filter(
                    func.cast(meta_col[meta_key].astext, String) <= str(value["max"])
                )

        elif filter_type == "date_range":
            col = config["column"]
            if "start" in value:
                query = query.filter(col >= value["start"])
            if "end" in value:
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


def _parse_date(value: Any) -> date | None:
    """Parse a date string, returning None for missing or invalid values."""
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None


def _is_uuid(value: str) -> bool:
    """Check if a string looks like a UUID."""
    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, AttributeError):
        return False
