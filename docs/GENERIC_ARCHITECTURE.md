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

### Tables Unchanged

| Table | Notes |
|-------|-------|
| `organizations` | Same. `meta` still stores `meta_field_schemas` |
| `session_templates` | Same. Still a first-class entity |
| `sessions` | Modified — removes `programme_center_id`, adds `organization_id` |
| `attendances` | Same |
| `facilitators` | Same |
| `session_facilitators` | Same |
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
| Location | location |
| Location Type | location_type |
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

Programme ↔ Location rules (replaces `programme_centers`):
| dimension_value_1 | dimension_value_2 |
|--------------------|-------------------|
| Programme:Outreach | Location:ShantiSadan |
| Programme:Outreach | Location:Kasturba |
| Programme:Transformation | Location:Thane |
| Programme:Unlimited | Location:Thane |
| Programme:Unlimited | Location:Mankhurd |

Location ↔ SessionTemplate rules (replaces `CENTRE_INTERVENTIONS`):
| dimension_value_1 | dimension_value_2 |
|--------------------|-------------------|
| Location:ShantiSadan | SessionTemplate:Life Skill Education |
| Location:ShantiSadan | SessionTemplate:Job Readiness |
| Location:ShantiSadan | SessionTemplate:Vocational Skill Training |
| ... | ... |

> **Note on SessionTemplate in tag rules:** SessionTemplate remains a first-class table, but for tag rule purposes we create a system-managed "Session Type" dimension whose values mirror the session_templates table. This lets tag_rules work with a single mechanism (dimension_value ↔ dimension_value) without special-casing session templates. When a session template is created/deleted, the corresponding dimension value is synced automatically.

---

#### `session_tags`

Links dimension values to sessions. Replaces the `programme_center_id` FK on sessions.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `session_id` | UUID | FK → sessions, NOT NULL |
| `dimension_value_id` | UUID | FK → dimension_values, NOT NULL |

Unique constraint: `(session_id, dimension_value_id)`

**Example — a Life Skill Education session at ShantiSadan:**
| session_id | dimension_value_id |
|------------|--------------------|
| sess-001 | Location:ShantiSadan |
| sess-001 | Programme:Outreach |

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
| worker-001 | Location:ShantiSadan |
| worker-001 | Location:Kasturba |
| worker-001 | Programme:Outreach |

**Access logic:** When querying sessions for a user, filter to sessions whose tags are a subset of the user's dimension access. Admin users with no access restrictions see everything.

---

### Modified Tables

#### `sessions` (modified)

| Column | Change |
|--------|--------|
| `programme_center_id` | **Removed** |
| `organization_id` | **Added** — FK → organizations (was implicit through programme_center) |

Tags are now in `session_tags` instead of being implicit through `programme_center_id`.

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

**Added:**
- `dimension:view` — view dimensions and their values
- `dimension:manage` — create/edit/delete dimensions, values, and tag rules

**Unchanged:**
- `org:settings`
- `session_template:view`, `session_template:manage`
- `session:view`, `session:create`
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
"session_template", "facilitator", "beneficiary", "enrollment", "session",
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

**New tabs:**
```
Dimensions | Tag Rules | Session Templates | Facilitators | Beneficiaries | Roles | Users | Custom Fields
```

### Dimensions Settings Page (`/admin/dimensions`)

Left panel: list of dimensions for the org. Right panel: selected dimension's values.

Admin can:
- Create new dimensions (e.g., "Funder", "Cohort", "Region")
- Add/edit/remove values within each dimension
- Custom fields per dimension render via DynamicMetaForm (fetched from meta_field_schemas using `dimension:{key}`)

### Tag Rules Page (`/admin/tag-rules`)

Matrix view showing valid combinations between two selected dimensions.

```
Dimension: [Location ▼]  ×  Dimension: [Session Type ▼]

                    Life Skill  Job Ready  Vocational  Digital Lit  ...
ShantiSadan            ✓           ✓          ✓           ✓
Kasturba               ✓           ✓          ✓
...
```

Admin selects two dimensions from dropdowns, then toggles checkboxes in the matrix.

### Session Creation Form

Dynamically renders one dropdown per dimension (filtered by user's access scope). Selection cascading via tag rules — choosing a Location filters Programme to valid options, which filters Session Type to valid options.

```
[Location dropdown]     → filtered by UserDimensionAccess
[Programme dropdown]    → filtered by tag_rules(selected location)
[Session Type dropdown] → filtered by tag_rules(selected location)
[Date picker]
[Facilitator dropdown]
[Attendance checklist]  → beneficiaries filtered by matching tags
```

**The UI looks identical to today for end users.** The difference is that dropdowns are generic (driven by dimensions) rather than hardcoded.

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
# Sessions — replace programme_center_id with tag_ids
POST   /api/sessions                            → body includes dimension_value_ids[]
GET    /api/sessions                            → filter by dimension_value_ids[]

# Enrollments — same pattern
POST   /api/enrollments                         → body includes dimension_value_ids[]

# Meta Field Schemas — accept "dimension:{key}" as entity_type
GET    /api/organization/meta-field-schemas/{entity_type}
PUT    /api/organization/meta-field-schemas/{entity_type}
```

### Removed Endpoints

```
/api/centers/*
/api/programmes/*
/api/programme-centers/*
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
├── model.py       # SessionTag, BeneficiaryTag, EnrollmentTag, UserDimensionAccess
├── schemas.py
├── service.py     # Scoping/filtering logic
└── routes.py      # User access endpoints
```

### Removed Module: `app/modules/organization/model.py`

Remove `Center`, `Programme`, `ProgrammeCenter` classes. `Organization` stays.

---

## Migration Path

Since we don't need backward compatibility:

1. Create new migration that:
   - Creates `dimensions`, `dimension_values`, `tag_rules` tables
   - Creates `session_tags`, `beneficiary_tags`, `enrollment_tags` tables
   - Creates `user_dimension_access` table
   - Adds `organization_id` to `sessions` and `enrollments`
   - Drops `programme_center_id` from `sessions` and `enrollments`
   - Drops `centres`, `programmes`, `programme_centers` tables
   - Drops `user_center_access`, `user_programme_access`, `user_session_template_access` tables
   - Updates permission records (remove old, add new)

2. Update seeder (`kshamata.py`) to use dimensions instead of direct table inserts

3. Update all backend modules (routes, services, schemas)

4. Update all frontend pages and components

---

## Kshamata Seeder (New Version)

```python
# Dimensions
DIMENSIONS = [
    ("location", "Location"),
    ("location_type", "Location Type"),
    ("programme", "Programme"),
]

# Dimension Values
DIMENSION_VALUES = {
    "location": [
        ("SHANTISADAN", "ShantiSadan"),
        ("KASTURBA", "Kasturba"),
        ("NAVJEEVAN", "Navjeevan"),
        # ... all 15 locations
    ],
    "location_type": [
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
    ("programme:OUTREACH", "location:SHANTISADAN"),
    ("programme:OUTREACH", "location:KASTURBA"),
    # ...
    ("location:SHANTISADAN", "session_type:LIFE_SKILL_EDUCATION"),
    ("location:SHANTISADAN", "session_type:JOB_READINESS"),
    # ... all valid combinations
}
```

---

## Entity Relationship Summary (New)

```
Organization
  ├── Dimensions
  │     └── DimensionValues (with per-dimension custom fields via meta)
  │           └── TagRules (valid combinations between values)
  ├── SessionTemplates
  ├── Sessions
  │     ├── SessionTags → DimensionValues
  │     ├── Attendance → Beneficiaries
  │     └── SessionFacilitators → Facilitators
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
