"""
Normalize meta field datetime values to UTC before storage.

Meta fields are stored as JSONB strings. Without normalization, datetime
values from different timezones produce different strings for the same
moment, breaking lexicographic sort and filter comparisons.

This module converts timezone-aware ISO datetime strings to UTC so all
values are stored in a consistent, comparable format.
"""

from datetime import datetime, timezone
from typing import Any


def normalize_meta_datetimes(meta: dict[str, Any] | None) -> dict[str, Any] | None:
    """Normalize any ISO datetime strings in a meta dict to UTC.

    Stored without offset for clean lexicographic comparison:
    - "2026-03-22T17:00:00+05:30" → "2026-03-22T11:30:00"
    - "2026-03-22T17:00:00" → "2026-03-22T17:00:00" (naive, unchanged)
    - "2026-03-22" → "2026-03-22" (date-only, unchanged)
    - Non-string values are left untouched.
    """
    if not meta:
        return meta

    result = {}
    for key, value in meta.items():
        if isinstance(value, str) and "T" in value:
            result[key] = _normalize_iso_datetime(value)
        else:
            result[key] = value
    return result


def _normalize_iso_datetime(value: str) -> str:
    """Convert an ISO datetime string to UTC without offset suffix.

    Returns the original string if not parseable.
    """
    try:
        dt = datetime.fromisoformat(value)
        if dt.tzinfo is not None:
            # Convert to UTC, then strip tzinfo for offset-free string
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        # Naive datetimes are left as-is (assumed UTC already)
        return dt.isoformat()
    except (ValueError, TypeError):
        return value
