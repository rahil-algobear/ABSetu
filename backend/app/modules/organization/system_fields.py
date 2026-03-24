"""
System field registry.

System fields are stored in the JSONB ``meta`` column alongside custom
fields, but are defined here in code so they cannot be deleted by orgs.
They are merged at read-time with any per-org overrides stored in
meta_field_schemas.

Orgs can customise label, required, display_type, stage, visible —
but cannot change key, type, or delete system fields.
"""

# Each entry is a FieldDefinition dict with system=True.
# The key names match the keys stored in the meta JSONB column.

SYSTEM_FIELDS: dict[str, list[dict]] = {
    "entity": [
        {
            "key": "name",
            "label": "Name",
            "type": "text",
            "system": True,
            "required": True,
            "display_type": "input",
            "stage": "both",
            "visible": True,
        },
        {
            "key": "case_number",
            "label": "Case Number",
            "type": "text",
            "system": True,
            "required": False,
            "display_type": "input",
            "stage": "create",
            "visible": True,
        },
    ],
    "enrollment": [
        {
            "key": "admission_date",
            "label": "Admission Date",
            "type": "date",
            "system": True,
            "required": True,
            "display_type": "date",
            "stage": "both",
            "visible": True,
        },
        {
            "key": "release_date",
            "label": "Release Date",
            "type": "date",
            "system": True,
            "required": False,
            "display_type": "date",
            "stage": "both",
            "visible": True,
        },
    ],
    "activity": [
        {
            "key": "title",
            "label": "Title",
            "type": "text",
            "system": True,
            "required": False,
            "display_type": "input",
            "stage": "create",
            "visible": True,
        },
        {
            "key": "start_date",
            "label": "Start Date",
            "type": "datetime",
            "system": True,
            "required": True,
            "display_type": "datetime",
            "stage": "create",
            "visible": True,
        },
        {
            "key": "end_date",
            "label": "End Date",
            "type": "datetime",
            "system": True,
            "required": False,
            "display_type": "datetime",
            "stage": "create",
            "visible": True,
        },
        {
            "key": "notes",
            "label": "Notes",
            "type": "text",
            "system": True,
            "required": False,
            "display_type": "textarea",
            "stage": "record",
            "visible": True,
        },
    ],
}

# Immutable properties that orgs cannot override for system fields.
SYSTEM_FIELD_IMMUTABLE_PROPS = {"key", "system"}

# Overridable properties that orgs can customise.
SYSTEM_FIELD_OVERRIDABLE_PROPS = {
    "label",
    "type",
    "required",
    "display_type",
    "stage",
    "visible",
    "options",
}


def get_system_fields(scope_type: str) -> list[dict]:
    """Return a copy of system field definitions for a scope type."""
    return [dict(f) for f in SYSTEM_FIELDS.get(scope_type, [])]


def merge_system_fields(scope_type: str, db_fields: list[dict]) -> list[dict]:
    """Merge system field defaults with DB-stored fields.

    If system fields are present in db_fields, their order is preserved.
    Any system fields missing from db_fields are prepended at the start.
    """
    system_defaults = get_system_fields(scope_type)
    if not system_defaults:
        return db_fields

    system_by_key = {f["key"]: f for f in system_defaults}
    seen_system_keys: set[str] = set()

    # Walk db_fields in order, merging system defaults where needed
    result = []
    for f in db_fields:
        if f.get("system") and f["key"] in system_by_key:
            seen_system_keys.add(f["key"])
            merged = dict(system_by_key[f["key"]])
            for prop in SYSTEM_FIELD_OVERRIDABLE_PROPS:
                if prop in f:
                    merged[prop] = f[prop]
            result.append(merged)
        else:
            result.append(f)

    # Prepend any system fields not present in db_fields
    missing = []
    for default in system_defaults:
        if default["key"] not in seen_system_keys:
            missing.append(dict(default))

    return missing + result
