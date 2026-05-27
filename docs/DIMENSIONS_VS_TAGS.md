# Dimensions vs Tags — Design Thinking

> **Status:** Decision A (add `controls_access` flag to dimensions) is **landed**.
> Whether to introduce a separate Tags module — or eventually rename Dimensions to Tags — is **still pending**. See "Still Open" below.

---

## Question

Should "Tags" be a separate concept from "Dimensions," or are they the same thing?

Original plan: Dimensions for access control, Tags for everything else (filtering, reporting, categorization).

Brainstorm explored two paths:

- **Path A — Unify.** One table, one role flag (`is_dimension` / `controls_access`) distinguishes structural axes from tag-like ones. Eventually rename Dimensions → Tags in code and UI.
- **Path B — Separate modules.** Keep Dimensions as the structural taxonomy. Build Tags as a distinct module (different schema, different UX placement) when a concrete free-form labeling use case arrives.

We have **partially committed to Path A's first step** (the flag) without committing to the rename or to which path wins long-term.

---

## What shipped (Decision A)

Implemented in commits `409062c..ce30c32`.

### Schema

- New column on `dimensions`: `controls_access: bool, default=True, server_default=true()`.
- Migrations: `t4u5v6w7x8y9_add_is_dimension_to_dimensions` then `u5v6w7x8y9z0_rename_is_dimension_to_controls_access`.
- Existing dimensions backfilled to `controls_access=true` — no behaviour change for current data.

See `backend/app/modules/dimension/model.py:28`.

### Backend guards

- **`UserDimensionAccessService.update_access`** rejects values whose parent dimension has `controls_access=false`, raising `ValidationError`. Tag-like axes are silently ineligible from the user-access editor.
- **`UserDimensionAccessService.get_access_value_ids`** filters out values whose parent dimension no longer controls access. If an admin flips a dimension from access-control to tag-like, existing `UserDimension` rows for its values stop granting/restricting access — they become dead data until cleaned up, but are preserved so flipping the dimension back restores the restriction. Read-time filtering, not destructive cleanup.
- **`DimensionValueLinkService` is intentionally not guarded.** Link rules are open to any axis pair regardless of `controls_access`. This is what makes Sub-Intervention (a tag-like dimension) able to cascade from its parent Intervention. See the comment at `backend/app/modules/dimension/service.py:153`.

### Frontend

- **Manage Dimensions page** (`frontend/src/app/admin/manage-dimensions/page.tsx`): checkbox "Use for access control" with help text on the create/edit modal; new "Access Control" column on the list showing Yes/No badge.
- **Users page** (`frontend/src/app/admin/users/page.tsx`): the access editor and table columns filter to `controls_access=true` dimensions only. Defence in depth on top of the backend guard.
- **DimensionMatrixDialog**: chip click hides/shows axes in the matrix — orthogonal QoL, not strictly part of this change.
- `Dimension` type in `frontend/src/types/index.ts` gets the new field.

### Seeder

Kshamata seeder now creates a **Sub-Intervention** dimension with `controls_access=false`:

- Lives alongside the existing `intervention` dimension.
- Each sub-intervention value (e.g. *Individual Counseling*, *Group Counseling*, *DMT*) has explicit `DimensionValueLink` rows to:
  - its parent Intervention (e.g. *Mental Health*),
  - `Programme:Transformation`,
  - `Location:Thane` (so cascade dropdowns populate).
- Seeder safeguard keeps `controls_access=false` on re-seed, even if an admin flipped it in the UI between runs.

This is the first real-world tag-like axis in the codebase. It validates that the flag does what we need.

---

## Design decisions captured

These were resolved during the brainstorm and are baked into what shipped. Worth recording so we don't relitigate.

### One flag, not three

The original doc proposed `controls_access`, `participates_in_links`, `value_creation`, `cardinality` as separate knobs. We collapsed to **one flag** (`controls_access`) because:

- The three behaviours don't cluster the way the doc assumed. Sub-Intervention is `controls_access=false` *but needs link rules* — it cascades from Mental Health. Bundling "access" and "links" into one flag would have blocked this case.
- Solution: keep `controls_access` for the access gate, and **don't gate links at all**. Link rules are admin-discipline, not schema-enforced. The "rule space explosion" worry from the doc is theoretical; in practice admins create the rules they need.
- `cardinality` (single vs multi) isn't enforced in the codebase today and has no real bug. YAGNI.
- `value_creation` (admin vs inline) becomes relevant only when a real tag-creation-from-entity-form UX exists. Defer.

### Stale access rows: filter, don't delete

When `controls_access` flips false on a dimension, existing `UserDimension` rows for its values become semantically inert. We treat them as dead data at read time (filtered out in `get_access_value_ids`) rather than deleting them on the flip.

Reason: preserves admin intent. If the admin flips the dimension back, the original access restrictions return automatically. A destructive cleanup would force re-entry.

### Link rules open to any axis pair

`DimensionValueLink` accepts any two dimension values regardless of `controls_access`. This enables Sub-Intervention cascade and any future tag-like axis that needs cascade behaviour. If misuse becomes a problem (admins linking free-form tags carelessly), add a guard later — but the failure mode is admin error, not a schema bug.

---

## Still open

### The rename question — separate module vs collapse to Tags

We have not decided whether dimensions and tags should ultimately be **one concept** or **two**.

**Path A: rename Dimensions to Tags everywhere.**

- `dimensions` → `tag_types`, `dimension_values` → `tags`, etc.
- `controls_access` becomes the flag that distinguishes "structural tags" from "free-form tags."
- Pros: single mental model, single CRUD surface, cleaner naming ("Tag" is universally understood; "Dimension" is jargon).
- Cons: invasive mechanical rename across backend, frontend, API routes, permissions, seeders, docs. Doesn't change reporting capability — only cognitive overhead.

**Path B: keep Dimensions, add a separate Tags module later when needed.**

- Dimensions stay as the structural module (Programme, Location, Intervention, Sub-Intervention, etc., each with `controls_access` either true or false).
- Tags module gets built fresh when a real free-form labeling use case arrives — likely a different schema (possibly flat, no parent grouping), inline-creatable, no link rules, no access semantics.
- Pros: respects the genuine UX difference — dimensions go at the **top** of activity forms with cascading required dropdowns, tags would go at the **bottom** as optional chip-pickers added after the fact. Admins think differently about "defining a new axis" vs "labelling a record." Two modules let each have UX, lifecycle, and governance that fits its role.
- Cons: two CRUD surfaces in settings (probably desirable for clarity, not actually a cost); two attachment-table patterns when Tags lands.

**Where we leaned in the brainstorm:** Path B looked stronger by the end. The argument: when a field worker creates a session and picks Location / Intervention / Programme, those aren't tags — they're the structural coordinates of the record. Tagging is something you do *after*, optionally. Forcing both into one model means the `controls_access` flag ends up doing UI layout work (top-of-form vs bottom-of-form rendering), which is a smell.

**Not decided yet** because Path B's case rests on a concrete free-form labeling use case that hasn't shown up in the codebase. The Kshamata dashboard indicators (`docs/...`) are all served by dimensions today. Until a real "this should be a tag, not a dimension" requirement arrives, the question stays open.

### Triggers for picking a path

Revisit when any of these happens:

1. A partner org needs **inline tag creation from an entity form** (admin doesn't pre-define values; users add new labels as they go). This is a clear "Tags module needed" signal — dimensions are admin-curated.
2. The Manage Dimensions settings page **becomes unwieldy** because too many `controls_access=false` axes pile up alongside structural ones.
3. We need **tags on activity_types** for reporting rollups (e.g. "Psychological Care" as a category bucket over 7 interventions). This pushes toward either a parent_id on dimension_value (within the existing module) or a separate Tags module that can attach to activity_types.
4. Reporting requires a **distinct "free-form filter" UX** at the bottom of list pages that doesn't fit the current dimension-as-filter pattern.

Until then, every new axis is added as a dimension — with `controls_access=true` if it gates access, `false` if it's structural-but-tag-like (Sub-Intervention is the reference example).

---

## Historical reference

The original doc proposed multiple flags (`participates_in_links`, `value_creation`, `cardinality`) and a unified-but-role-flagged design. The brainstorm landed on a simpler version: one flag, links left open, and the rename question explicitly deferred. The richer design remains an option if multi-flag governance becomes necessary — start by splitting `participates_in_links` off from `controls_access`, since that's the most likely first divergence.

The doc previously also referenced an `is_system` column on dimensions that was never actually built (`is_system` exists only on `roles`). That reference has been removed.
