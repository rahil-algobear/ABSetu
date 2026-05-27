# Enrollment Lifecycle & Smart Participant Picker

## Goal

Make participant selection in activities aware of enrollment state, so staff
add the right cohort to each session and stop accidentally including
beneficiaries who aren't enrolled (or whose enrollment is future-dated or
expired).

The work splits into three phases. Phase 1 is the foundation — the others
depend on the `is_active` signal it introduces.

---

## Decisions baked in

These are settled — listed up top so the rest of the doc doesn't relitigate.

- **"Enrolled in this activity" means an active enrollment whose dimensions
  exactly match the activity's dimensions.** Enrollment may carry additional
  dimensions the activity doesn't constrain; those don't disqualify.
- **`is_active` is derived from configured date fields, not stored.** Two
  optional date fields can carry a `lifecycle_role` of `"start"` or `"end"`.
  `is_active = (start absent OR value ≤ today) AND (end absent OR value > today)`.
- **Future-dated enrollments are not active** but they get *modified*, not
  duplicated, when the user re-enrolls — shift start to today.
- **`search_select` becomes the canonical participant display type.** The
  checklist variant is retired from the UI (config field stays in the schema
  for future use). `search_select` upgrades to the smart picker at runtime
  when the field's entity type is enrollable *and* the activity has
  dimensions.

---

## Phase 1 — Enrollment lifecycle

### What

A `lifecycle_role` flag on date-type enrollment fields drives a derived
`is_active` boolean on enrollments.

### Form-builder UI (`/admin/meta-fields` → Enrollments tab)

Inside the field modal's **Field Config** section, render a "Lifecycle role"
dropdown when:

- `type ∈ {date, datetime}`
- `activeSection === "enrollment"`
- The field is **base-scoped** (no entity-type filter, no dimension-value
  filter). Otherwise disable with a tooltip explaining why.

```
Lifecycle role  (optional)
┌────────────────────────────────┐
│ None (default)                ▾│
│ Start of enrollment            │
│ End of enrollment              │
└────────────────────────────────┘
Help: "Start makes the enrollment active on/after this date.
       End makes it inactive after this date."
```

Validation: soft warning at save time if another field already has the same
role ("Another field is already marked as start: '<label>'"). Save still
proceeds; backend uses the field with the lowest `sort_order` when computing.

### Backend

- Add `lifecycle_role: Optional[Literal["start", "end"]] = None` to the field
  schema. Stored in the JSONB `fields` array on `meta_field_schemas` — no
  Alembic migration needed.
- Compute `is_active` on `EnrollmentResponse` build:
  - Look up the org's base-scoped enrollment field defs
  - Find ones with `lifecycle_role` set
  - Read values from `enrollment.meta`, apply the rule above
- Return `is_active: bool` as a derived field on `EnrollmentResponse`.

### Seed update

Kshamata's `Date of Admission` → `start`, `Date of Release` → `end`. So
`is_active` becomes meaningful immediately for existing seeded enrollments.

### Frontend type

Add `is_active: boolean` to the `Enrollment` TS interface.

### Open questions

- Should we surface `is_active` visually on the existing entity-detail
  enrollment cards (e.g. a subtle badge or muted styling for inactive)? Could
  be deferred until Phase 3 needs it.

---

## Phase 2 — Delete enrollment from entity detail page

### What

Each enrollment card on the entity detail page gets a delete control.

### UX

- Trash icon next to the existing pencil (top-right of the card)
- Click triggers a confirm dialog ("Delete this enrollment?") — destructive,
  no soft-delete
- On confirm: backend DELETE, invalidate the entity's enrollments query

### Backend

- `DELETE /api/enrollments/{enrollment_id}` — guarded by `enrollment:manage`
- `EnrollmentService.delete` — verifies the enrollment exists in the
  current user's org, hard-deletes the row (cascades drop
  `EnrollmentDimension` rows)
- Returns `{"message": "Enrollment deleted"}` or 404 if missing

### Open questions

- Should existing activity participants that reference this enrollment's
  beneficiary be untouched? Probably yes — participation is independent of
  enrollment record.
- Future-dated enrollments: just delete them outright, or warn? Probably just
  delete; staff intent is clear.

---

## Phase 3 — Smart participant picker

### What

Replace the inline participant section's "Add" experience with a focused
modal/sheet that knows about enrollment state.

### When the smart picker is used

Auto-activated for `entity_list` fields where:

- `entity_type.can_enroll === true`
- The activity has at least one dimension value

Falls back to today's plain `search_select` otherwise (Facilitator lists,
dimensionless activities).

### Picker UX

```
┌─────────────────────────────────────────────────┐
│ 🔍 Search by name…                              │
├─────────────────────────────────────────────────┤
│  [ Enrolled here ]   All beneficiaries          │
├─────────────────────────────────────────────────┤
│ Asha Devi              Enrolled  [✓]            │
│ Priya Sharma           Enrolled  [+ Add]        │
│ Sunita Kumari          Future    [Start & Add]  │
│ Rakesh Bose            Ended     [Re-enroll]    │
│ Vikram Rao             Not enrolled [Enroll &   │
│                                       Add]      │
├─────────────────────────────────────────────────┤
│ No matches? [+ Create new beneficiary]          │  ← contextual
│ [+ Create new beneficiary]                      │  ← sticky bottom
└─────────────────────────────────────────────────┘
```

- **"Enrolled here"** tab (default): beneficiaries with an *active*
  enrollment in the activity's exact dimension scope.
- **"All beneficiaries"** tab: full pool, filterable by search. Each row
  shows enrollment status for *this activity's scope*.
- Per-row action varies by status:

| Status | Button | Backend action |
|---|---|---|
| Active in scope | `[+ Add]` / checkbox | add as participant |
| Future-dated in scope | `[Start now & Add]` | shift existing enrollment's start → today, then add |
| Ended in scope (past end date) | `[Re-enroll & Add]` | create new enrollment with start=today, then add |
| No enrollment in scope | `[Enroll & Add]` | create new enrollment, then add |

- **Create Beneficiary** CTA appears in two places: a sticky bottom button
  (always present) and a contextual no-results variant ("Create 'Sunita
  Kumari'" — uses the search term as the starting name). Opens a modal with
  the Beneficiary entity form + the enrollment fields stacked; one save
  creates entity + enrollment + adds as participant.

- **Mobile**: opens as a full-screen sheet.

### Backend

- New endpoint or extended `/entities/` query that, given an entity type and
  a set of activity dimension values, returns beneficiaries with an
  `enrollment_status` field per row:
  ```
  enrollment_status: "active" | "future" | "ended" | "none"
  existing_enrollment_id?: string  // for "future" / "ended"
  ```
- New endpoint for the smart enroll action: `POST /activities/{id}/participants/enroll`
  that, given a beneficiary id:
  - Determines status (recomputes server-side; client doesn't get to lie)
  - Creates or modifies the enrollment atomically
  - Adds the participant
  - Returns the resulting participant + enrollment

- Edge case: beneficiary has *both* a future and an ended enrollment in
  scope. Prefer modifying the future one — more likely the staff's intent.

### Frontend

- New `EnrollmentAwarePicker` component, opened from the activity participant
  section's "Add" button when activated conditions are met
- Reuses `SearchSelectParticipants` shape for already-added rows displayed
  inline above; modal handles all writes
- Inline beneficiary create form reuses the existing entity create
  components, pre-fills enrollment dimensions from the activity

### Open questions

- "Re-enroll" semantics for ended state: create a new enrollment (current
  proposal) vs. clear the existing one's end date. Probably create new —
  preserves history.
- Picker on activities with multiple participant fields (e.g.
  Beneficiaries + Facilitators): both can open their own pickers; the
  enrollment-aware one only kicks in for the enrollable type.

---

## Execution order

1. Phase 1 (lifecycle + `is_active`) — foundational, unblocks Phase 3
2. Phase 2 (delete enrollment) — small, slot it in while in the same files
3. Phase 3 (smart picker) — biggest piece, builds on Phase 1's signal
