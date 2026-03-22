"""
Serialize meta JSONB values for API responses.

Converts datetime meta values to Unix timestamps using the meta field
definitions to know which keys are datetime type.

Convention:
- date fields ("2026-03-22") → kept as-is (no timezone shifting)
- datetime fields ("2026-03-22T17:15:00") → Unix timestamp (float)
"""

from datetime import datetime, timezone
from typing import Any


def serialize_meta(
    meta: dict[str, Any] | None,
    field_types: dict[str, str] | None = None,
) -> dict[str, Any] | None:
    """Process meta dict, converting datetime values to timestamps.

    Args:
        meta: Raw meta dict from the database.
        field_types: Mapping of field key → field type (e.g. {"date_of_admission": "datetime"}).
                     Only keys with type "datetime" are converted.
    """
    if not meta or not field_types:
        return meta

    result = {}
    for key, val in meta.items():
        if field_types.get(key) == "datetime" and isinstance(val, str) and val:
            try:
                dt = datetime.fromisoformat(val)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                result[key] = dt.timestamp()
            except (ValueError, OverflowError):
                result[key] = val
        else:
            result[key] = val

    return result


def build_meta_field_type_map(
    db: "Session",  # noqa: F821
    org_id: "uuid.UUID",  # noqa: F821
    scopes: list[dict],
) -> dict[str, str]:
    """Build a {field_key: field_type} map from meta field definitions.

    Args:
        db: Database session.
        org_id: Organization ID.
        scopes: List of scope dicts (same format as MetaFieldScope).

    Returns:
        Dict mapping field key to type (e.g. {"date_of_admission": "datetime"}).
    """
    import uuid

    from sqlalchemy.orm import Session

    from app.modules.organization.service import MetaFieldSchemaService

    meta_service = MetaFieldSchemaService(db)
    type_map: dict[str, str] = {}

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
            key = field["key"]
            if key not in type_map:
                type_map[key] = field.get("type", "text")

    return type_map
