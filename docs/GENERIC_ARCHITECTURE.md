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

---
---

# V2 — Entity/EntityType + Activity Categories + Form Builder

> **Status:** Proposed. Not yet implemented.

## Problem

The v1 architecture has two hardcoded person types (`beneficiaries`, `facilitators`) and assumes all activities are session-like (participation = present/absent). This limits the platform to session-recording NGOs and blocks:

1. **Orgs with more than two person types** — caregivers, donors, volunteers, referral sources, mentors, community leaders
2. **Orgs doing non-session work** — disbursements (need amount per recipient), home visits (need visit notes), health checkups (need vitals), assessments (need scores)
3. **Orgs doing multiple kinds of work** — sessions AND disbursements in the same org, each with different participation semantics

---

## Change 1: Entity & EntityType

Replace `beneficiaries` and `facilitators` tables with a generic `entities` table. Each entity belongs to an org-defined `entity_type`.

### Tables Removed

| Table | Replaced By |
|-------|-------------|
| `beneficiaries` | `entities` + `entity_types` |
| `facilitators` | `entities` + `entity_types` |
| `activity_facilitators` | `activity_participants` (unified — see Change 2) |
| `beneficiary_tags` | `entity_tags` |

### New Tables

#### `entity_types`

Org-defined person categories. Each org creates the types that match their domain.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `organization_id` | UUID | FK → organizations, NOT NULL |
| `name` | String | Display name, e.g. "Beneficiary", "Facilitator", "Caregiver" |
| `key` | String | Machine key, e.g. "beneficiary", "facilitator", "caregiver" |
| `config` | JSONB | Type-level configuration (see below) |
| `sort_order` | Integer | Display ordering |
| `created_at` | Timestamp | From BaseModel |
| `updated_at` | Timestamp | From BaseModel |

Unique constraint: `(organization_id, key)`

**Config schema:**
```json
{
  "case_number_enabled": true,
  "case_number_format": "{ORG_CODE}-{SERIAL}",
  "can_enroll": true
}
```

- `case_number_enabled` — only some entity types need auto-generated case numbers (beneficiaries yes, facilitators no)
- `can_enroll` — whether entities of this type can be enrolled in programmes

**Kshamata example:**
| name | key | case_number_enabled | can_enroll |
|------|-----|---------------------|------------|
| Beneficiary | beneficiary | true | true |
| Facilitator | facilitator | false | false |

**Multi-stakeholder NGO example:**
| name | key | case_number_enabled | can_enroll |
|------|-----|---------------------|------------|
| Child | child | true | true |
| Caregiver | caregiver | true | true |
| Volunteer | volunteer | false | false |
| Referral Source | referral_source | false | false |

#### `entities`

All people tracked by the org, regardless of type.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `organization_id` | UUID | FK → organizations, NOT NULL |
| `entity_type_id` | UUID | FK → entity_types, NOT NULL |
| `case_number` | String | Auto-generated (if type has case_number_enabled), unique within org |
| `name` | String | Required |
| `meta` | JSONB | Custom fields (scoped per entity_type via form field schemas using `entity:{key}`) |
| `created_at` | Timestamp | From BaseModel |
| `updated_at` | Timestamp | From BaseModel |

#### `entity_tags`

Replaces `beneficiary_tags`. Links dimension values to entities for scoping and reporting.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `entity_id` | UUID | FK → entities, NOT NULL |
| `dimension_value_id` | UUID | FK → dimension_values, NOT NULL |

Unique constraint: `(entity_id, dimension_value_id)`

### Modified Tables

#### `enrollments` (modified)

References `entity_id` instead of `beneficiary_id`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `entity_id` | UUID | FK → entities, NOT NULL |
| `organization_id` | UUID | FK → organizations, NOT NULL |
| `admission_date` | Date | When enrolled |
| `release_date` | Date | Nullable — null means still enrolled |
| `meta` | JSONB | Enrollment-specific custom fields |

Only entity types with `can_enroll: true` can be enrolled. Enrollment tags work as before.

### Vocabulary

The entity type's `name` field serves as the display name directly. No separate vocabulary mapping needed — the org names the type whatever they want when they create it ("Beneficiary", "Child", "Patient", etc.).

### Permissions

| Key | Description |
|-----|-------------|
| `entity:view` | View entities (replaces `beneficiary:view`, `facilitator:view`) |
| `entity:create` | Create entities (replaces `beneficiary:create`, `facilitator:manage`) |
| `entity:edit` | Edit entities (replaces `beneficiary:edit`) |
| `entity:manage` | Delete entities, manage entity types |
| `entity_type:view` | View entity types |
| `entity_type:manage` | Create/edit/delete entity types |

Data scoping via `UserDimensionAccess` applies to entities through `entity_tags`, same as it does today for beneficiaries through `beneficiary_tags`.

---

## Change 2: Activity Categories (Domain-Specific Form Builder)

A category defines **what an activity form looks like** — specifically, which participant sections appear, in what order, with what selection UX and statuses. This is a behavioral classification, not a scoping/organizational dimension.

### Why not just configure each ActivityType?

An org like Kshamata has 15 activity types that all share identical participation behavior (present/absent, facilitators + beneficiaries). Configuring each one individually is tedious and error-prone. Category defines it once; all 15 types inherit.

### Why not a Dimension?

Dimensions are for **scoping and reporting** (where, which programme, which funder). Category answers a different question: **how does the activity form behave?** It drives UI rendering and validation, not access control or filtering. Putting behavioral config in dimensions conflates two concerns.

### Relationship to Tag Rules

**Activity categories do NOT participate in tag rules.** Tag rules continue to operate at the activity type level via the system dimension (`is_system="activity_type"`). Category is orthogonal to scoping.

```
Tag Rules (unchanged):
  Location:ShantiSadan ↔ ActivityType:Life Skills           (category: Sessions)
  Location:ShantiSadan ↔ ActivityType:Cash Aid              (category: Disbursements)
  Funder:UNICEF ↔ ActivityType:Cash Aid                     (category: Disbursements)
```

When a user selects a location, they see activity types from any category. The activity form adapts based on the selected type's category config.

### New Table

#### `activity_categories`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `organization_id` | UUID | FK → organizations, NOT NULL |
| `name` | String | Display name, e.g. "Sessions", "Disbursements" |
| `key` | String | Machine key, e.g. "sessions", "disbursements" |
| `sections` | JSONB | Participant sections config — the form builder output (see below) |
| `sort_order` | Integer | Display ordering |
| `created_at` | Timestamp | From BaseModel |
| `updated_at` | Timestamp | From BaseModel |

Unique constraint: `(organization_id, key)`

#### Sections Config Schema

The `sections` JSONB array defines which participant types appear on the activity form, in what order, and how each section behaves. This is the core output of the form builder.

Each section has:

| Field | Type | Notes |
|-------|------|-------|
| `participant_source` | String | `"entity_type:{key}"` or `"user"` — where to pull participants from |
| `label` | String | Section heading on the form, e.g. "Facilitators", "Attendance", "Staff Attendance" |
| `selection_mode` | String | How participants are selected (see below) |
| `min_count` | Integer | Minimum participants required (0 = optional section) |
| `max_count` | Integer or null | Maximum participants (null = unlimited) |
| `capture_status` | Boolean | Whether to show a status toggle per participant |
| `statuses` | String[] | Valid status options (only if `capture_status` is true) |
| `default_status` | String | Default status value |

**Selection modes:**
- `"multi_select"` — pick from all available (for facilitators, volunteers, staff)
- `"enrolled_checklist"` — show all enrolled entities matching the activity's dimension tags (for beneficiaries)
- `"single_select"` — pick one (for home visits to one person, or a single field officer)

**Kshamata "Sessions" category:**
```json
{
  "sections": [
    {
      "participant_source": "entity_type:facilitator",
      "label": "Facilitators",
      "selection_mode": "multi_select",
      "min_count": 0,
      "max_count": null,
      "capture_status": false,
      "statuses": [],
      "default_status": null
    },
    {
      "participant_source": "entity_type:beneficiary",
      "label": "Attendance",
      "selection_mode": "enrolled_checklist",
      "min_count": 0,
      "max_count": null,
      "capture_status": true,
      "statuses": ["present", "absent"],
      "default_status": "present"
    }
  ]
}
```

**Multi-purpose NGO "Disbursements" category:**
```json
{
  "sections": [
    {
      "participant_source": "entity_type:field_officer",
      "label": "Distributed By",
      "selection_mode": "single_select",
      "min_count": 1,
      "max_count": 1,
      "capture_status": false,
      "statuses": [],
      "default_status": null
    },
    {
      "participant_source": "entity_type:beneficiary",
      "label": "Recipients",
      "selection_mode": "enrolled_checklist",
      "min_count": 0,
      "max_count": null,
      "capture_status": true,
      "statuses": ["received", "not_received"],
      "default_status": "received"
    }
  ]
}
```

**Sessions with staff attendance tracking:**
```json
{
  "sections": [
    {
      "participant_source": "entity_type:facilitator",
      "label": "Facilitators",
      "selection_mode": "multi_select",
      "min_count": 0,
      "max_count": null,
      "capture_status": false,
      "statuses": [],
      "default_status": null
    },
    {
      "participant_source": "entity_type:beneficiary",
      "label": "Attendance",
      "selection_mode": "enrolled_checklist",
      "min_count": 0,
      "max_count": null,
      "capture_status": true,
      "statuses": ["present", "absent"],
      "default_status": "present"
    },
    {
      "participant_source": "user",
      "label": "Staff Attendance",
      "selection_mode": "multi_select",
      "min_count": 0,
      "max_count": null,
      "capture_status": true,
      "statuses": ["present", "absent"],
      "default_status": "present"
    }
  ]
}
```

> **Note on `participant_source: "user"`:** When the source is `"user"`, the system pulls from the org's `users` table instead of `entities`. This avoids needing to duplicate staff as entities or maintain User ↔ Entity links. Users stay as auth/access records; they just become selectable as participants when a category section references them.

### Modified Tables

#### `activity_types` (modified)

Gains a `category_id` FK.

| Column | Change |
|--------|--------|
| `category_id` | **Added** — FK → activity_categories, NOT NULL |

Activity types inherit form structure from their category. All 15 of Kshamata's interventions point to the same "Sessions" category.

#### `activity_participants` (replaces `participations` + `activity_facilitators`)

A unified table recording **anyone's involvement in an activity** — beneficiaries, facilitators, staff, users. Replaces both the old `attendances`/`participations` table and `activity_facilitators` table. Every person connected to an activity is an activity participant.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `activity_id` | UUID | FK → activities, NOT NULL |
| `participant_type` | String | `"entity"` or `"user"` — which table to look up the person in |
| `participant_id` | UUID | FK to `entities` or `users` depending on `participant_type` |
| `section_key` | String | Which section this record belongs to (matches the section's `participant_source` value, e.g. `"entity_type:facilitator"`, `"entity_type:beneficiary"`, `"user"`) |
| `status` | String | Nullable — only set if section has `capture_status: true` |
| `meta` | JSONB | Custom data per participant per activity, driven by form field schemas |

The `section_key` ties each record back to its category section, so the UI knows how to group and render them when viewing an activity.

**Status** is driven by the category section config. It is nullable — if the section has `capture_status: false` (e.g. facilitators in a session where you just need to know who conducted it), status is null.

Example status values by category:

| Category | Section | Statuses | Default |
|----------|---------|----------|---------|
| Sessions | Attendance (beneficiaries) | `["present", "absent"]` | `"present"` |
| Sessions | Facilitators | none — `capture_status: false` | — |
| Disbursements | Recipients (beneficiaries) | `["received", "not_received"]` | `"received"` |
| Home Visits | Visitee (beneficiary) | `["completed", "cancelled", "no_show"]` | `"completed"` |
| Health Camp | Patients (beneficiaries) | `["screened", "referred", "declined"]` | `"screened"` |

**Meta** stores per-participant custom data defined via form field schemas. Examples:

| Category / Activity Type | Meta example | Form field schema key |
|--------------------------|--------------|----------------------|
| Disbursements (all types) | `{"amount": 5000, "payment_mode": "cash"}` | `"participation:disbursements"` |
| Sessions: Physical Health | `{"weight": 62, "bp": "120/80", "temperature": 98.6}` | `"participation:physical_health"` |
| Sessions: Mental Health | `{"mood_score": 7, "assessment_notes": "Showing improvement"}` | `"participation:mental_health"` |
| Sessions: Life Skills | `null` (no extra fields — just present/absent) | — |

For most of Kshamata's 15 activity types, meta is empty. The field only gets used when an activity type or category defines form fields for it.

**Example — a complete activity with all its participants:**
```
Activity: "Life Skills session at ShantiSadan, March 15"

activity_participants rows:
  participant_type  participant_id   section_key                status     meta
  ─────────────────────────────────────────────────────────────────────────────
  entity            → Facilitator    entity_type:facilitator    null       null
                      "Priya"
  entity            → Beneficiary    entity_type:beneficiary    "present"  null
                      "Amit"
  entity            → Beneficiary    entity_type:beneficiary    "present"  null
                      "Ravi"
  entity            → Beneficiary    entity_type:beneficiary    "absent"   null
                      "Suresh"
  user              → User           user                       "present"  null
                      "Neha" (staff)
```

#### Status UX — Ensuring Generalization Doesn't Slow Down Field Workers

**Generalization should affect the admin setting it up, never the field worker using it.** The config drives which UI component renders, but the component itself is optimized for speed.

The frontend automatically picks the fastest UI control based on the number of statuses:

| Statuses count | UI Component | Behavior |
|----------------|-------------|----------|
| 2 | Toggle / checkbox | Default status = checked. Tap to flip. |
| 3–4 | Segmented pills | Tap one option. Default pre-selected. |
| 5+ | Dropdown | Select from list. |

**For the most common case (2 statuses, present/absent with `enrolled_checklist`):**

The checklist renders with everyone **already checked** (default_status = "present"). The field worker just unchecks the 2-3 absentees. Same speed as a hardcoded attendance screen.

```
┌─ Attendance ────────────────────────┐
│  ✓  Amit                            │
│  ✓  Ravi                            │
│  ✓  Priya                           │
│  ☐  Suresh          ← tapped once   │
│  ✓  Meena                           │
│  ☐  Deepa           ← tapped once   │
│  ✓  Kiran                           │
│  ...                                 │
│                                      │
│  18/20 present              [Save]   │
└──────────────────────────────────────┘
```

No dropdowns, no extra taps. 3 taps to mark 20 people. Identical UX to a hardcoded attendance screen.

#### Vocabulary — Section Labels ARE the Vocabulary

No separate vocabulary mapping is needed for activity participant sections. The admin directly types the section label when configuring the category in the form builder:

- Sessions category → section label: **"Attendance"**
- Disbursements category → section label: **"Recipients"**
- Home Visits category → section label: **"Visit Record"**

The label is right there in the `sections` config, not looked up from a separate mapping. Each category can have completely different labels for its sections. One fewer layer of indirection.

---

## Change 3: Form Fields (Unified Configuration)

Rename "Custom Fields" to **"Form Fields"**. All field configuration for all entity types, activities, activity participants, dimensions, and enrollments lives in one place: **Settings > Form Fields**.

### How it works

The existing `meta_field_schemas` mechanism is unchanged — field definitions stored in org meta, keyed by entity type. What changes is the set of valid keys and the UI for managing them.

### Form Field Schema Keys

| Key Pattern | What it configures | Example |
|-------------|-------------------|---------|
| `entity:{entity_type_key}` | Fields on entity profiles | `"entity:beneficiary"` → age, nationality, education |
| `dimension:{dimension_key}` | Fields on dimension values | `"dimension:location"` → address |
| `activity:{category_key}` | Activity-level fields shared across all types in a category | `"activity:sessions"` → venue override |
| `activity:{activity_type_key}` | Activity-level fields specific to one type | `"activity:physical_health"` → equipment used |
| `participant:{category_key}` | Per-participant fields shared across all types in a category | `"participant:disbursements"` → amount |
| `participant:{activity_type_key}` | Per-participant fields specific to one type | `"participant:physical_health"` → weight, BP |
| `enrollment` | Fields on enrollment records | `"enrollment"` → referral source |

Two-level merge for activities and participants: the form renders **category-level fields + type-level fields merged**. Most types in a category will have no type-level overrides.

### Form Fields Settings Page

**Settings > Form Fields** shows a unified selector:

```
┌─ Form Fields ──────────────────────────────────────────────────────┐
│                                                                     │
│  Select what you're configuring:                                    │
│                                                                     │
│  Entity types:     [Beneficiary] [Facilitator] [Caregiver]          │
│  Dimensions:       [Location] [Programme]                           │
│  Activities:       [Activity: Sessions] [Activity: Disbursements]   │
│  Participants:     [Partic: Sessions] [Partic: Disbursements]       │
│  Other:            [Enrollment]                                     │
│                                                                     │
│  ── Currently editing: Beneficiary ──────────────────────────────   │
│                                                                     │
│  [Name field definitions rendered by DynamicMetaForm editor...]     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

When "Activity: Sessions" or "Partic: Sessions" is selected, a sub-filter appears for activity type:

```
  Activity type: [All types ▼]  →  shows category-level fields
                 [Physical Health ▼]  →  shows type-specific fields only
                 [Mental Health ▼]    →  shows type-specific fields only
```

Tabs are dynamically generated from the org's entity types, dimensions, and activity categories. `DynamicMetaForm` editor requires no changes — it already works with any field definition array.

### Activity Form Rendering Logic

When rendering an activity form, the system assembles fields from the form field schemas:

```
function renderActivityForm(activityType) {
  category = activityType.category

  // ── Zone 1: Header (fixed, system-driven) ──
  render DatePicker
  render DimensionDropdowns  // from tag rules + user access
  render ActivityTypeDropdown

  // ── Zone 2: Participant Sections (from category.sections config) ──
  for section in category.sections:  // rendered in array order
    render SectionHeader(section.label)

    if section.participant_source == "user":
      participants = getOrgUsers()
    elif section.selection_mode == "enrolled_checklist":
      participants = getEnrolledEntities(entityTypeKey, selectedDimensionValues)
    else:
      participants = getAllEntities(entityTypeKey)

    // Render selection UI based on mode
    if section.selection_mode == "enrolled_checklist":
      render Checklist(participants)
    elif section.selection_mode == "multi_select":
      render MultiSelect(participants)
    elif section.selection_mode == "single_select":
      render SingleSelect(participants)

    // Per-participant fields (status + meta)
    for each selected participant:
      if section.capture_status:
        render StatusToggle(section.statuses, section.default_status)
      categoryFields = getFormFields("participant:{category.key}")
      typeFields = getFormFields("participant:{activityType.key}")
      render DynamicMetaForm(merge(categoryFields, typeFields))

  // ── Zone 3: Activity-level meta (from form field schemas) ──
  categoryFields = getFormFields("activity:{category.key}")
  typeFields = getFormFields("activity:{activityType.key}")
  if categoryFields or typeFields:
    render DynamicMetaForm(merge(categoryFields, typeFields))

  // ── Zone 4: Notes (fixed, always last) ──
  render NotesTextArea
}
```

### What the admin configures where

| What | Where in Settings | Controls |
|------|-------------------|----------|
| What kinds of people the org tracks | Entity Types | Entity type definitions + config |
| What data to capture on each person type | Form Fields → Entity: {type} | Profile form fields |
| What kinds of activities the org does | Activity Categories | Category name + sections (the form builder) |
| Who participates in each kind of activity, how they're selected, status options | Activity Categories → Edit → Sections builder | Zone 2 structure |
| What specific activity types exist | Activity Types | Type name, description, category assignment |
| What extra data to capture per participant | Form Fields → Participant: {category/type} | Per-row meta in Zone 2 |
| What extra data to capture on the activity itself | Form Fields → Activity: {category/type} | Zone 3 fields |
| What data to capture on dimension values | Form Fields → Dimension: {dimension} | Dimension value meta |
| What data to capture on enrollments | Form Fields → Enrollment | Enrollment meta |

---

## Change 4: Enrollments

Enrollments link an entity to a set of dimension values for a period of time. They determine **who shows up in the `enrolled_checklist`** when creating an activity. Not yet built — clean start with the v2 model.

### Who can be enrolled?

Only entity types with `can_enroll: true` in their config. For Kshamata: beneficiaries yes, facilitators no. An org tracking children and caregivers might enable enrollment for both.

### Tables

#### `enrollments`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `entity_id` | UUID | FK → entities, NOT NULL |
| `organization_id` | UUID | FK → organizations, NOT NULL |
| `admission_date` | Date | When enrolled |
| `release_date` | Date | Nullable — null means still active |
| `meta` | JSONB | Custom fields from form field schemas (`"enrollment"`) |
| `created_at` | Timestamp | From BaseModel |
| `updated_at` | Timestamp | From BaseModel |

A single entity can have multiple enrollments — different dimension value combinations (different programmes/locations), or re-enrollment after release.

#### `enrollment_tags`

Links the enrollment to specific dimension values.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `enrollment_id` | UUID | FK → enrollments, NOT NULL |
| `dimension_value_id` | UUID | FK → dimension_values, NOT NULL |

Unique constraint: `(enrollment_id, dimension_value_id)`

**Example — Amit enrolled at ShantiSadan in Outreach programme:**
| enrollment_id | dimension_value_id |
|---------------|--------------------|
| enr-001 | Location:ShantiSadan |
| enr-001 | Programme:Outreach |

### How enrolled_checklist works

When a field worker creates an activity and selects dimension values (e.g. Location:ShantiSadan + Programme:Outreach), the enrolled checklist section queries for entities whose active enrollments match **all** the selected dimension values:

```sql
SELECT e.*
FROM entities e
JOIN enrollments en ON en.entity_id = e.id
  AND en.release_date IS NULL  -- still active
JOIN enrollment_tags et ON et.enrollment_id = en.id
WHERE e.entity_type_id = :beneficiary_type_id
  AND et.dimension_value_id IN (:selected_dimension_value_ids)
GROUP BY e.id
HAVING COUNT(DISTINCT et.dimension_value_id) = :number_of_selected_dimensions
```

Only entities enrolled under **all** the selected dimension values appear in the checklist.

### API Endpoints

```
POST   /api/enrollments                     → create (entity_id + dimension_value_ids[] + dates + meta)
GET    /api/enrollments                     → list (filterable by entity, dimension values, active/released)
PUT    /api/enrollments/{id}                → update (change dates, meta)
PUT    /api/enrollments/{id}/release        → set release_date (end enrollment)
```

### Frontend

**Two entry points for managing enrollments:**

#### 1. Entity profile page → "Enrollments" tab

Shows this entity's enrollment history. Admin can add, edit, or release enrollments.

```
┌─ Amit — Enrollments ─────────────────────────────────┐
│                                                       │
│  ● Active                                    [+ New]  │
│  ┌───────────────────────────────────────────────┐    │
│  │ ShantiSadan · Outreach                        │    │
│  │ Admitted: Jan 1, 2025                         │    │
│  │ Status: Active                    [Release]   │    │
│  └───────────────────────────────────────────────┘    │
│                                                       │
│  ○ Released                                           │
│  ┌───────────────────────────────────────────────┐    │
│  │ Kasturba · Transformation                     │    │
│  │ Admitted: Mar 15, 2024 → Released: Dec 1, 2024│    │
│  └───────────────────────────────────────────────┘    │
│                                                       │
└───────────────────────────────────────────────────────┘
```

#### 2. Enrollment form (from profile or standalone)

```
┌─ New Enrollment ─────────────────────────────┐
│                                               │
│  Entity: [Amit]  (pre-filled if from profile) │
│                                               │
│  [Location dropdown: ShantiSadan ▼]           │
│  [Programme dropdown: Outreach ▼]             │
│  ... (one dropdown per dimension, cascading    │
│       via tag rules)                          │
│                                               │
│  Admission Date: [2025-01-01]                 │
│  Release Date:   [          ]  (leave blank   │
│                    for active enrollment)      │
│                                               │
│  ── Form Fields (from "enrollment" schema) ── │
│  Referral Source: [___________]               │
│  Notes:          [___________]               │
│                                               │
│                          [Cancel] [Enroll]    │
└───────────────────────────────────────────────┘
```

Dimension dropdowns cascade via tag rules, same as the activity form. The enrollment form respects `UserDimensionAccess` — a field worker scoped to ShantiSadan can only enroll entities there.

### Permissions

| Key | Description |
|-----|-------------|
| `enrollment:view` | View enrollments |
| `enrollment:manage` | Create, edit, release enrollments |

These are unchanged from v1.

---

## Change 5: Settings Navigation Updates

### New/Modified Settings Pages

**Existing pages updated:**
- **Custom Fields** → renamed to **Form Fields** — unified field configuration for all entity types, dimensions, activities, activity participants, enrollments
- **Dimensions** — add **"+ Add Dimension"** button to create new dimensions (currently seeder-only). Editing dimension names is safe. Keys are immutable after creation. Deleting warns about cascading effects.

**New pages:**
- **Entity Types** (`/admin/entity-types`) — list, add, edit, delete entity types. Configure case number format, enrollment capability.
- **Activity Categories** (`/admin/activity-categories`) — list, add, edit, delete categories. Each category has the **sections builder** (the domain-specific form builder) for configuring participant sections.

### Settings Tab Layout

Dynamically generated from org config:

```
{Dim 1} | {Dim 2} | ... | Tag Rules | Activity Categories | Activity Types | Entity Types | Facilitators | Beneficiaries | Roles | Users | Form Fields
```

> **Note:** "Facilitators" and "Beneficiaries" tabs are actually entity type instance lists. The tabs are dynamically generated from the org's entity types — one tab per entity type. For Kshamata this shows "Beneficiaries | Facilitators". For another org it might show "Children | Caregivers | Volunteers".

---

## V2 Entity Relationship Summary

```
Organization
  ├── Dimensions
  │     └── DimensionValues (with per-dimension form fields via meta)
  │           └── TagRules (valid combinations between values)
  ├── EntityTypes (org-defined person categories)
  │     └── Entities (all tracked people)
  │           ├── EntityTags → DimensionValues
  │           └── Enrollments (for entity types with can_enroll)
  │                 └── EnrollmentTags → DimensionValues
  ├── ActivityCategories (form builder — defines participant sections)
  │     └── ActivityTypes (now with category_id)
  │           └── Activities
  │                 ├── ActivityTags → DimensionValues
  │                 └── ActivityParticipants (polymorphic: entity or user, with status + meta)
  ├── Roles
  │     └── RolePermissions → Permissions
  └── Users
        ├── Role assignment
        └── UserDimensionAccess → DimensionValues
```

---

## Migration Considerations

Since `enrollments` haven't been built yet and `facilitators` + `beneficiaries` already exist:

1. Create `entity_types` and `activity_categories` tables
2. Create `entities` table, migrate data from `beneficiaries` and `facilitators`
3. Create `entity_tags`, migrate data from `beneficiary_tags`
4. Create `activity_participants` table, migrate data from `participations` (with `participant_type: "entity"`, `section_key: "entity_type:beneficiary"`)
5. Migrate `activity_facilitators` data into `activity_participants` (with `participant_type: "entity"`, `section_key: "entity_type:facilitator"`)
6. Add `category_id` to `activity_types`
7. Drop old tables (`beneficiaries`, `facilitators`, `activity_facilitators`, `beneficiary_tags`, `participations`)
8. Rename "Custom Fields" to "Form Fields" in frontend, update schema key patterns
9. Update all services, routes, and frontend to use new entity/category/activity_participants models
