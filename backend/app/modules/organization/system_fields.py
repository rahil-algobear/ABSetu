"""
System field registry.

System fields are backed by real database columns (e.g. Activity.title,
Entity.name) but are configured identically to custom meta fields in the
admin UI.  They are defined here in code and merged at read-time with any
per-org overrides stored in meta_field_schemas.

Orgs can customise label, required, display_type, stage, visible —
but cannot change key, type, or delete system fields.
"""

# Each entry is a FieldDefinition dict with system=True.
# The key names match the actual DB column names.

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
SYSTEM_FIELD_IMMUTABLE_PROPS = {"key", "type", "system"}

# Overridable properties that orgs can customise.
SYSTEM_FIELD_OVERRIDABLE_PROPS = {
    "label", "required", "display_type", "stage", "visible", "options",
}


def get_system_fields(scope_type: str) -> list[dict]:
    """Return a copy of system field definitions for a scope type."""
    return [dict(f) for f in SYSTEM_FIELDS.get(scope_type, [])]


def merge_system_fields(scope_type: str, db_fields: list[dict]) -> list[dict]:
    """Merge system field defaults with DB-stored fields.

    System fields appear first, with any matching DB overrides applied.
    Custom (non-system) fields follow in their original order.
    """
    system_defaults = get_system_fields(scope_type)
    if not system_defaults:
        return db_fields

    # Build lookup of DB overrides for system fields
    db_system_overrides = {}
    custom_fields = []
    for f in db_fields:
        if f.get("system"):
            db_system_overrides[f["key"]] = f
        else:
            custom_fields.append(f)

    # Merge: start with system defaults, apply overrides
    merged_system = []
    for default in system_defaults:
        override = db_system_overrides.get(default["key"], {})
        merged = dict(default)
        for prop in SYSTEM_FIELD_OVERRIDABLE_PROPS:
            if prop in override:
                merged[prop] = override[prop]
        merged_system.append(merged)

    return merged_system + custom_fields
