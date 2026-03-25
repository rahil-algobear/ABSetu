# ABSetu - Product Requirements Document (Phase 1)

## Overview

ABSetu is a multi-tenant outreach management platform for NGOs. It enables organizations to track beneficiaries, manage programmes across centers, record sessions, and track attendance — replacing spreadsheet-based workflows.

Each NGO can customize what data they capture about beneficiaries, sessions, and other entities using a flexible metadata (meta) system.

---

## Core Entities

### 1. Organization (NGO)

The top-level tenant. All data is scoped to an organization.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| name | String | Required |
| code | String | Unique, short code (e.g., "KBMH") |
| meta | JSONB | Org-specific custom fields |

Entity codes are auto-generated in the format `{ORG_CODE}-{YY}-{SERIAL}` (e.g., "KBMH-26-001"). The serial resets per org per year.

---

### 2. Center

A physical location where programmes are run.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| organization_id | UUID | FK to Organization |
| name | String | Required |
| code | String | Short code, unique within org |
| address | Text | Optional |
| meta | JSONB | Center-specific custom fields |

---

### 3. Programme

A type of intervention (e.g., "Rehabilitation", "Women's Shelter").

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| organization_id | UUID | FK to Organization |
| name | String | Required |
| description | Text | Optional |
| meta | JSONB | Programme-specific custom fields |

**Programme-Center Relationship:**
A programme can run at multiple centers. This is a many-to-many relationship via `programme_centers`.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| programme_id | UUID | FK to Programme |
| center_id | UUID | FK to Center |

---

### 4. Session Template

Defines a type of session (e.g., "IT Classes", "Life Skills Education").

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| organization_id | UUID | FK to Organization |
| name | String | Required (e.g., "IT Classes") |
| description | Text | Optional (e.g., "Basic computer skills training") |
| meta | JSONB | Template-specific custom fields |

---

### 5. Session

An actual occurrence of a session template at a specific center and programme.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| session_template_id | UUID | FK to Session Template |
| programme_center_id | UUID | FK to Programme-Center |
| date | Date | When the session occurred |
| notes | Text | Optional |
| created_by | UUID | FK to User (who recorded it) |
| meta | JSONB | Session-specific custom fields |

**Session-Facilitator Relationship:**
Multiple facilitators can conduct a session. Many-to-many via `session_facilitators`.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| session_id | UUID | FK to Session |
| facilitator_id | UUID | FK to Facilitator |

---

### 6. Facilitator

External people who conduct sessions. No login required.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| organization_id | UUID | FK to Organization |
| name | String | Required |
| contact | String | Phone/email, optional |
| meta | JSONB | Facilitator-specific custom fields |

---

### 7. Beneficiary

The person being served by the NGO.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| organization_id | UUID | FK to Organization |
| code | String | Auto-generated (e.g., "KBMH-26-001"), unique within org |
| name | String | Required — the only guaranteed core field |
| meta | JSONB | All other fields are org-defined (age, education, nationality, address, etc.) |

The `meta` JSONB column is where each NGO stores whatever beneficiary details they need. The Organization entity will define a `beneficiary_fields_schema` (stored in org meta or a separate config) that describes what fields to capture and how to render them in forms.

---

### 8. Enrollment

Links a beneficiary to a programme at a specific center. Tracks admission and release.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| beneficiary_id | UUID | FK to Beneficiary |
| programme_center_id | UUID | FK to Programme-Center |
| admission_date | Date | When enrolled |
| release_date | Date | Nullable — null means still enrolled |
| meta | JSONB | Enrollment-specific custom fields |

A beneficiary can have multiple enrollments (different programmes, or re-enrollment after release).

---

### 9. Attendance

Records a beneficiary's attendance at a specific session.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| session_id | UUID | FK to Session |
| beneficiary_id | UUID | FK to Beneficiary |
| status | String | "present" / "absent" (default: "present") |

**Attendance % Calculation:**
- No frequency configuration needed
- `Attendance % = sessions attended / total sessions held` for a given programme-center + session template + time period
- Calculated at query time, not stored

---

### 10. User (Extended)

The existing `users` table is extended with organization and role associations.

| Field | Type | Notes |
|---|---|---|
| organization_id | UUID | FK to Organization, nullable (super-admin may not belong to one) |
| role_id | UUID | FK to Role |

Users are scoped to specific centers/programmes via `user_center_assignments`.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| user_id | UUID | FK to User |
| programme_center_id | UUID | FK to Programme-Center |

---

### 11. Role & Permissions

Roles are org-defined. Each role bundles a set of permissions.

| Field (Role) | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| organization_id | UUID | FK to Organization |
| name | String | e.g., "Admin", "Field Coordinator" |
| is_default | Boolean | Default role for new users in this org |

| Field (Permission) | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| key | String | e.g., "beneficiary:create", "session:mark_attendance" |
| description | String | Human-readable description |

| Field (RolePermission) | Type | Notes |
|---|---|---|
| role_id | UUID | FK to Role |
| permission_id | UUID | FK to Permission |

**Permission Keys (Phase 1):**

| Key | Description |
|---|---|
| `org:settings` | Manage organization settings |
| `center:view` | View centers |
| `center:manage` | Create/edit/delete centers |
| `programme:view` | View programmes |
| `programme:manage` | Create/edit/delete programmes |
| `session_template:view` | View session templates |
| `session_template:manage` | Create/edit/delete session templates |
| `session:view` | View sessions |
| `session:create` | Create sessions and mark attendance |
| `beneficiary:view` | View beneficiaries |
| `beneficiary:create` | Create beneficiaries |
| `beneficiary:edit` | Edit beneficiary details |
| `enrollment:view` | View enrollments |
| `enrollment:manage` | Create/edit enrollments |
| `facilitator:view` | View facilitators |
| `facilitator:manage` | Create/edit/delete facilitators |
| `user:view` | View users |
| `user:manage` | Manage users and their roles |
| `role:view` | View roles |
| `role:manage` | Create/edit roles and permissions |
| `reports:view` | View reports |
| `reports:export` | Export data (CSV/Excel) |

Frontend checks permission keys (not role names) to determine what to render.

### Permissions Architecture (Built-in from Day 1)

Even though full role management UI is deferred, permissions are enforced from the start to avoid gaps.

**Backend — `require_permissions` dependency:**
```python
# Usage on any route:
@router.post("/", dependencies=[Depends(require_permissions("beneficiary:create"))])
def create_beneficiary(...):

# Multiple permissions (user must have ALL):
@router.delete("/{id}", dependencies=[Depends(require_permissions("beneficiary:edit", "beneficiary:view"))])
```

How it works:
1. `get_current_user` resolves the authenticated user (existing)
2. `require_permissions` loads the user's role → role_permissions → permission keys
3. Checks that the user has all required permission keys
4. Returns 403 if missing

**Frontend — `usePermissions` hook + `<Can>` component:**
```tsx
// Hook — returns permission checker
const { can, permissions } = usePermissions();
if (can("beneficiary:create")) { ... }

// Component — conditionally renders children
<Can permission="beneficiary:create">
  <Button>Add Beneficiary</Button>
</Can>

// Multiple permissions (must have ALL):
<Can permissions={["reports:view", "reports:export"]}>
  <Button>Export</Button>
</Can>
```

How it works:
1. User profile API returns the user's permission keys (resolved from their role)
2. `usePermissions` hook reads from auth context
3. `<Can>` component wraps any UI element that needs permission gating

**Every new route and every new UI action must use these from the start.**

---

## Meta Fields System

Every major entity has a `meta` JSONB column. This enables NGOs to capture custom data without schema changes.

**How it works:**
1. Organization defines a **field schema** per entity type (stored in a `custom_field_definitions` table or within org settings)
2. The schema describes field name, type, required/optional, options (for dropdowns), display order
3. Frontend renders dynamic forms based on the schema
4. Data is stored in the entity's `meta` column

**Supported field types (Phase 1):**
- `text` — free text
- `number` — numeric input
- `date` — date picker
- `select` — dropdown with predefined options
- `multiselect` — multiple choice
- `boolean` — yes/no toggle

**Example schema (beneficiary fields for an NGO):**
```json
[
  { "key": "nationality", "label": "Nationality", "type": "text", "required": true },
  { "key": "age", "label": "Age", "type": "number", "required": true },
  { "key": "education", "label": "Education", "type": "select", "options": ["Illiterate", "Primary", "Secondary", "Graduate"], "required": false },
  { "key": "native_place", "label": "Native Place", "type": "text", "required": false },
  { "key": "contact_no", "label": "Contact No.", "type": "text", "required": false },
  { "key": "current_address", "label": "Current Address", "type": "text", "required": false }
]
```

---

## Key Screens (Mobile-First)

### Navigation
- Bottom tab bar (mobile) / sidebar (desktop)
- Tabs: Home, Beneficiaries, Sessions, More

### 1. Home / Dashboard
- Summary cards: total beneficiaries, active enrollments, sessions this month
- Quick actions: "New Session", "New Beneficiary"
- Scoped to user's assigned centers/programmes

### 2. Beneficiaries
- List view with search and filters (by centre, programme, enrollment status)
- Tap to view profile
- **Profile page:** personal info (from meta), enrollment history, attendance summary
- Add/edit beneficiary form (dynamic fields from meta schema)

### 3. Sessions
- List of sessions grouped by date
- Filter by session template, centre, programme
- **Create session:** pick date, template, centre-programme, assign facilitators
- **Mark attendance:** checklist of enrolled beneficiaries, toggle present/absent

### 4. Reports
- Attendance grid view (similar to the current spreadsheet)
- Rows: beneficiaries, Columns: months
- Filter by session template, programme, centre, date range
- Export to CSV/Excel

### 5. Admin (under "More")
- Manage centers, programmes, session templates, facilitators
- Manage users and roles
- Org settings (case number format, custom field schemas)
- All gated by permissions

---

## Exports (Phase 1)

- CSV and Excel export for:
  - Beneficiary list (with meta fields)
  - Attendance reports (the spreadsheet grid view)
  - Session list
- Scoped to user's permissions (only data they can view)
- PDF deferred to Phase 2

---

## Audit Trail

All entities include:
- `created_at`, `updated_at` (already in BaseModel)
- `created_by`, `updated_by` (UUID FK to User) — to be added to BaseModel or relevant entities

---

## Seeding (Phase 1)

No super admin UI in phase 1. Instead, a **seed script** provisions the first org:

1. Create the Organization (name, code, case number format)
2. Create all Permission records (from the permission keys table above)
3. Create default Roles — "Admin" (all permissions), "Team Member" (scoped permissions)
4. Create the first Admin user (linked to the org + Admin role)

Run via: `make seed` or `python -m app.seeds.initial`

Multi-NGO onboarding / super admin panel deferred to when needed.

---

## Single App, Permissions-Driven

There is no separate admin panel. The frontend is one app — what a user sees is determined entirely by their permissions. An admin and a team member use the same app; the UI adapts based on permission keys.

---

## Out of Scope (Phase 1)

- Super admin panel for managing multiple NGOs
- Assessments, outcomes, referrals tracking
- Offline/PWA support
- PDF exports
- Multi-language UI
- Beneficiary deduplication
- Notifications/alerts
- Beneficiary self-service
- Advanced analytics/dashboards
- Multi-org user access (single user account linked to multiple NGOs with org-switching)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI (Python), SQLAlchemy, Alembic, PostgreSQL |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS, TanStack Query |
| Auth | OTP-based (existing), JWT tokens |
| Storage | AWS S3 (existing) |
| Exports | openpyxl (Excel), csv (stdlib) |

---

## Entity Relationship Summary

```
Organization
  ├── Centers
  ├── Programmes
  │     └── Programme-Centers (many-to-many with Centers)
  │           ├── Sessions
  │           │     ├── Attendance (links to Beneficiaries)
  │           │     └── Session Facilitators (links to Facilitators)
  │           ├── Enrollments (links to Beneficiaries)
  │           └── User Center Assignments (links to Users)
  ├── Session Templates
  ├── Facilitators
  ├── Beneficiaries
  ├── Roles
  │     └── Role Permissions (links to Permissions)
  └── Users
        └── User Center Assignments
```
