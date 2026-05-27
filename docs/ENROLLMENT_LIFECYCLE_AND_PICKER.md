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

Replace the inline participant section's "Add" experience for enrollable
entity types with a focused modal/sheet that knows about enrollment state.

### When the smart picker is used

Auto-activated for `entity_list` fields where:

- `entity_type.can_enroll === true`
- The activity has at least one dimension value

Falls back to today's plain `search_select` otherwise.

### Picker UX

```
┌─────────────────────────────────────────────────┐
│ 🔍 Search by name…                              │
├─────────────────────────────────────────────────┤
│  [ Enrolled here ]   All beneficiaries          │
├─────────────────────────────────────────────────┤
│ Asha Devi              Enrolled  [✓]            │
│ Priya Sharma           Enrolled  [+ Add]        │
│ Rakesh Bose            Ended     [Re-enroll]    │
│ Vikram Rao             Not enrolled [Enroll &   │
│                                       Add]      │
├─────────────────────────────────────────────────┤
│ No matches? [+ Create new beneficiary]          │  ← contextual
│ [+ Create new beneficiary]                      │  ← sticky bottom
└─────────────────────────────────────────────────┘
```

- **"Enrolled here"** tab (default): beneficiaries with an active enrollment
  in the activity's exact dimension scope.
- **"All beneficiaries"** tab: full pool, filterable by search. Each row
  shows enrollment status for this activity's scope.

| Status | Button | Backend action |
|---|---|---|
| Active in scope | `[+ Add]` / checkbox | add as participant |
| Inactive in scope | `[Re-enroll & Add]` | flip existing enrollment to active, then add |
| No enrollment in scope | `[Enroll & Add]` | create new enrollment (active), then add |

- **Create Beneficiary** CTA in two places: sticky bottom (always present)
  and contextual no-results variant ("Create 'Asha Devi'" — uses the search
  term as the starting name). Opens a modal with the Beneficiary entity form
  + enrollment fields stacked; one save creates entity + enrollment + adds
  as participant.

- **Mobile**: full-screen sheet.

### Backend

- New endpoint or extended `/entities/` query that, given an entity type and
  the activity's dimension values, returns beneficiaries with an
  `enrollment_status` per row:
  ```
  enrollment_status: "active" | "inactive" | "none"
  existing_enrollment_id?: string  // for "active" / "inactive"
  ```
- New endpoint for the combined enroll + add action:
  `POST /activities/{id}/participants/enroll` that, given a beneficiary id:
  - Determines status server-side (no client trust)
  - Creates or reactivates the enrollment atomically
  - Adds the participant
  - Returns participant + enrollment

- Cleaner SQL than the lifecycle-derived version: filter on
  `enrollments.is_active = true AND <dimension exact match>` directly.

### Frontend

- New `EnrollmentAwarePicker` component, opened from the activity participant
  section's "Add" button when activation conditions are met.
- Inline beneficiary create form reuses the entity create components,
  pre-fills enrollment dimensions from the activity.

### Open questions

- "Re-enroll & Add" semantics: just flip `is_active` back to true on the
  existing enrollment, vs. create a fresh enrollment record. Probably flip
  the existing one — preserves history and continuity.
- Picker for activities with multiple participant fields (Beneficiaries +
  Facilitators): both can open their own pickers; the enrollment-aware
  variant only kicks in for the enrollable type.

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
4. **Phase 4** — configurable enrollment limits. Independent of
   Phase 3 — can land before or after the picker.
