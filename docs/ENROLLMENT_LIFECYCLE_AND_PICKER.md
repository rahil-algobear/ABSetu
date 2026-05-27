# Enrollment Lifecycle & Smart Participant Picker

## Goal

Make participant selection in activities aware of enrollment state, so staff
add the right cohort to each session and stop accidentally including
beneficiaries who aren't enrolled (or whose enrollment has been ended).

The work splits into three phases. Phase 1 is the foundation — Phases 2 and 3
build on the `is_active` signal it introduces.

---

## Decisions baked in

These are settled — listed up top so the rest of the doc doesn't relitigate.

- **`is_active` is an explicit boolean on the enrollment record, not derived
  from date fields.** Staff toggle it via "End enrollment" and "Start again"
  actions. Date fields (Date of Admission, Date of Release, etc.) are pure
  record-keeping — they don't drive business logic.
- **"Enrolled in this activity" means an active enrollment whose dimensions
  exactly match the activity's dimensions.** Enrollment may carry additional
  dimensions the activity doesn't constrain; those don't disqualify.
- **`search_select` is the canonical participant display type.** The
  checklist variant is retired from the UI (config field stays in the schema
  for future use). `search_select` upgrades to the smart picker at runtime
  when the field's entity type is enrollable *and* the activity has
  dimensions.
- **Future-dated admissions are not protected.** If staff create an
  enrollment with a future admission date, it's still active by default until
  they toggle it. Rare workflow; not worth automating.

---

## Phase 1 — Active/Inactive toggle on enrollments

### What

`is_active` becomes a real column on `enrollments`. Staff flip it via
explicit "End enrollment" and "Start again" actions on the entity detail
page. Date fields in the enrollment form remain free-form metadata.

### Backend

**Migration**
- Add `is_active BOOLEAN NOT NULL DEFAULT TRUE` column on `enrollments`.
- All existing rows backfill to `TRUE` (current behaviour: every enrollment
  is considered active).

**Model & schema**
- `Enrollment.is_active` column (server_default true).
- `EnrollmentResponse.is_active: bool`.

**Service**
- Extend `EnrollmentService.update()` to accept `is_active` alongside `meta`,
  so the "end" / "start again" flow can update both atomically in one
  request. No separate status endpoint needed — the existing
  `PUT /enrollments/{id}` carries it.

### Frontend

**Enrollment edit modal**
- The existing edit modal stays the same for editing fields mid-enrollment.
- Add two new modes triggered from the entity detail page:
  - **"End enrollment"** — opens the edit modal pre-loaded with the
    enrollment's current values, with the primary CTA labelled "End
    enrollment". Staff can fill in any pending fields (e.g. Date of Release)
    before confirming. On submit, sets `is_active = false` and saves any
    meta changes in the same call.
  - **"Start again"** — symmetric. Primary CTA labelled "Start enrollment".
    On submit, sets `is_active = true` and saves any meta changes.

**Entity detail enrollment card**
- For active enrollments: pencil (edit) + "End enrollment" button (destructive
  styling, but it's not a delete).
- For inactive enrollments: pencil (edit) + "Start again" button + visual
  treatment (muted text, "Ended" badge, or both — TBD during build).
- Active enrollments listed first, inactive after (or in a collapsed
  section — TBD).

**Type updates**
- `Enrollment.is_active: boolean` in TS.

### Open questions

- Visual treatment for inactive enrollments: muted card + "Ended" pill, vs.
  a separate "Ended enrollments" section below. Decide while building.
- Whether the "End enrollment" CTA is shown only when an active enrollment
  has remained un-edited for a while (avoid accidental ends), or always.
  Default: always visible. Trust the confirm step.

---

## Phase 2 — Delete enrollment from entity detail page

### What

Each enrollment card gets a delete control alongside edit and end/start.

### UX

- Trash icon. Click triggers a confirm ("Delete this enrollment? This can't
  be undone.") — hard delete, no soft-delete.
- On confirm: backend DELETE, invalidate the entity's enrollments query.

### Backend

- `DELETE /api/enrollments/{enrollment_id}` — guarded by
  `enrollment:manage`.
- `EnrollmentService.delete` — verifies the enrollment exists in the
  current user's org, hard-deletes the row (cascades drop
  `EnrollmentDimension` rows).
- Returns `{"message": "Enrollment deleted"}` or 404.

### Open questions

- Existing activity participants that reference this enrollment's beneficiary
  stay untouched. Participation is independent of enrollment record.
- Whether to allow delete on inactive enrollments only (force "end" before
  "delete"), or allow delete from any state. Probably allow from any state —
  staff judgement.

---

## Phase 3 — Smart participant picker

### What

Replace today's inline `SearchSelectParticipants` dropdown for the "Add"
flow on an activity's participant fields with a standalone modal/sheet
that's aware of enrollment scope and lifecycle. One component, conditional
affordances based on the field's entity type and the activity's dimensions.

### When the smart picker is used

The picker is always used (replaces `SearchSelectParticipants` everywhere
an `entity_list` / `user_list` field renders). Its shape adapts:

| Field's entity type | Activity has dimensions? | Picker shape |
|---|---|---|
| Enrollable (e.g., Beneficiary) | Yes | "Smart mode": tabs (Enrolled here / All), per-row status, Enroll & Add, Create new |
| Enrollable | No | "Basic mode": single list, `[+ Add]` per row, Create new |
| Not enrollable (e.g., Facilitator) | Any | "Basic mode": single list, `[+ Add]`, Create new |
| User list | Any | "Basic mode" |

Enrollment-related affordances kick in only when **both** the field's
entity type is enrollable **and** the activity carries at least one
dimension value to scope against.

### Picker UX (smart mode)

```
┌─────────────────────────────────────────────────┐
│ 🔍 Search by name…                              │
├─────────────────────────────────────────────────┤
│  [ Enrolled here ]   All beneficiaries          │
├─────────────────────────────────────────────────┤
│ Asha Devi             Enrolled    [✓ Added]    │
│ Priya Sharma          Enrolled    [+ Add]      │
│ Vikram Rao            Not enrolled [Enroll &   │
│                                       Add]     │
├─────────────────────────────────────────────────┤
│ No matches? [+ Create new beneficiary]         │  ← contextual
│ [+ Create new beneficiary]                     │  ← sticky bottom
└─────────────────────────────────────────────────┘
```

- **"Enrolled here"** tab (default): beneficiaries with an *active*
  enrollment whose dimensions cover the activity's dimensions
  (`activity_dvs ⊆ enrollment_dvs`).
- **"All beneficiaries"** tab: full pool of the entity type, filterable
  by search.
- **Mobile**: full-screen sheet.

### Row states (smart mode — only two)

We deliberately collapsed three states into two. Reactivating an old
inactive enrollment would either keep its stale dates or destroy them; a
new enrollment preserves the old as historical record and starts fresh.

| Status | Button | Behaviour |
|---|---|---|
| Active enrollment in scope | `[+ Add]` (or `[✓ Added]` if already added) | direct API call → adds participant |
| No active enrollment in scope (whether inactive history exists or not) | `[Enroll & Add]` | opens existing EnrollmentForm modal (activity's dimensions pre-locked, status pre-set Active) → save creates new active enrollment + adds participant |

### "Create new beneficiary" flow

CTA appears in two places: contextual when search has no results
(`Create "Asha Devi"` using the typed name as a starting value), and as a
sticky bottom button in the picker.

Opens a **combined modal** with two stacked sections:
- Entity-scoped meta fields for the entity type (e.g. Name, DOB, etc.)
- Required enrollment meta fields (Date of Admission, etc.)

The activity's dimensions are applied to the new enrollment automatically
(not shown as form fields, but surfaced as a read-only "Will enroll in:
Programme=Outreach, Location=ShantiSadan" line at the top of the
enrollment section).

One Save → backend creates entity + creates enrollment + adds as
participant in a single transaction.

### Backend

#### New endpoint — single action dispatcher

`POST /api/activities/{activity_id}/participants` with a tagged
union payload that handles all three actions atomically:

```jsonc
// Active in scope, just add
{ "action": "add", "beneficiary_id": "uuid" }

// No active in scope — create a new active enrollment, then add
{ "action": "enroll_and_add",
  "beneficiary_id": "uuid",
  "enrollment_meta": { ... },        // user-filled required fields
  "enrollment_dimension_value_ids": [ ... ]   // includes activity's dims,
                                              // plus any extras from the form
}

// Brand new beneficiary
{ "action": "create_and_add",
  "entity_meta": { ... },
  "entity_dimension_value_ids": [ ... ],
  "enrollment_meta": { ... },
  "enrollment_dimension_value_ids": [ ... ]
}
```

All three run in a single DB transaction. Validation errors from any step
(required-field misses, Phase 4 composite-key violations, total-cap
violations, scope access denials) bubble up as `ValidationError` /
`ForbiddenError` with the existing inline-error message shape.

#### Listing query — extend `/api/entities/` for picker

Add a `with_enrollment_status_for_activity={activity_id}` query param.
When set, each row in the response includes:

```
enrollment_status: "active_in_scope" | "no_active_in_scope"
```

The check: does the beneficiary have any active enrollment whose
dimensions are a superset of the activity's dimensions? Cleaner SQL than
inferring from lifecycle dates: `is_active=true AND <all activity dvs
present in enrollment_dimensions>`.

For Basic mode (no scope-matching), the field is omitted from the
response.

#### Server-side guard

The backend re-derives the action's correct shape — never trusts the
client's `action` field. If the client sends `add` but the beneficiary
doesn't actually have an active enrollment in scope, server rejects with
a clear message instead of silently dropping the request.

### Frontend

- New component `ParticipantPicker` in `/components/`. Replaces
  `SearchSelectParticipants` wherever it's used (activity create/edit
  pages, activity detail page when adding participants).
- Modal/sheet chrome; Dialog primitive for desktop, full-screen on mobile.
- Smart mode wires up the tabs + per-row status; Basic mode renders just
  the list.
- Per-row "Enroll & Add" reuses the existing `EnrollmentForm` modal,
  opened on top, with `initialIsActive=true` and the activity's dimensions
  pre-locked. On save, the form dispatches `enroll_and_add` to the new
  endpoint instead of the plain enrollment create.
- "Create new" CTA opens a combined modal (entity fields + enrollment
  fields stacked). Save dispatches `create_and_add`.

### Decided (no longer open)

- **Re-Enroll dropped.** Inactive enrollments stay as historical record;
  new active enrollment is always a fresh row. Old data (Date of Release
  etc.) preserved.
- **Atomic single endpoint** over multi-call client orchestration.
- **Activity's dimensions auto-applied** to new enrollments — no dimension
  picker in the create-from-picker flows.
- **Standalone reusable component**, currently invoked only from
  activity surfaces.

### Deferred

- **EntityCreateForm extraction.** Today's create-beneficiary form is
  duplicated between the entity listing page and `SearchSelectParticipants`.
  Phase 3 adds a third instance (the picker's combined modal). A separate
  refactor pass should consolidate all three into a shared component.
- **"Previously enrolled" history badge** on no-active rows. Useful
  context but not needed for v1 — users can check the entity detail page.
- **Phase 4 access edge case** in picker (inactive enrollment in
  unreachable dimensions). Mostly theoretical; if a user encounters a
  403 on the action, surface the inline error and move on.

---

## Phase 3.1 — Per-section edit mode + picker restructure

### What

Today the activity detail page has two modes for participants:

- A **read-only view** with the smart picker button for atomic adds.
- A **global Edit Participants** mode that loads every section into
  the bulk SearchSelectParticipants form for editing or removal.

The all-or-nothing edit mode is heavy and risks clobbering atomic
adds from the picker. Phase 3.1 replaces it with **per-section edit
mode** + a **3-tab picker** that handles the full lifecycle.

### Target shape

**View mode (per section):**
- `+ <Type>` button → opens the picker.
- `Edit` button → enters edit mode for *this section only*.

**Section edit mode:**
- Section becomes the per-row editable table (Name + meta columns
  + `✕` remove icon per row).
- Search input at the top of the section — client-side filter over
  the loaded rows.
- `Save` / `Cancel` at the bottom — section-scoped bulk save.
- **No `+ Add` here.** User exits edit mode to add via the picker.
  Deferred picker-in-edit-mode noted below; ship simpler v1 first.
- Other sections stay read-only while one section is in edit mode.

**Picker (3 tabs):**
- `Added (N)` / `Enrolled (N)` / `All (N)` — default `Enrolled`.
- `Enrolled` is the actionable cohort — currently-enrolled
  beneficiaries with active enrollment in scope.
- `Added` shows currently-added participants (informational
  context; remove still happens via section edit mode).
- `All` requires search input before showing rows — no top-50
  default fetch. Empty state: "Type to search…".
- Counts reflect absolute totals when search is active; the visible
  list is filtered.
- Server-side search via existing `entityApi.listPaginated`.
- `Added` tab uses parent-supplied participant data (no separate
  fetch).

**Search normalization:** searching for `"auto test"` should match
`"Auto-Test Beneficiary 48"`. Backend search currently does a literal
ILIKE that gets tripped by hyphens, slashes, etc. Phase 3.1 normalizes
both the search term and the stored value (strip non-alphanumerics,
lowercase, then ILIKE) before matching. Applied to the meta field
search columns used by the picker — narrow scope, no full-text-search
infrastructure needed yet.

**Pagination & sort per tab:**

| Tab | Pagination | Sort | Rationale |
|---|---|---|---|
| Added | None — show all | `created_at` ascending (order they were added) | Matches the existing per-row table; small bounded set (a session typically has 5–80 added) |
| Enrolled | None — show all (lift the existing `limit: 50` cap) | First meta string (name) ascending | Browsable cohort; staff scan for a name; cohort size is bounded by the activity's scope |
| All | Paginated (server default `limit: 50`) | First meta string ascending | Search-driven; user is looking for a specific person, not scrolling a roster |

The `Enrolled` query passes `sort_by=meta:<first_text_field_key>` (the entity type's first meta field, typically a name) so the cohort scans in a useful order rather than created-at-desc. Same applies to `All`.

### What's gone

- The global `Edit Participants` CTA at the top of the participants
  card.
- The current `POST /activities/{id}/participants` bulk-replace
  endpoint — replaced by a section-scoped variant.
- `SearchSelectParticipants` usage on the activity detail page.
  (Still in use on the activity create page until Phase 3.2 below.)

### Backend

**`PUT /activities/{id}/participants?section_key=<key>`**
- Replaces just that section's participants with the submitted set.
- Body: `{ records: [{ participant_id, status?, meta? }] }`.
- Single transaction; conflicts with concurrent picker adds resolved
  by last-writer-wins (acceptable for typical NGO scale).

### Frontend

- Each section in the participants card gets an `Edit` button.
- Section edit mode renders the existing per-row table from
  SearchSelectParticipants, lifted into the activity page.
- Search input filters the table client-side.
- `✕` icon per row marks for removal (local state; flushed on Save).
- Save calls the section-scoped endpoint, refreshes the participants
  query, exits edit mode.

### Picker for non-smart sections

The picker is the inline `+ <Type>` button on every entity_list /
user_list section. Smart mode (3 tabs + Enroll & Add + Create new)
applies only when the section's entity type is enrollable AND the
activity carries dimensions. Other sections still get a picker — just
a slimmer one.

| Section kind | Tabs | Row actions | Create new |
|---|---|---|---|
| Smart entity (enrollable + activity has dims) | Added / Enrolled / All | `+ Add` for active-in-scope, `Enroll & Add` otherwise | Yes (combined entity + enrollment modal) |
| Basic entity (non-enrollable OR no activity dims) | Added / All | `+ Add` directly | Deferred — defer to the regular entity-create page |
| User (`user_list` section) | Added / All | `+ Add` directly | No — admins manage users via the user-admin page |

User-section adds reuse the same `POST /activities/{id}/participants/add`
endpoint with `participant_type=user` (default `entity`). The endpoint
skips entity/enrollment scope checks for user rows.

### Open questions

- Permission key for the section-scoped bulk endpoint — reuse
  `activity:create` (consistent with current bulk endpoint), or
  split out `activity:participant:manage`? Reuse for v1.
- For meta cells with `capture_status`: lean optimistic update? In
  edit mode, all changes are local until Save fires — no optimism
  question. The picker's atomic adds are already optimistic via
  query invalidation.

### Deferred — Phase 3.2

Make the activity create page route through the picker too. Shape:
create activity in one step, then participants get added via picker
against the new id. Retires the bulk-save endpoint entirely.

### Deferred — picker-in-edit-mode

For v1 the `+ <Type>` button is hidden while a section is in edit
mode. If user needs to add a new participant mid-edit, they
Save/Cancel first. If user feedback shows this is annoying enough
to fix:

- Picker stays atomic (fires the backend write immediately).
- Edit mode subscribes to the participants query; when it refreshes,
  reconciles server data with the user's pending dirty meta edits
  (preserve user edits on existing rows; add new server rows with
  empty meta for the user to fill).
- Standard "form local state vs. server query" pattern — not hard,
  just unnecessary scope for v1.

### Deferred — picker placeholder for unsupplied enrollment dims

In the picker's `Enroll & Add` and `Create new` flows, if the
enrollment form-builder tracks a dimension the activity *doesn't*
supply, the field currently renders a small italic placeholder
("configure via the entity detail page") rather than a cascading
dimension select. Rare in practice (the enrollment usually tracks a
subset of activity dims, not extras) — fix by building a proper
inline dimension picker when an org hits the case.

### Deferred — Phase 3.2

- Make the activity create page route through the picker too. The
  shape: create activity in one step, then participants are added via
  picker against the new id. Eliminates the last remaining caller of
  the bulk-save endpoint.

### Deferred — Required-field validation cleanup

Required-field validation against a meta-field schema is currently
re-implemented in several places with subtly different code paths:

- `enrollment/routes.py:create_enrollment` — server validation when
  creating an enrollment directly.
- `EnrollmentForm` (entity detail page) — client validation before
  enrollment create/update.
- `EnrollAndAddModal` and `CreateAndAddModal` (smart picker) — each
  re-runs its own version against its slice of fields.
- Activity create/edit paths likely have similar patterns.

Worth extracting a single backend helper (`validate_required_fields(
field_defs, values)`) and a matching client-side hook. Touches a few
files but the behaviour change is nil — purely a "one place to fix
required-field semantics" win. Schedule when one of these surfaces
needs a real behavioural change.

---

## Phase 4 — Configurable enrollment limits

### What

Per-entity-type and per-field caps on active enrollments, so NGOs with
varied workflows (residential rehab → 1 active, online learning → 1
total, multi-centre outreach → 1 per Location) can encode their rules
without code changes. Replaces today's hardcoded "block exact-dimension
duplicates" rule with a configurable model.

### Schema

**EntityType (new column):**
```
max_active_enrollments INTEGER NULL  -- total cap per beneficiary
                                     -- null = unlimited
```

**Form field, dimension type, enrollment scope (new field config):**
```
max_active_enrollments INTEGER NULL  -- per-value cap on this dimension
                                     -- null = field not part of the
                                     -- uniqueness key
```

Stored alongside other field config in the JSONB `fields` array — no
migration for the field-level setting.

### Composite-key (AND) semantics

When multiple form fields have `max_active_enrollments` set, they form a
**composite uniqueness key**. The check operates on the combined key,
not each field independently:

1. Build the composite key from the incoming enrollment's values for
   every dimension field with `max_active_enrollments` set.
2. Count active enrollments for this entity that match the **full
   composite key**.
3. If the count would exceed the cap, reject.

**Cap when multiple maxes are set:** use `min(maxes)` — the strictest
field wins. Documented as "set all key fields to the same max; mixed
values default to the strictest." Single-field cases use that field's
max directly.

### Validation flow

On enrollment **create** and on **transition from inactive → active**:

1. **Total cap check** (if `entity_type.max_active_enrollments` is set):
   count entity's active enrollments. If would exceed, reject.
2. **Composite-key check** (if any dimension field on the incoming
   enrollment has `max_active_enrollments` set): build composite key,
   count matching active enrollments, reject if would exceed
   `min(maxes)`.

Either rule can fire independently. Update flow must re-run both checks
on the inactive→active transition — otherwise staff could bypass the
limit by ending one enrollment and activating a previously-inactive one.

### Error messages

Distinct, actionable text per rule:

- Total cap: *"Sunita Devi already has 1 active enrollment. End an
  existing one first."*
- Composite key (Kshamata-style): *"An active enrollment with
  Programme=Outreach, Location=Mumbai already exists for this
  beneficiary."*

Both surface via the existing `err.response.data.message` toast pipeline.

### Admin UI

**Entity-types modal (existing, extended):**
```
☑ Enable Enrollments

  Max active enrollments per beneficiary
  ┌────────────────┐
  │ Unlimited     ▾│   ← Unlimited / 1 / 2 / 3 / Custom...
  └────────────────┘
```

**Form-builder modal (existing, extended) — dimension fields under
Enrollments tab:**
```
Type: Dimension (selected)
Dimension: Programme
...

Active enrollment cap   (optional)
┌────────────────┐
│ No limit      ▾│   ← No limit / 1 / 2 / 3 / Custom...
└────────────────┘
Help: "Limit how many active enrollments can share the same value of
       this field. If multiple fields are capped, they form a combined
       uniqueness key."
```

Only renders when:
- `activeSection === "enrollment"`
- `type === "dimension"`

### Behaviour examples

Kshamata sets `max=1` on both Programme and Location:
- (Outreach, Mumbai) blocks (Outreach, Mumbai) ✓
- (Outreach, Mumbai) allows (Outreach, Delhi) ✓ (different combined key)
- (Outreach, Mumbai) allows (Literacy, Mumbai) ✓

Online-only NGO sets `max=1` on `EntityType.max_active_enrollments`,
no dimension fields configured:
- Beneficiary can hold at most 1 active enrollment ever, regardless of
  dimensions ✓

Multi-centre outreach sets `max=1` on Location only:
- (Outreach, Mumbai) blocks (Literacy, Mumbai) ✓ (same Location)
- (Outreach, Mumbai) allows (Outreach, Delhi) ✓

### Lenient enforcement

Rules apply to **new writes only**. Existing data that doesn't comply
(if rules are tightened later) stays as-is until staff clean it up. No
"prevent saving the rule unless data complies" gate.

### Deferred — captured but not building

- **Per-value count with non-uniform maxes across multiple key fields.**
  We accept the `min(maxes)` rule for v1; if any org has a legitimate
  mixed-max use case it can surface later.
- **Date-overlap validation** ("no two active enrollments whose
  start/end ranges overlap"). Requires a `lifecycle_role` flag on date
  fields — the very concept Phase 1 explicitly dropped in favour of the
  explicit `is_active` toggle. Defer until an NGO presents the case.
- **Composite uniqueness across non-dimension fields** (e.g., "unique
  by Programme + a date field"). Overkill for v1; revisit if asked.
- **Strict enforcement** (reject saving a tighter rule when existing
  data violates it). Lenient first; if it causes problems we add the
  pre-check.

---

## Execution order

1. **Phase 1** — `is_active` column, end/start UX, edit-modal reuse.
   Foundational, unblocks Phase 3.
2. **Phase 2** — delete enrollment. Small, slot it in while in the same
   files as Phase 1.
3. **Phase 3** — smart picker. Builds on Phase 1's signal.
4. **Phase 3.1** — consolidate participant edit/view states on the
   activity detail page. Builds on Phase 3.
5. **Phase 3.2 (deferred)** — extend picker flow to the activity create
   page, retire bulk participant save.
6. **Phase 4** — configurable enrollment limits. Independent of
   Phase 3 — can land before or after the picker.
