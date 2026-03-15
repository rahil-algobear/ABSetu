# Generic NGO Architecture — Implementation Document

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

#### `dimensions`

Org-defined grouping axes. Each org creates the dimensions that match how they work.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK (from BaseModel) |
| `organization_id` | UUID | FK → organizations, NOT NULL |
| `name` | String | Display name, e.g. "Location", "Programme" |
| `key` | String | Machine key, e.g. "location", "programme" |
| `sort_order` | Integer | Display ordering |
| `created_at` | Timestamp | From BaseModel |
| `updated_at` | Timestamp | From BaseModel |

Unique constraint: `(organization_id, key)`

**Kshamata example:**
| name | key |
|------|-----|
| Centre | centre |
| Centre Type | centre_type |
| Programme | programme |

---

#### `dimension_values`

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

**Kshamata example (Centre dimension):**
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

---

#### `tag_rules`

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

Programme ↔ Centre rules (replaces `programme_centers`):
| dimension_value_1 | dimension_value_2 |
|--------------------|-------------------|
| Programme:Outreach | Centre:ShantiSadan |
| Programme:Outreach | Centre:Kasturba |
| Programme:Transformation | Centre:Thane |
| Programme:Unlimited | Centre:Thane |
| Programme:Unlimited | Centre:Mankhurd |

Centre ↔ ActivityType rules (replaces `CENTRE_INTERVENTIONS`):
| dimension_value_1 | dimension_value_2 |
|--------------------|-------------------|
| Centre:ShantiSadan | ActivityType:Life Skill Education |
| Centre:ShantiSadan | ActivityType:Job Readiness |
| Centre:ShantiSadan | ActivityType:Vocational Skill Training |
| ... | ... |

> **Note on ActivityType in tag rules:** ActivityType remains a first-class table (`activity_types`), but for tag rule purposes we create a system-managed "Activity Type" dimension whose values mirror the `activity_types` table. This lets `tag_rules` work with a single mechanism (dimension_value ↔ dimension_value) without special-casing activity types. When an activity type is created/deleted, the corresponding dimension value is synced automatically.

---

#### `activity_tags`

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
| act-001 | Centre:ShantiSadan |
| act-001 | Programme:Outreach |

---

#### `beneficiary_tags`

Links dimension values to beneficiaries for scoping and reporting.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `beneficiary_id` | UUID | FK → beneficiaries, NOT NULL |
| `dimension_value_id` | UUID | FK → dimension_values, NOT NULL |

Unique constraint: `(beneficiary_id, dimension_value_id)`

---

#### `enrollment_tags`

Links dimension values to enrollments. Replaces the `programme_center_id` FK on enrollments.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `enrollment_id` | UUID | FK → enrollments, NOT NULL |
| `dimension_value_id` | UUID | FK → dimension_values, NOT NULL |

Unique constraint: `(enrollment_id, dimension_value_id)`

---

#### `user_dimension_access`

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
| worker-001 | Centre:ShantiSadan |
| worker-001 | Centre:Kasturba |
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

## Permissions

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

## Custom Fields (Meta) Per Dimension

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

## Frontend Changes

### Settings Navigation

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
Centres | Programmes | Tag Rules | Session Templates | Facilitators | Beneficiaries | Roles | Users | Custom Fields
```
> "Centres" because that's what Kshamata named their location dimension. "Session Templates" via vocabulary mapping of "Activity Types". Looks nearly identical to today.

For a different NGO with dimensions "Region", "Project", "Funder":
```
Regions | Projects | Funders | Tag Rules | Activity Types | Facilitators | Beneficiaries | Roles | Users | Custom Fields
```

### Dimension Settings Pages (`/admin/dimensions/{dimension_key}`)

Each dimension gets its own page (one route, reused component). Shows a list of that dimension's values with add/edit/delete.

Admin can:
- Add/edit/remove values within the dimension
- Custom fields per dimension render via DynamicMetaForm (fetched from meta_field_schemas using `dimension:{key}`)

A separate admin page (or section within org settings) allows creating new dimensions themselves.

### Tag Rules Page (`/admin/tag-rules`)

Matrix view showing valid combinations between two selected dimensions.

```
Dimension: [Centre ▼]  ×  Dimension: [Activity Type ▼]

                    Life Skill  Job Ready  Vocational  Digital Lit  ...
ShantiSadan            ✓           ✓          ✓           ✓
Kasturba               ✓           ✓          ✓
...
```

Admin selects two dimensions from dropdowns, then toggles checkboxes in the matrix.

### Activity Creation Form

Dynamically renders one dropdown per dimension (filtered by user's access scope). Selection cascading via tag rules — choosing a Centre filters Programme to valid options, which filters Activity Type to valid options.

```
[Centre dropdown]         → filtered by UserDimensionAccess
[Programme dropdown]      → filtered by tag_rules(selected centre)
[Activity Type dropdown]  → filtered by tag_rules(selected centre)
[Date picker]
[Facilitator dropdown]
[Participation checklist] → beneficiaries filtered by matching tags
                          → each participation row can have meta fields (e.g., amount for donations)
```

**The UI looks identical to today for end users.** The difference is that dropdowns are generic (driven by dimensions) rather than hardcoded. All labels come from the org's vocabulary mapping.

### Custom Fields Page (`/admin/meta-fields`)

Entity type selector dynamically includes dimension-based types:

```
[Session Template] [Facilitator] [Beneficiary] [Location*] [Programme*] [Funder*]
                                                ↑ auto-added from org's dimensions
```

No other changes to this page — DynamicMetaForm handles rendering.

---

## API Changes

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

## Backend Module Structure

### New Module: `app/modules/dimension/`

```
app/modules/dimension/
├── model.py       # Dimension, DimensionValue, TagRule
├── schemas.py     # Request/response schemas
├── service.py     # Business logic, tag rule validation
└── routes.py      # API endpoints
```

### New Module: `app/modules/tagging/`

```
app/modules/tagging/
├── model.py       # ActivityTag, BeneficiaryTag, EnrollmentTag, UserDimensionAccess
├── schemas.py
├── service.py     # Scoping/filtering logic
└── routes.py      # User access endpoints
```

### Renamed Module: `app/modules/session/` → `app/modules/activity/`

```
app/modules/activity/
├── model.py       # Activity, ActivityType, ActivityFacilitator, Participation
├── schemas.py
├── service.py
└── routes.py      # /api/activities, /api/activity-types
```

### Modified Module: `app/modules/organization/model.py`

Remove `Center`, `Programme`, `ProgrammeCenter` classes. `Organization` stays.

---

## Migration Path

Since we don't need backward compatibility:

1. Create new migration that:
   - Creates `dimensions`, `dimension_values`, `tag_rules` tables
   - Creates `activity_tags`, `beneficiary_tags`, `enrollment_tags` tables
   - Creates `user_dimension_access` table
   - Renames `session_templates` → `activity_types`, `sessions` → `activities`, `session_facilitators` → `activity_facilitators`, `attendances` → `participations`
   - Renames `session_template_id` → `activity_type_id` on activities
   - Adds `meta` JSONB column to `participations`
   - Adds `organization_id` to `activities` and `enrollments`
   - Drops `programme_center_id` from `activities` and `enrollments`
   - Drops `centres`, `programmes`, `programme_centers` tables
   - Drops `user_center_access`, `user_programme_access`, `user_session_template_access` tables
   - Updates permission records (remove old, add new)

2. Rename backend module `app/modules/session/` → `app/modules/activity/`

3. Update all backend modules (routes, services, schemas)

4. Update all frontend pages and components

5. Update seeders (`initial.py` and `kshamata.py`) — see Seeders section below

---

## Kshamata Seeder (New Version)

```python
# Dimensions (key, name — name is what appears in the UI/settings tabs)
DIMENSIONS = [
    ("centre", "Centre"),
    ("centre_type", "Centre Type"),
    ("programme", "Programme"),
]

# Dimension Values
DIMENSION_VALUES = {
    "centre": [
        ("SHANTISADAN", "ShantiSadan"),
        ("KASTURBA", "Kasturba"),
        ("NAVJEEVAN", "Navjeevan"),
        # ... all 15 centres
    ],
    "centre_type": [
        ("INSTITUTION", "Institution"),
        ("POST_INSTITUTION", "Post Institution"),
        ("COMMUNITY", "Community"),
    ],
    "programme": [
        ("OUTREACH", "Kshamata Outreach Programme"),
        ("TRANSFORMATION", "Kshamata Transformation Programme"),
        ("UNLIMITED", "Kshamata Unlimited"),
    ],
}

# Tag Rules (replaces PROGRAMME_CENTERS + CENTRE_INTERVENTIONS)
TAG_RULES = {
    ("programme:OUTREACH", "centre:SHANTISADAN"),
    ("programme:OUTREACH", "centre:KASTURBA"),
    # ...
    ("centre:SHANTISADAN", "activity_type:LIFE_SKILL_EDUCATION"),
    ("centre:SHANTISADAN", "activity_type:JOB_READINESS"),
    # ... all valid combinations
}

# Vocabulary (maps generic names to Kshamata's terminology)
VOCABULARY = {
    "activity": "Session",
    "activity_type": "Session Template",
    "participation": "Attendance",
    "facilitator": "Facilitator",
    "beneficiary": "Beneficiary",
    "enrollment": "Enrollment",
}
```

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

### Vocabulary mapping

Each org can rename entities in the UI via an org-level config stored in `Organization.meta['vocabulary']`:

```json
{
  "vocabulary": {
    "activity": "Session",
    "activity_type": "Session Template",
    "participation": "Attendance",
    "facilitator": "Facilitator",
    "beneficiary": "Beneficiary",
    "enrollment": "Enrollment"
  }
}
```

If no vocabulary is configured, the UI uses sensible defaults (the generic names above, or the Kshamata-style names — TBD). The frontend reads this config and renders all labels, page titles, navigation items, and button text dynamically.

**Kshamata example:** `activity → "Session"`, `activity_type → "Session Template"`, `participation → "Attendance"` — UI looks identical to today.

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

## Seeders

After all schema and code changes are complete, update both seed scripts:

### `app/seeds/initial.py`
- Update permission keys to new names (`activity:view`, `activity_type:manage`, `dimension:view`, `dimension:manage`, etc.)
- Remove old permission keys (`center:view`, `centre:manage`, `programme:view`, `programme:manage`, `session:view`, `session:create`, `session_template:view`, `session_template:manage`)
- Update default role permission assignments

### `app/seeds/kshamata.py`
- Replace `Center`, `Programme`, `ProgrammeCenter` creation with `Dimension` + `DimensionValue` creation
- Replace `SessionTemplate` creation with `ActivityType` creation
- Replace `PROGRAMME_CENTERS` mapping with `TagRule` creation
- Replace `CENTRE_INTERVENTIONS` mapping with `TagRule` creation (same mechanism)
- Add vocabulary config to org meta: `{"vocabulary": {"activity": "Session", "activity_type": "Session Template", "participation": "Attendance"}}`
- Add dimension-scoped meta field schemas if needed (e.g., address field on Location dimension values)

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
