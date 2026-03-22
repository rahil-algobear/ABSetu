"""
Serialize meta JSONB values for API responses.

Converts date/datetime strings stored in meta to the standard API format:
- date-only strings ("2026-03-22") → kept as-is (no timezone shifting)
- datetime strings ("2026-03-22T17:15:00") → Unix timestamp (float)
"""

import re
from datetime import datetime, timezone
from typing import Any

# ISO date: 2026-03-22
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# ISO datetime: 2026-03-22T17:15:00, with optional timezone
_DATETIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}")


def serialize_meta(meta: dict[str, Any] | None) -> dict[str, Any] | None:
    """Process meta dict, converting datetime strings to timestamps.

    Date-only values are kept as strings to avoid timezone day-shifting.
    Datetime values are converted to Unix timestamps for consistency
    with created_at/updated_at.
    """
    if not meta:
        return meta

    result = {}
    for key, val in meta.items():
        if isinstance(val, str) and _DATETIME_RE.match(val) and not _DATE_RE.match(val):
            try:
                dt = datetime.fromisoformat(val)
                # If naive (no timezone), assume UTC
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                result[key] = dt.timestamp()
            except (ValueError, OverflowError):
                result[key] = val
        else:
            result[key] = val

    return result
