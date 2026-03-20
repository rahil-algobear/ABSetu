# Plan: Simplify MetaFieldSchema — Typed FK Columns

## Goal
Replace `scope_key` (string) with typed FK columns + `scope_type` enum. The service layer abstracts the DB format — frontend and other backend consumers keep using structured `MetaFieldScope` objects and `{scope_key: fields}` dicts.

## Current State
- `meta_field_schemas` table has: `organization_id`, `scope_key` (string), `fields` (JSONB)
- `scope_key` encodes scope as colon-separated strings like `"entity:{uuid}"`, `"activity:activity_type:{uuid}:dimension_value:{uuid}"`
- Routes build/parse scope_key strings with ~200 lines of validation code
- Consumers (activity/routes.py, entity/routes.py) use `get_all_schemas()` which returns `{scope_key: fields}`
- Frontend sends `MetaFieldScope` objects; receives `{scope_key: fields}` dicts

## New DB Schema

```python
class MetaFieldSchema(BaseModel):
    __tablename__ = "meta_field_schemas"

    organization_id    = Column(UUID, FK("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    scope_type         = Column(String, nullable=False)  # "entity", "dimension", "enrollment", "activity", "participant"
    entity_type_id     = Column(UUID, FK("entity_types.id", ondelete="CASCADE"), nullable=True)
    activity_type_id   = Column(UUID, FK("activity_types.id", ondelete="CASCADE"), nullable=True)
    dimension_id       = Column(UUID, FK("dimensions.id", ondelete="CASCADE"), nullable=True)
    dimension_value_id = Column(UUID, FK("dimension_values.id", ondelete="CASCADE"), nullable=True)
    fields             = Column(JSONB, nullable=False, default=list)

    # CHECK constraints prevent invalid combos
    # Unique constraint on (org_id, scope_type, coalesce(entity_type_id), coalesce(activity_type_id), coalesce(dimension_id), coalesce(dimension_value_id))
```

### Valid scope_type + FK combinations

| scope_type    | entity_type_id | activity_type_id | dimension_id | dimension_value_id |
|---------------|----------------|------------------|--------------|--------------------|
| entity        | required       | —                | —            | —                  |
| dimension     | —              | —                | required     | —                  |
| enrollment    | —              | —                | —            | —                  |
| activity      | —              | optional         | —            | optional           |
| participant   | required*      | optional         | —            | optional           |

*participant entity_type_id can be a special sentinel UUID for "user" type

### Sentinel for "user" participant type
Instead of magic string "user" in scope_key, use a well-known sentinel UUID constant (`USER_PARTICIPANT_SENTINEL = UUID("00000000-0000-0000-0000-000000000000")`). The service layer translates "user" ↔ sentinel transparently.

## Changes

### Step 1: Model (`backend/app/modules/organization/model.py`)
- Remove `scope_key` column
- Add `scope_type`, `entity_type_id`, `activity_type_id`, `dimension_id`, `dimension_value_id` columns with FKs
- Add CHECK constraint ensuring correct FK combos per scope_type
- Add unique constraint on (org_id, scope_type, entity_type_id, activity_type_id, dimension_id, dimension_value_id) using COALESCE for null-safe uniqueness
- Add relationships to EntityType, ActivityType, Dimension, DimensionValue

### Step 2: Service (`backend/app/modules/organization/service.py`)
The service is the **only** interface to the DB. It handles all translation.

Key methods (public API signatures unchanged for backward compat):

- `get_schema(org_id, scope_key: str) -> list[dict]` — parses scope_key → FK query
- `get_all_schemas(org_id) -> dict[str, list[dict]]` — returns {scope_key: fields}, consumers see no change
- `update_schema(org_id, scope_key: str, fields) -> list[dict]` — parses scope_key → FK columns for storage

New structured versions:
- `get_schema_by_scope(org_id, scope: MetaFieldScope) -> list[dict]` — direct query, no string parsing
- `update_schema_by_scope(org_id, scope: MetaFieldScope, fields) -> list[dict]` — direct write, no string building

Internal helpers:
- `_parse_scope_key(scope_key: str) -> dict` — parse scope_key string → {scope_type, entity_type_id, ...}
- `_row_to_scope_key(row) -> str` — build scope_key string from row FK columns
- `_scope_to_filters(scope: MetaFieldScope) -> dict` — MetaFieldScope → query filter dict

### Step 3: Routes (`backend/app/modules/organization/routes.py`)
- **Delete** `_validate_entity_type()` entirely (~130 lines) — FK constraints handle validation
- **Simplify** `_resolve_scope_key()` → just validate scope_type is known + required fields present, then call service directly with MetaFieldScope
- Route handlers become thin wrappers

### Step 4: Migration
Create migration that:
1. Adds new columns (scope_type, entity_type_id, activity_type_id, dimension_id, dimension_value_id)
2. Parses existing scope_key values and populates new columns (handle "user" → sentinel)
3. Adds CHECK constraint and unique constraint
4. Drops scope_key column and old unique constraint

### Step 5: Seed file (`backend/app/seeds/kshamata.py`)
- Update to use new columns directly instead of scope_key strings

### Step 6: Frontend — NO changes needed
- Frontend sends `MetaFieldScope` objects (unchanged)
- Frontend receives `{scope_key: fields}` dicts (unchanged — service builds these)
- scope_key strings are opaque to the frontend; it only uses them as dict keys

## Files Changed
1. `backend/app/modules/organization/model.py` — new columns, constraints
2. `backend/app/modules/organization/service.py` — translation logic (the core of this change)
3. `backend/app/modules/organization/routes.py` — massive simplification
4. `backend/app/modules/organization/schemas.py` — no change (MetaFieldScope stays as-is)
5. `backend/migrations/versions/...` — data migration
6. `backend/app/seeds/kshamata.py` — use new columns
7. `backend/app/modules/activity/routes.py` — **no change** (uses get_all_schemas which still returns scope_key dict)
8. `backend/app/modules/entity/routes.py` — **no change** (uses get_schema)
9. Frontend — **no change**

## What this buys us
- **FK cascade deletes:** Delete an entity type → its meta schemas auto-delete
- **Referential integrity:** Can't create a meta schema pointing to a nonexistent activity type
- **~130 lines of validation code deleted** from routes.py
- **Service encapsulates DB format:** Everything else speaks scope_key strings or MetaFieldScope objects
- **Clean JOINs** possible for future queries ("which entity types have meta schemas?")
