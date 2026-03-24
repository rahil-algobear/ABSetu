"""
System field registry — DEPRECATED.

All fields are now user-defined via meta_field_schemas. There are no
longer any hardcoded system fields. Default fields are created by the
seed script when setting up a new organization.

This module is kept as an empty stub so existing imports don't break.
"""

SYSTEM_FIELDS: dict[str, list[dict]] = {}
SYSTEM_FIELD_IMMUTABLE_PROPS: set[str] = set()
SYSTEM_FIELD_OVERRIDABLE_PROPS: set[str] = set()


def get_system_fields(scope_type: str) -> list[dict]:
    """Return an empty list — no system fields exist anymore."""
    return []


def merge_system_fields(scope_type: str, db_fields: list[dict]) -> list[dict]:
    """Pass-through — no system fields to merge."""
    return db_fields
