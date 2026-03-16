# Generic NGO Architecture — Implementation Document

> **Status:** Core architecture implemented. See checkmarks (✅) throughout for completion status.

## Problem

ABSetu currently hardcodes entity types (Center, Programme, SessionTemplate) and their hierarchy (Organization → Centre/Programme → ProgrammeCenter → Session → Attendance). This works for Kshamata but won't work for NGOs with different organizational structures.

Centres and Programmes are not domain objects — they're organizational scaffolding for **access control** and **reporting**. The real domain is: people (Beneficiaries), interactions (Sessions), and who delivered them (Facilitators).

## Solution: Generic Dimensions

Replace hardcoded organizational entities (Center, Programme, ProgrammeCenter) with a generic **Dimensions** system. Keep core domain entities (Session, Beneficiary, Attendance, Facilitator) as concrete tables.

---

## Database Schema

### Tables Removed

| Table | Replaced By |
|-------|-------------|
| `centers` | `dimensions` + `dimension_values` |
| `programmes` | `dimensions` + `dimension_values` |
| `programme_centers` | `tag_rules` |
| `user_center_access` | `user_dimension_access` |
| `user_programme_access` | `user_dimension_access` |
| `user_session_template_access` | `user_dimension_access` |
| `session_templates` | `activity_types` (renamed) |
| `sessions` | `activities` (renamed) |
| `session_facilitators` | `activity_facilitators` (renamed) |
| `attendances` | `participations` (renamed, adds `meta` JSONB) |

### Tables Unchanged

| Table | Notes |
|-------|-------|
| `organizations` | Same. `meta` still stores `meta_field_schemas` |
| `session_templates` → `activity_types` | Renamed. Still a first-class entity |
| `sessions` → `activities` | Renamed + modified — removes `programme_center_id`, adds `organization_id` |
| `attendances` → `participations` | Renamed + modified — adds `meta` JSONB column |
| `facilitators` | Same |
| `session_facilitators` → `activity_facilitators` | Renamed |
| `beneficiaries` | Same |
| `enrollments` | Modified — removes `programme_center_id`, tagged via `enrollment_tags` |
| `users` | Modified — removes access relationships, uses `user_dimension_access` |
| `roles` | Same |
| `permissions` | Modified — simplified permission keys |
| `role_permissions` | Same |
| `otps` | Same |
| `refresh_tokens` | Same |

### New Tables

#### `dimensions` ✅

Org-defined grouping axes. Each org creates the dimensions that match how they work.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK (from BaseModel) |
| `organization_id` | UUID | FK → organizations, NOT NULL |
| `name` | String | Display name, e.g. "Location", "Programme" |
| `key` | String | Machine key, e.g. "location", "programme" |
| `sort_order` | Integer | Display ordering |
| `is_system` | String, nullable | If set, indicates a system-managed dimension (e.g. `"activity_type"`). System dimensions cannot be deleted and their values are synced automatically from their source entity. |
| `created_at` | Timestamp | From BaseModel |
| `updated_at` | Timestamp | From BaseModel |

Unique constraint: `(organization_id, key)`

> **System dimensions:** When `is_system = "activity_type"`, the dimension's values are automatically synced from the `activity_types` table. This allows activity types to participate in tag rules using the same dimension_value ↔ dimension_value mechanism. The seeder creates this dimension and keeps it in sync; the frontend hides system dimensions from the settings dimension tabs.

**Kshamata example:**
| name | key | is_system |
|------|-----|-----------|
| Programme | programme | NULL |
| Project | project | NULL |
| Location | location | NULL |
| Intervention | activity_type | `"activity_type"` |

> **Note:** Dimension `name` is org-specific (e.g. "Intervention" is Kshamata's term for activity types). The frontend vocabulary system (`vDim()`) can override display names without changing the DB value.

---

#### `dimension_values` ✅

Values within a dimension.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `organization_id` | UUID | FK → organizations, NOT NULL |
| `dimension_id` | UUID | FK → dimensions, NOT NULL |
| `name` | String | Display name, e.g. "ShantiSadan" |
| `code` | String | Short code, e.g. "SHANTISADAN" |
| `sort_order` | Integer | Display ordering |
| `meta` | JSONB | Custom fields (scoped per dimension via meta_field_schemas) |
| `created_at` | Timestamp | From BaseModel |
| `updated_at` | Timestamp | From BaseModel |

Unique constraint: `(dimension_id, code)`

**Kshamata example (Location dimension):**
| name | code | meta |
|------|------|------|
| ShantiSadan | SHANTISADAN | `{"address": "Institution"}` |
| Kasturba | KASTURBA | `{"address": "Institution"}` |
| Thane | THANE | `{}` |
| ... | ... | ... |

**Kshamata example (Programme dimension):**
| name | code |
|------|------|
| Kshamata Outreach Programme | OUTREACH |
| Kshamata Transformation Programme | TRANSFORMATION |
| Kshamata Unlimited | UNLIMITED |

**Kshamata example (Project dimension):**
| name | code |
|------|------|
| Institutions | INSTITUTIONS |
| Post Institutions | POST_INSTITUTIONS |
| Community | COMMUNITY |

---

#### `tag_rules` ✅

Defines which dimension values are valid together. Replaces `programme_centers` join table AND the `CENTRE_INTERVENTIONS` mapping.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `organization_id` | UUID | FK → organizations, NOT NULL |
| `dimension_value_id_1` | UUID | FK → dimension_values, NOT NULL |
| `dimension_value_id_2` | UUID | FK → dimension_values, NOT NULL |
| `created_at` | Timestamp | From BaseModel |

Unique constraint: `(dimension_value_id_1, dimension_value_id_2)` — order is normalized (smaller UUID first) to prevent duplicates.

**Kshamata examples:**

Programme ↔ Location rules (replaces `programme_centers`):
| dimension_value_1 | dimension_value_2 |
|--------------------|-------------------|
| Programme:Outreach | Location:ShantiSadan |
| Programme:Outreach | Location:Kasturba |
| Programme:Transformation | Location:Thane |
| Programme:Unlimited | Location:Thane |
| Programme:Unlimited | Location:Mankhurd |

Location ↔ ActivityType rules (replaces `CENTRE_INTERVENTIONS`):
| dimension_value_1 | dimension_value_2 |
|--------------------|-------------------|
| Location:ShantiSadan | ActivityType:Life Skill Education |
| Location:ShantiSadan | ActivityType:Job Readiness |
| Location:ShantiSadan | ActivityType:Vocational Skill Training |
| ... | ... |

> **Note on ActivityType in tag rules:** ActivityType remains a first-class table (`activity_types`), but for tag rule purposes we create a system-managed dimension (with `is_system = "activity_type"`) whose values mirror the `activity_types` table. This lets `tag_rules` work with a single mechanism (dimension_value ↔ dimension_value) without special-casing activity types. The seeder creates this dimension and syncs values automatically. The dimension name is org-specific (e.g. "Intervention" for Kshamata).
>
> **Programme ↔ ActivityType rules:** The seeder uses an explicit `PROGRAMME_ACTIVITY_TYPES` mapping to define which activity types belong to each programme, along with a `_remove_stale_programme_at_rules()` function to clean up rules for programmes that should have no activity types (e.g. Kshamata Unlimited).

---

#### `activity_tags` ✅

Links dimension values to activities. Replaces the `programme_center_id` FK on activities (formerly sessions).

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `activity_id` | UUID | FK → activities, NOT NULL |
| `dimension_value_id` | UUID | FK → dimension_values, NOT NULL |

Unique constraint: `(activity_id, dimension_value_id)`

**Example — a Life Skill Education session at ShantiSadan:**
| activity_id | dimension_value_id |
|-------------|--------------------|
| act-001 | Location:ShantiSadan |
| act-001 | Programme:Outreach |

---

#### `beneficiary_tags` ✅

Links dimension values to beneficiaries for scoping and reporting.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `beneficiary_id` | UUID | FK → beneficiaries, NOT NULL |
| `dimension_value_id` | UUID | FK → dimension_values, NOT NULL |

Unique constraint: `(beneficiary_id, dimension_value_id)`

---

#### `enrollment_tags` ✅

Links dimension values to enrollments. Replaces the `programme_center_id` FK on enrollments.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `enrollment_id` | UUID | FK → enrollments, NOT NULL |
| `dimension_value_id` | UUID | FK → dimension_values, NOT NULL |

Unique constraint: `(enrollment_id, dimension_value_id)`

---

#### `user_dimension_access` ✅

Replaces `user_center_access`, `user_programme_access`, and `user_session_template_access` with a single table.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → users, NOT NULL |
| `dimension_value_id` | UUID | FK → dimension_values, NOT NULL |

Unique constraint: `(user_id, dimension_value_id)`

**Example — field worker scoped to ShantiSadan + Outreach:**
| user_id | dimension_value_id |
|---------|--------------------|
| worker-001 | Location:ShantiSadan |
| worker-001 | Location:Kasturba |
| worker-001 | Programme:Outreach |

**Access logic:** When querying sessions for a user, filter to sessions whose tags are a subset of the user's dimension access. Admin users with no access restrictions see everything.

---

### Modified Tables

#### `activities` (formerly `sessions`, modified)

| Column | Change |
|--------|--------|
| `programme_center_id` | **Removed** |
| `organization_id` | **Added** — FK → organizations (was implicit through programme_center) |
| `session_template_id` | **Renamed** to `activity_type_id` — FK → activity_types |

Tags are now in `activity_tags` instead of being implicit through `programme_center_id`.

#### `enrollments` (modified)

| Column | Change |
|--------|--------|
| `programme_center_id` | **Removed** |
| `organization_id` | **Added** — FK → organizations |

Tags are now in `enrollment_tags`.

---

## Permissions ✅

### Simplified Permission Keys

**Removed:**
- `center:view`, `center:manage`
- `programme:view`, `programme:manage`
- `session_template:view`, `session_template:manage`
- `session:view`, `session:create`

**Added:**
- `dimension:view` — view dimensions and their values
- `dimension:manage` — create/edit/delete dimensions, values, and tag rules
- `activity_type:view` — view activity types (formerly session templates)
- `activity_type:manage` — create/edit/delete activity types
- `activity:view` — view activities (formerly sessions)
- `activity:create` — create activities and record participation

**Unchanged:**
- `org:settings`
- `beneficiary:view`, `beneficiary:create`, `beneficiary:edit`
- `enrollment:view`, `enrollment:manage`
- `facilitator:view`, `facilitator:manage`
- `user:view`, `user:manage`
- `role:view`, `role:manage`
- `reports:view`, `reports:export`

### Two-Layer Auth Model

1. **Action permissions** (Role → Permission keys): "Can this user create sessions?" — same as today
2. **Data scoping** (UserDimensionAccess): "Which sessions can this user see?" — replaces centre/programme assignment

These are independent. A user needs BOTH the right permission AND matching scope to perform an action.

---

## Custom Fields (Meta) Per Dimension ✅

The existing meta field schema system (`Organization.meta['meta_field_schemas']`) extends to support dimension-scoped schemas.

**Today's entity types:**
```
"centre", "programme", "session_template", "facilitator", "beneficiary"
```

**New entity types:**
```
"activity_type", "facilitator", "beneficiary", "enrollment", "activity", "participation",
"dimension:location", "dimension:programme", "dimension:location_type", ...
```

The prefix `dimension:{key}` makes schemas dynamic per-dimension. When an admin creates a "Funder" dimension, they can go to Custom Fields and define fields specific to funder values (e.g., "Grant ID", "Contact Email").

`DynamicMetaForm` component requires **no changes** — it renders from a field definition array regardless of source.

---

## Frontend Changes ✅

### Settings Navigation ✅

**Current tabs:**
```
Centres | Programmes | Programme-Centres | Session Templates | Facilitators | Beneficiaries | Roles | Users | Custom Fields
```

**New tabs (dynamically generated from org dimensions + static entities):**
```
{Dimension 1} | {Dimension 2} | ... | Tag Rules | Activity Types | Facilitators | Beneficiaries | Roles | Users | Custom Fields
```

Each dimension the org has created becomes its own settings tab/page. Tab labels come from the dimension name. For Kshamata this renders as:
```
Locations | Programmes | Tag Rules | Session Templates | Facilitators | Beneficiaries | Roles | Users | Custom Fields
```
> "Locations" because that's what Kshamata named their dimension. "Session Templates" via vocabulary mapping of "Activity Types". Looks nearly identical to today.

For a different NGO with dimensions "Region", "Project", "Funder":
```
Regions | Projects | Funders | Tag Rules | Activity Types | Facilitators | Beneficiaries | Roles | Users | Custom Fields
```

### Dimension Settings Pages (`/admin/dimensions/{dimension_key}`) ✅

Each dimension gets its own page (one route, reused component). Shows a list of that dimension's values with add/edit/delete.

Admin can:
- Add/edit/remove values within the dimension
- Custom fields per dimension render via DynamicMetaForm (fetched from meta_field_schemas using `dimension:{key}`)

> **Note:** Creating new dimensions themselves is currently done via seeder/API only. No admin UI for creating dimensions yet.

### Tag Rules Page (`/admin/tag-rules`) ✅

Matrix view showing valid combinations between two selected dimensions.

```
Dimension: [Location ▼]  ×  Dimension: [Activity Type ▼]

                    Life Skill  Job Ready  Vocational  Digital Lit  ...
ShantiSadan            ✓           ✓          ✓           ✓
Kasturba               ✓           ✓          ✓
...
```

Admin selects two dimensions from dropdowns, then toggles checkboxes in the matrix. Includes a bulk sync mechanism — changes are staged locally and saved in one API call.

### Activity Type Matrix Dialog ✅

A "View Matrix" button (on both Tag Rules and Activity Types pages) opens a near-fullscreen dialog showing the complete dimension hierarchy with activity types as leaf columns.

Features:
- **Drag-and-drop dimension reordering** — chips at the top let admins reorder which dimension is the top-level grouping
- **Hierarchical column headers** — parent dimension values span across their children with `colSpan`
- **Gap handling** — dimensions that don't apply to certain paths show as blank (e.g. Programmes with no Project)
- **Orphan detection** — values connected to ancestors but not to any value at intermediate levels still appear (e.g. Transformation/Unlimited appear even when Project is first in the ordering)
- **Ancestor-aware header merging** — same dimension value under different parent groups renders as separate columns (e.g. "Thane" under Transformation vs Unlimited)

Component: `src/components/ActivityTypeMatrixDialog.tsx`

### Activity Creation Form ✅

Dynamically renders one dropdown per dimension (filtered by user's access scope). Selection cascading via tag rules — choosing a Location filters Programme to valid options, which filters Activity Type to valid options.

```
[Location dropdown]       → filtered by UserDimensionAccess
[Programme dropdown]      → filtered by tag_rules(selected location)
[Activity Type dropdown]  → filtered by tag_rules(selected location)
[Date picker]
[Facilitator dropdown]
[Participation checklist] → beneficiaries filtered by matching tags
                          → each participation row can have meta fields (e.g., amount for donations)
```

**The UI looks identical to today for end users.** The difference is that dropdowns are generic (driven by dimensions) rather than hardcoded. All labels come from the org's vocabulary mapping.

### Activity Types Page ✅

Shows all activity types in a table with:
- **Dimension columns** — each non-system dimension gets a column showing which dimension values the activity type is connected to (via tag rules), displayed as blue pills/badges
- **View Matrix** button — opens the ActivityTypeMatrixDialog

### Custom Fields Page (`/admin/meta-fields`) ✅

Entity type selector dynamically includes dimension-based types:

```
[Session Template] [Facilitator] [Beneficiary] [Location*] [Programme*] [Funder*]
                                                ↑ auto-added from org's dimensions
```

No other changes to this page — DynamicMetaForm handles rendering.

---

## API Changes ✅

### New Endpoints

```
# Dimensions
GET    /api/dimensions                          → list org dimensions
POST   /api/dimensions                          → create dimension
PUT    /api/dimensions/{id}                     → update dimension
DELETE /api/dimensions/{id}                     → delete dimension

# Dimension Values
GET    /api/dimensions/{id}/values              → list values for dimension
POST   /api/dimensions/{id}/values              → create value
PUT    /api/dimensions/{id}/values/{value_id}   → update value
DELETE /api/dimensions/{id}/values/{value_id}   → delete value

# Tag Rules
GET    /api/tag-rules                           → list rules (filterable by dimension pair)
POST   /api/tag-rules                           → create rule
DELETE /api/tag-rules/{id}                      → delete rule
POST   /api/tag-rules/bulk                      → bulk create/delete (for matrix UI)

# User Dimension Access
GET    /api/users/{id}/access                   → list user's dimension access
PUT    /api/users/{id}/access                   → set user's dimension access (replace all)
```

### Modified Endpoints

```
# Activities (formerly Sessions) — replace programme_center_id with tag_ids
POST   /api/activities                          → body includes dimension_value_ids[]
GET    /api/activities                          → filter by dimension_value_ids[]

# Activity Types (formerly Session Templates)
GET    /api/activity-types                      → list activity types
POST   /api/activity-types                      → create activity type
PUT    /api/activity-types/{id}                 → update activity type
DELETE /api/activity-types/{id}                 → delete activity type

# Participations (formerly Attendances) — now supports meta
POST   /api/activities/{id}/participations      → body includes meta per participation

# Enrollments — same pattern
POST   /api/enrollments                         → body includes dimension_value_ids[]

# Meta Field Schemas — accept "dimension:{key}" and "participation" as entity_type
GET    /api/organization/meta-field-schemas/{entity_type}
PUT    /api/organization/meta-field-schemas/{entity_type}
```

### Removed Endpoints

```
/api/centers/*
/api/programmes/*
/api/programme-centers/*
/api/sessions/*                    (replaced by /api/activities/*)
/api/session-templates/*           (replaced by /api/activity-types/*)
```

---

## Backend Module Structure ✅

### Module: `app/modules/dimension/`

```
app/modules/dimension/
├── model.py       # Dimension, DimensionValue, TagRule, ActivityTag, BeneficiaryTag,
│                  #   EnrollmentTag, UserDimensionAccess (all tagging in one module)
├── schemas.py     # Request/response schemas
├── service.py     # DimensionService, DimensionValueService, TagRuleService,
│                  #   UserDimensionAccessService
└── routes.py      # /api/dimensions, /api/tag-rules endpoints
```

> **Note:** The originally planned separate `app/modules/tagging/` module was not created. All tag models (`ActivityTag`, `BeneficiaryTag`, `EnrollmentTag`, `UserDimensionAccess`) live in the dimension module alongside `TagRule` since they're closely related. User access endpoints are in the user module routes.

### Module: `app/modules/activity/`

```
app/modules/activity/
├── model.py       # Activity, ActivityType, Facilitator, ActivityFacilitator, Participation
├── schemas.py
├── service.py
└── routes.py      # /api/activities, /api/activity-types, /api/facilitators
```

> **Note:** `Facilitator` model lives in the activity module (not a separate module).

### Module: `app/modules/organization/model.py`

`Organization` model with `meta` JSONB storing vocabulary and meta_field_schemas. Old `Center`, `Programme`, `ProgrammeCenter` classes removed.

---

## Migration Path ✅

All migrations have been applied. The database schema is in the new state.

---

## Kshamata Seeder ✅

Implemented in `app/seeds/kshamata.py`.

```python
# Dimensions (key, name, sort_order)
# Note: name is org-specific, not generic
DIMENSIONS = [
    ("programme", "Programme", 0),
    ("project", "Project", 1),
    ("location", "Location", 2),
]
# Plus system dimension: ("activity_type", "Intervention", 3, is_system="activity_type")

# Explicit Programme ↔ ActivityType mapping (not derived from shared locations)
PROGRAMME_ACTIVITY_TYPES = {
    "OUTREACH": ["Life Skill Education", "Job Readiness", ...],
    "TRANSFORMATION": ["Physical Health", "Mental Health", ...],
    # UNLIMITED: no activity types per the spreadsheet
}

# Vocabulary (maps generic names to Kshamata's terminology)
VOCABULARY = {
    "activity": "Session",
    "activity_type": "Intervention",
    "participation": "Attendance",
    "facilitator": "Facilitator",
    "beneficiary": "Beneficiary",
    "enrollment": "Enrollment",
}
```

Key seeder features:
- `_ensure_dimension()` — idempotent, updates name/sort_order on re-seed
- `_ensure_dimension_value()` — idempotent by code within dimension
- `_ensure_tag_rule()` — normalized pair ordering, skip duplicates
- `_remove_stale_programme_at_rules()` — cleans up Programme↔ActivityType rules for programmes not in `PROGRAMME_ACTIVITY_TYPES` (e.g. Unlimited)

---

## Generic Activity Model

Rename session-related tables to generic, domain-neutral names:

| Current Table | New Table | Rationale |
|---------------|-----------|-----------|
| `sessions` | `activities` | "Activity" is neutral — covers sessions, disbursements, visits, campaigns |
| `session_templates` | `activity_types` | It's a category, not a template you clone |
| `session_facilitators` | `activity_facilitators` | Follows from activity rename |
| `session_tags` | `activity_tags` | Follows from activity rename |
| `attendances` | `participations` | "Attendance" implies physical presence; "participation" covers receiving a donation, getting a vaccine, etc. |

### Schema changes

**`participations` (formerly `attendances`)** — add `meta` JSONB:

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `activity_id` | UUID | FK → activities, NOT NULL |
| `beneficiary_id` | UUID | FK → beneficiaries, NOT NULL |
| `status` | String | "present" / "absent" (default: "present") |
| `meta` | JSONB | Custom data per participation record |

The `meta` column on participations is critical for NGOs that need to record per-beneficiary data on each activity — e.g., donation amount, vaccine dose number, assessment score.

Custom field schemas for participations are defined via `meta_field_schemas` using the entity type `"participation"`.

### Vocabulary mapping ✅

Each org can rename entities in the UI via an org-level config stored in `Organization.meta['vocabulary']`:

```json
{
  "vocabulary": {
    "activity": "Session",
    "activity_type": "Intervention",
    "participation": "Attendance",
    "facilitator": "Facilitator",
    "beneficiary": "Beneficiary",
    "enrollment": "Enrollment"
  }
}
```

**Vocabulary is frontend-only.** The `useVocabulary` hook (`src/hooks/useVocabulary.ts`) fetches the org once (cached 5 min via TanStack Query) and provides:

- **`v(key)`** — singular form: `v("activity")` → `"Session"` for Kshamata
- **`vPlural(key)`** — plural with naive pluralization: `vPlural("activity")` → `"Sessions"`
- **`vDim(dim)`** — dimension display name: checks `vocab[dim.key]`, falls back to `dim.name`. Used for all dimension labels in the UI (tabs, dropdowns, table headers, matrix chips).

The vocabulary key for dimensions matches the dimension's `key` field. For example, a dimension with `key: "activity_type"` is overridden by `vocabulary.activity_type`. This means dimension names in the DB can be org-specific raw terms (e.g. "Intervention"), and the frontend can either use them as-is or override them via vocabulary.

**Kshamata example:** `activity → "Session"`, `activity_type → "Intervention"`, `participation → "Attendance"`.

**Donation NGO example:** `activity → "Disbursement"`, `activity_type → "Disbursement Type"`, `participation → "Recipient"`, `facilitator → "Field Officer"`.

### Permission key renames

| Current | New |
|---------|-----|
| `session_template:view` | `activity_type:view` |
| `session_template:manage` | `activity_type:manage` |
| `session:view` | `activity:view` |
| `session:create` | `activity:create` |

### Backend module rename

```
app/modules/session/  →  app/modules/activity/
  ├── model.py       # Activity, ActivityType, ActivityFacilitator, Participation
  ├── schemas.py
  ├── service.py
  └── routes.py      # /api/activities, /api/activity-types
```

### Frontend references

All references to "session" in code (routes, components, API calls, types) update to "activity". The UI-facing labels come from vocabulary config, not hardcoded strings.

---

## Seeders ✅

Both seed scripts have been updated:

### `app/seeds/initial.py` ✅
- Permission keys updated to new names (`activity:view`, `activity_type:manage`, `dimension:view`, `dimension:manage`, etc.)
- Old permission keys removed
- Default role permission assignments updated

### `app/seeds/kshamata.py` ✅
- Dimensions + DimensionValues replace old Center/Programme/ProgrammeCenter creation
- ActivityTypes replace SessionTemplates
- TagRules replace PROGRAMME_CENTERS + CENTRE_INTERVENTIONS mappings
- System dimension (`is_system="activity_type"`) created with auto-synced values
- Explicit `PROGRAMME_ACTIVITY_TYPES` mapping for Programme↔ActivityType rules
- `_remove_stale_programme_at_rules()` cleans up stale data on re-seed
- Vocabulary config set in org meta
- Meta field schemas for dimensions (e.g., address field on Location values)

---

## Entity Relationship Summary (New)

```
Organization
  ├── Dimensions
  │     └── DimensionValues (with per-dimension custom fields via meta)
  │           └── TagRules (valid combinations between values)
  ├── ActivityTypes (formerly SessionTemplates)
  ├── Activities (formerly Sessions)
  │     ├── ActivityTags → DimensionValues
  │     ├── Participations (formerly Attendances, now with meta JSONB)
  │     │     └── → Beneficiaries
  │     └── ActivityFacilitators → Facilitators
  ├── Facilitators
  ├── Beneficiaries
  │     ├── BeneficiaryTags → DimensionValues
  │     └── Enrollments
  │           └── EnrollmentTags → DimensionValues
  ├── Roles
  │     └── RolePermissions → Permissions
  └── Users
        ├── Role assignment
        └── UserDimensionAccess → DimensionValues
```
