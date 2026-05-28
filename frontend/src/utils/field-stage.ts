/**
 * Shared stage-filtering rules for any meta-field-driven form (entity
 * fields, enrollment fields, etc.). Keep both renderers in sync on what
 * "stage" means by going through these helpers.
 *
 * Conventions:
 *   - "create" stage fields appear during create; on edit they stay
 *     visible but disabled (captured-at-creation context).
 *   - "edit" stage fields appear only during edit (filtered out on
 *     create so the form isn't cluttered with disabled placeholders).
 *   - undefined stage means "always".
 */

import type { MetaFieldDefinition } from "@/types";

/**
 * Filters the field list to what should actually render on the form:
 *   - drops fields the admin has marked invisible
 *   - on create: drops stage = "edit" fields
 *   - on edit:   keeps stage = "create" fields (they render disabled
 *     via getStageDisabledKeys)
 */
export function filterVisibleFields(
  fields: MetaFieldDefinition[],
  mode: "create" | "edit",
): MetaFieldDefinition[] {
  return fields.filter((f) => {
    if (f.visible === false) return false;
    if (mode === "create" && f.stage === "edit") return false;
    return true;
  });
}

/**
 * Returns the set of field keys that should render disabled. Only
 * applies to stage = "create" fields on edit — those were captured at
 * creation, so we keep them visible for context but lock editing.
 */
export function getStageDisabledKeys(
  fields: MetaFieldDefinition[],
  mode: "create" | "edit",
): Set<string> {
  const keys = new Set<string>();
  if (mode !== "edit") return keys;
  for (const f of fields) {
    if (f.stage === "create") keys.add(f.key);
  }
  return keys;
}
