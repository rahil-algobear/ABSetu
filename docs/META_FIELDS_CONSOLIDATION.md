# Meta Fields Consolidation

## Current State

Three separate admin systems for field configuration:

### 1. Meta Fields Admin (`/admin/meta-fields`)
Defines custom fields stored in `meta_field_schemas.fields` JSONB:
- `key`, `label`, `type`, `options`, `required`, `default`
- Scoped by: entity_type, activity_type, dimension, participant, enrollment
- Backend: `list[dict[str, Any]]` — no typed Pydantic validation

### 2. Form Builder (`/admin/form-builder`)
Controls activity form layout:
- Which elements appear, sort order, display type (dropdown/radio/checklist), visibility, required, stage (create vs record)
- Manages built-in "default" elements (title, start_date, end_date, notes)
- Manages structural elements (dimensions, entity type participant lists)
- **Problem:** `required` is configured here AND in meta fields — duplicate source of truth

### 3. List Settings (`/admin/list-settings`)
Controls list view columns:
- `visible`, `filterable`, `sortable`, `sort_order`
- View-layer concern, correctly separated

---

## Target Architecture

### 1. Enhanced Meta Fields Admin (field-level config)

A single admin page where you configure everything *about* a field — definition, validation, form presentation, and reporting. This applies equally to **system fields** (backed by real DB columns) and **custom meta fields** (backed by JSONB).

#### MetaFieldDefinition Model

```python
class ReportConfig(BaseModel):
    aggregations: list[str] | None = None   # e.g. ["count", "avg", "sum", "range", "timeline"]
    chart_types: list[str] | None = None    # e.g. ["bar", "pie", "timeline"]
    group_by: bool = False

class MetaFieldDefinition(BaseModel):
    key: str
    label: str
    type: Literal["text", "number", "date", "datetime", "select", "multiselect", "boolean"]
    system: bool = False  # True for title, name, start_date, etc.

    # Options (for select/multiselect)
    options: list[str] | None = None
    default: str | number | bool | list[str] | None = None

    # Validation
    required: bool = False
    validators: dict[str, Any] | None = None  # {"min": 0, "max": 100, "pattern": "^[A-Z]"}

    # Form presentation (how the field renders, NOT where)
    display_type: Literal["input", "dropdown", "radio", "checklist", "textarea"] | None = None
    stage: Literal["create", "record", "both"] = "both"
    visible: bool = True

    # Reporting
    reportable: bool = False
    report_config: ReportConfig | None = None
```

**Key points:**
- `sort_order` is NOT on this model — ordering relative to structural elements is a layout concern owned by the form builder
- `system: True` fields have immutable `key` and `type`; admins can configure `label`, `required`, `validators`, `display_type`, `reportable`
- System fields cannot be deleted
- Replaces the "Phase 4 field overrides" concept entirely

#### System Fields

These are backed by real database columns for performance but configured identically to custom meta fields in the admin UI.

**Entity system fields:**
| Key | Type | Column |
|-----|------|--------|
| `name` | text | `Entity.name` |
| `code` | text | `Entity.code` |

**Activity system fields:**
| Key | Type | Column |
|-----|------|--------|
| `title` | text | `Activity.title` |
| `start_date` | datetime | `Activity.start_date` |
| `end_date` | datetime | `Activity.end_date` |
| `notes` | text | `Activity.notes` |

#### System Field Mapping Layer

The backend maps system field keys to real columns and meta field keys to JSONB paths. The frontend and admin UI never need to know the difference.

```python
SYSTEM_FIELD_MAP = {
    "activity": {
        "title": Activity.title,
        "start_date": Activity.start_date,
        "end_date": Activity.end_date,
        "notes": Activity.notes,
    },
    "entity": {
        "name": Entity.name,
        "code": Entity.code,
    },
}

def resolve_field(scope_type: str, key: str, model):
    """Returns either a column reference or a JSONB path."""
    col = SYSTEM_FIELD_MAP.get(scope_type, {}).get(key)
    return col if col is not None else model.meta[key]
```

---

### 2. Simplified Form Builder (structural composition only)

The form builder shrinks to a **layout sequencer** — a drag-and-drop ordering UI that arranges references to fields and structural elements. No field-level configuration lives here.

#### FormElement Model

```python
class FormElement(BaseModel):
    type: Literal["field", "dimension", "participant_list"]
    ref_key: str | None = None          # for type="field" → meta field key or system field key
    dimension_id: str | None = None     # for type="dimension"
    entity_type_id: str | None = None   # for type="participant_list"
    display_type: str | None = None     # only for dimensions/participant_lists (layout concern)
    sort_order: int
```

#### Example Form Layout

```json
[
  { "type": "field", "ref_key": "start_date", "sort_order": 1 },
  { "type": "dimension", "dimension_id": "uuid-programme", "display_type": "dropdown", "sort_order": 2 },
  { "type": "dimension", "dimension_id": "uuid-center", "display_type": "dropdown", "sort_order": 3 },
  { "type": "field", "ref_key": "title", "sort_order": 4 },
  { "type": "field", "ref_key": "custom_field_1", "sort_order": 5 },
  { "type": "participant_list", "entity_type_id": "uuid-student", "sort_order": 6 }
]
```

This allows interleaving fields with structural elements (dimensions, participant lists) in any order — something a `sort_order` on `MetaFieldDefinition` alone cannot achieve.

#### What the form builder controls vs what it doesn't

| Concern | Form Builder | Meta Fields Admin |
|---------|-------------|-------------------|
| Which fields appear on the form | No (use `visible` + `stage` on the field) | Yes |
| Order of fields relative to dimensions | Yes | No |
| Which dimensions appear | Yes | No |
| Dimension display type (dropdown/radio) | Yes (layout concern) | No |
| Which participant lists appear | Yes | No |
| Field display type (input/radio/dropdown) | No | Yes |
| Field required/validators | No | Yes |
| Field label | No | Yes |
| Field reportable | No | Yes |

---

### 3. List Settings (unchanged)

Stays as-is. It's a view-layer concern (which columns to show in list views) and is correctly separated.

---

## Key Architectural Decisions

### Decision 1: System fields stay as real DB columns

**Decision:** Keep `title`, `start_date`, `end_date`, `notes`, `name`, `code` as dedicated database columns. Do NOT move them to JSONB.

**Rationale:**
- **Performance:** `start_date` is used in virtually every activity query — range filters, sorting, calendar views, dashboard aggregations. A B-tree index gives `O(log n)` lookups. JSONB extraction (`meta->>'start_date'`) can't use standard indexes and range queries on extracted values are slower even with expression indexes.
- **Type safety at DB level:** `start_date` is `TIMESTAMP WITH TIME ZONE` — Postgres enforces this. In JSONB it's a string relying on application-level validation.
- **Referential integrity:** `code` has uniqueness constraints per org. Trivial with a real column + partial unique index. Fragile with JSONB functional indexes.
- **Mapping layer is simple:** A small dict mapping system field keys to column references. The admin UI treats all fields identically.

**Precedent:** Shopify uses this exact pattern — `title`, `price`, `vendor` are columns; everything else is metafields. The API presents them uniformly.

### Decision 2: Keep JSONB on main tables, no separate meta tables

**Decision:** Keep `meta` JSONB columns on `Entity`, `Activity`, `ActivityParticipant`, `Enrollment` tables. Do NOT create separate `entities_meta` / `activities_meta` tables.

#### EAV alternative considered

An EAV (Entity-Attribute-Value) approach with separate tables was evaluated:

```sql
-- EAV schema (rejected)
CREATE TABLE entities_meta (
    id UUID PRIMARY KEY,
    entity_id UUID REFERENCES entities(id),
    field_key TEXT NOT NULL,
    value_text TEXT,
    value_numeric NUMERIC,
    value_date TIMESTAMPTZ,
    value_bool BOOLEAN
);
```

**What EAV would improve:**
- Native typed columns — `value_numeric >= 18` works without casting
- Standard B-tree indexes on typed value columns work out of the box
- Aggregation syntax is slightly simpler: `SELECT field_key, AVG(value_numeric) GROUP BY field_key`

**Why EAV was rejected — list view cost is too high:**

List views are the dominant access pattern (every page load). With EAV and N displayed meta fields, every list query needs either:

- **N LEFT JOINs** (one per displayed field) — with 8 meta fields that's 8 extra JOINs on top of the existing 2 scalar subqueries + M dimension EXISTS clauses
- **A pivot subquery** — `jsonb_object_agg(field_key, value)` reassembles the data back into JSON, negating the whole point

Current entity list queries already have: `1 base query + 2 scalar subqueries + N dimension EXISTS clauses`. Adding 8 LEFT JOINs would make this significantly worse.

**Infrastructure rewrite cost:** The entire filter/sort infrastructure would need rewriting:
- `filter_definitions.py` — `build_meta_field_filter_config()`, `build_meta_field_sort_config()`
- `list_query.py` — all meta_select, meta_range, meta_date_range handlers
- `meta_normalize.py` — normalization logic
- Entity, Activity, Enrollment services — all list queries

#### Rationale for JSONB

- **Read performance:** Single query, no JOIN. Every list view and detail page reads meta — it's not a rare access pattern.
- **Write performance:** Single UPDATE vs N upserts.
- **Existing infrastructure:** Filter/sort infrastructure in `filter_definitions.py` and `list_query.py` already works with JSONB paths.
- **Scale fit:** Meta payloads are typically 200-500 bytes (a handful of fields). No TOAST overhead concern.
- **Reporting works fine:** JSONB aggregation queries are straightforward with proper casting (see below).

**When separate tables would make sense (none apply here):**
- Meta payloads regularly exceed 8KB
- Meta is rarely read (not the case — rendered on every view)
- Row-level audit trails needed on individual field changes
- Need to query across field keys dynamically ("find all entities where *any* field contains X")

#### Required: Index strategy

**Current state: No indexes exist on any meta columns.** This must be fixed.

**GIN indexes** for containment queries (`@>` operator):
```sql
CREATE INDEX ix_entities_meta_gin ON entities USING GIN (meta jsonb_path_ops);
CREATE INDEX ix_activities_meta_gin ON activities USING GIN (meta jsonb_path_ops);
CREATE INDEX ix_activity_participants_meta_gin ON activity_participants USING GIN (meta jsonb_path_ops);
CREATE INDEX ix_enrollments_meta_gin ON enrollments USING GIN (meta jsonb_path_ops);
```

**Expression indexes** for frequently filtered/sorted fields (added per-org as needed):
```sql
-- Text field used in filters
CREATE INDEX ix_entities_meta_status ON entities ((meta->>'status'));

-- Numeric field used in range filters or sorting
CREATE INDEX ix_entities_meta_age ON entities ((CAST(meta->>'age' AS NUMERIC)));

-- Date field used in range filters
CREATE INDEX ix_activities_meta_followup ON activities ((CAST(meta->>'followup_date' AS TIMESTAMPTZ)));
```

**Dynamic expression index management:** Since each org defines different meta fields, expression indexes should be created/dropped via an admin action or background job when list config marks a field as `filterable` or `sortable`. This avoids index bloat while ensuring performance for active filter fields.

#### Required: Fix numeric casting bug

**Current bug in `list_query.py:213`:** Numeric range filters use string comparison:
```python
# BROKEN — "100" < "20" in string comparison
query.filter(func.cast(meta_col[meta_key].astext, String) >= str(value["min"]))
```

**Fix:** Cast to `Numeric` for range comparisons:
```python
# CORRECT — proper numeric comparison
from sqlalchemy import Numeric
query.filter(func.cast(meta_col[meta_key].astext, Numeric) >= value["min"])
```

#### Reporting with JSONB

JSONB supports all required reporting aggregations with proper casting:

```sql
-- Count by category (select fields)
SELECT meta->>'status' AS status, COUNT(*)
FROM entities
WHERE organization_id = $1 AND entity_type_id = $2
GROUP BY meta->>'status';

-- Numeric aggregation
SELECT AVG(CAST(meta->>'age' AS NUMERIC)),
       MIN(CAST(meta->>'age' AS NUMERIC)),
       MAX(CAST(meta->>'age' AS NUMERIC))
FROM entities
WHERE organization_id = $1;

-- Timeline aggregation (activities over time by meta field value)
SELECT TO_CHAR(start_date, 'YYYY-MM') AS month,
       meta->>'category' AS category,
       COUNT(*)
FROM activities
WHERE organization_id = $1
GROUP BY month, meta->>'category'
ORDER BY month;

-- Cross-tabulation (meta field × dimension)
SELECT dv.name AS programme,
       meta->>'outcome' AS outcome,
       COUNT(*)
FROM entities e
JOIN entity_dimensions ed ON ed.entity_id = e.id
JOIN dimension_values dv ON dv.id = ed.dimension_value_id
WHERE e.organization_id = $1
GROUP BY dv.name, meta->>'outcome';
```

All of these perform well with expression indexes on the relevant `meta->>'field'` paths.

---

## Migration Path

### Phase 1: Type the field definitions
- Replace `list[dict[str, Any]]` with `list[MetaFieldDefinition]` in Pydantic schemas
- Add validation on the backend — reject invalid types, require `options` for select/multiselect
- No DB migration needed (JSONB is schema-flexible)

### Phase 2: Add new properties to MetaFieldDefinition
- Add `validators`, `display_type`, `stage`, `visible`, `reportable`, `report_config`
- Absorb form builder's field-level config (required, display_type, visibility, stage) into meta field definitions
- Migrate existing form builder field config into meta field definitions

### Phase 3: Add system fields to MetaFieldDefinition
- Seed system fields (`title`, `start_date`, `name`, etc.) as `system: True` entries in `meta_field_schemas`
- Build the mapping layer (`resolve_field`) in the service
- Update admin UI to show system fields as non-deletable, type-immutable entries

### Phase 4: Simplify form builder
- Strip field-level config from form builder elements
- Reduce form builder to layout sequencer (ordered list of references)
- Update form builder UI to drag-and-drop interface
- Migrate existing form builder element data to new simplified format

### Phase 5: Reporting integration
- Implement reporting aggregation queries using `reportable` and `report_config`
- Per `docs/CUSTOM_FIELD_REPORTING.md` spec
