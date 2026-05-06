# Dimensions vs Tags — Design Thinking

> **Status:** Open question. Not a decision. Capture for later thinking.

## Question

Should "Tags" be a separate concept from "Dimensions," or are they the same thing?

Original plan: Dimensions for access control, Tags for everything else (filtering, reporting, categorization).

Current instinct: they may be structurally identical, and maintaining two parallel taxonomies is duplicative.

---

## What exists today

Only `dimensions` exists. There is no `tags` table.

Schema (see `backend/app/modules/dimension/model.py`):

- `dimensions` — org-scoped grouping axis (name, key, sort_order, is_system)
- `dimension_values` — values within a dimension (name, code, sort_order, meta)
- `dimension_value_links` — cross-value compatibility rules (which values are valid together)
- `activity_dimensions`, `entity_dimensions`, `enrollment_dimensions` — M2M attach to entities
- `user_dimensions` — M2M to users for access scoping

Dimensions in this codebase do a lot more than tagging:

1. **Replaced first-class entities.** Centre, Programme, ProgrammeCenter were removed in favour of dimensions (`docs/GENERIC_ARCHITECTURE.md`). Dimensions are the structural taxonomy of the org.
2. **Encode cross-value rules** via `DimensionValueLink` — e.g. "Programme:Outreach is valid at Location:ShantiSadan", replacing both `programme_centers` and the old `CENTRE_INTERVENTIONS` map.
3. **Drive access** via `UserDimension` (replaced `user_center_access`, `user_programme_access`, `user_session_template_access`).
4. **Drive form rendering.** Form layouts can include `{type: "dimension", dimension_id: "...", display_type: "dropdown"}` (`docs/META_FIELDS_CONSOLIDATION.md`).
5. **Drive reporting.** `DimensionBreakdownChart`, attendance matrix filtering (`docs/ATTENDANCE_REPORTING_MODULE.md`).
6. **Have system-managed variants.** `is_system = "activity_type"` syncs values from the `activity_types` table.
7. **Have their own meta fields.** `DimensionValue.meta` (JSONB).

---

## The case for unifying (Tags = Dimensions)

- Schema is identical: org-scoped, grouped, M2M to entities.
- Avoids two parallel admin UIs, two query paths, two attach mechanisms.
- A "tag" is just a dimension value where the dimension happens to have looser governance.
- All the existing infrastructure (form rendering, reporting, list filtering) already works for any dimension — it would automatically work for tags too.

## The case for keeping them separate

- **`DimensionValueLink` only makes sense for governed, low-cardinality axes.** "Programme runs at Location" is a curated rule space. If "vegetarian" tags can also participate in links, the rule space explodes.
- **`UserDimension` currently treats every value as access-eligible.** If a tag like "needs_translator" lands in the same table, an admin could accidentally scope a user by it and break their data view.
- **Cardinality differs.** Structural dimensions tend to be ~5 axes × ~10 values per org. Tag systems can balloon to hundreds. Current settings UI (tab-per-dimension) wouldn't scale.
- **Governance differs.** Dimensions are admin-managed with codes, sort orders, link rules. Tags are typically lightweight, inline-creatable.
- **Mental model for users.** "Programme" feels different from "vegetarian." Lumping them together in one UI may confuse admins about which labels gate access.

---

## Candidate design: unify the table, differentiate the role

Keep one schema. Make the *role* of each dimension explicit on the parent row.

Proposed flags on `dimensions`:

| Flag | Purpose |
|------|---------|
| `controls_access: bool` | Server-side enforcement: only dimensions with this flag can have values assigned via `UserDimension`. |
| `participates_in_links: bool` | Only true for structural axes. Gates what can appear in `DimensionValueLink`. |
| `value_creation: 'admin' \| 'inline'` | Admin-only (dimension-like) vs inline-creatable from entity forms (tag-like). |
| `cardinality: 'single' \| 'multi'` | Some axes are exactly-one-per-entity (Project); tags are typically many. |
| `is_system: string \| null` | Already exists. Synced from a concrete table (e.g. `activity_type`). |

Settings UI then presents two views over the same table:
- **Structural dimensions** — `controls_access` and/or `participates_in_links`, admin-managed.
- **Tags** — inline-creatable, multi-select, no link rules, no access semantics.

Same data, different governance and affordances.

---

## Risks / open questions

1. **Server-side enforcement.** If `UserDimension` accepts any `dimension_value_id`, the unification leaks. Need a check at write time that the parent dimension has `controls_access=true`. Same for `DimensionValueLink` and `participates_in_links`.
2. **Existing seeders and code paths.** `is_system="activity_type"` syncing, `PROGRAMME_ACTIVITY_TYPES` map, `_remove_stale_programme_at_links()` — all assume structural dimensions. Need to confirm none of them inadvertently apply to tag-like rows.
3. **Form rendering.** META_FIELDS_CONSOLIDATION already treats dimensions as one of three element types with a `display_type`. Tags would likely want a chip-picker `display_type` and possibly a "create new" affordance — minor extension, not architectural.
4. **Migration story.** If we add the flags, what defaults? Existing dimensions are all structural — `controls_access=true`, `participates_in_links=true`, `value_creation='admin'`, `cardinality='multi'` (current behaviour). New "tag" rows opt into the looser settings.
5. **Naming.** If unified, what do we call the concept in the UI? Probably keep "Dimensions" as the underlying name and surface "Tags" as a UI category, since "Dimension" already has product meaning across reports/forms.
6. **Reporting.** Tag-based breakdowns probably want different defaults than dimension breakdowns (e.g. top-N instead of all values). Worth thinking about, not a blocker.

---

## Simpler alternative (worth weighing)

Just add `controls_access: bool` and call it a day. Don't model `participates_in_links`, `value_creation`, `cardinality` upfront.

- **Pro:** smallest possible change. Lets us see if the simpler model holds before adding knobs.
- **Con:** without `participates_in_links` and `cardinality`, you'll either constrain all dimensions to behave the same way or end up special-casing structural ones in code anyway. Retrofitting flags onto a populated table later is more work than adding them now.

---

## Decision criteria (for later)

- How many tag-like axes do real orgs want, and how do they differ from structural ones?
- Will tags need to participate in any inter-value rules, or are they always flat?
- Do we need inline tag creation from entity forms, or is admin-managed fine?
- Does the Settings UI become unwieldy if everything is one list?

Revisit once we have a concrete tag use case from a partner org.
