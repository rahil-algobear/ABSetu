import { MetaFieldDefinition, MetaFieldSchemaItem } from "@/types";

/**
 * Find a single schema item matching scope criteria.
 *
 * Each scope field in criteria is compared if present; fields not specified
 * in criteria are not required to match. This allows:
 * - { dimension_value_id } → matches schemas with that value (regardless of dimension_id)
 * - { dimension_id } → matches schemas scoped to all values of that dimension
 * - { dimension_id, dimension_value_id } → matches schemas with both
 */
export function findSchema(
  schemas: MetaFieldSchemaItem[],
  criteria: {
    type: string;
    entity_type_id?: string | null;
    dimension_id?: string | null;
    activity_type_id?: string | null;
    dimension_value_id?: string | null;
  },
): MetaFieldSchemaItem | undefined {
  return schemas.find((s) => {
    if (s.scope.type !== criteria.type) return false;
    if ((s.scope.entity_type_id || null) !== (criteria.entity_type_id || null)) return false;
    if ((s.scope.activity_type_id || null) !== (criteria.activity_type_id || null)) return false;
    if ((s.scope.dimension_value_id || null) !== (criteria.dimension_value_id || null)) return false;
    if ((s.scope.dimension_id || null) !== (criteria.dimension_id || null)) return false;
    return true;
  });
}

/**
 * Get fields for a single scope, or empty array if not found.
 */
export function getFieldsForScope(
  schemas: MetaFieldSchemaItem[],
  criteria: {
    type: string;
    entity_type_id?: string | null;
    dimension_id?: string | null;
    activity_type_id?: string | null;
    dimension_value_id?: string | null;
  },
): MetaFieldDefinition[] {
  return findSchema(schemas, criteria)?.fields || [];
}

/**
 * Deduplicate fields by key, keeping the last occurrence (more specific scope wins).
 */
function dedupeByKey(fields: MetaFieldDefinition[]): MetaFieldDefinition[] {
  const seen = new Map<string, MetaFieldDefinition>();
  for (const f of fields) {
    seen.set(f.key, f);
  }
  return Array.from(seen.values());
}

/**
 * Build a map of dimension_value_id → dimension_id by looking at schemas.
 */
function buildDvToDimMap(schemas: MetaFieldSchemaItem[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const s of schemas) {
    if (s.scope.dimension_value_id && s.scope.dimension_id) {
      map[s.scope.dimension_value_id] = s.scope.dimension_id;
    }
  }
  return map;
}

/**
 * Extract unique dimension IDs from dimension value IDs.
 */
function resolveDimensionIds(
  dvToDim: Record<string, string>,
  dimensionValueIds: string[],
): string[] {
  const dimIds = new Set<string>();
  for (const dvId of dimensionValueIds) {
    const dimId = dvToDim[dvId];
    if (dimId) dimIds.add(dimId);
  }
  return Array.from(dimIds);
}

/**
 * Collect all applicable activity meta fields for a given activity type + dimension values.
 * Returns fields from: type-only, dv-only, dim-only, and type+dv scopes.
 * Fields are deduplicated by key — more specific scopes override broader ones.
 */
export function collectActivityFields(
  schemas: MetaFieldSchemaItem[],
  activityTypeId: string | null,
  dimensionValueIds: string[],
): MetaFieldDefinition[] {
  const fields: MetaFieldDefinition[] = [];
  const dvToDim = buildDvToDimMap(schemas);

  // Base scope: all activities (no activity_type, no dimension_value)
  fields.push(...getFieldsForScope(schemas, { type: "activity" }));

  if (activityTypeId) {
    fields.push(...getFieldsForScope(schemas, { type: "activity", activity_type_id: activityTypeId }));
  }

  // Dimension-level scopes (all values of a dimension)
  const dimIds = resolveDimensionIds(dvToDim, dimensionValueIds);
  for (const dimId of dimIds) {
    fields.push(...getFieldsForScope(schemas, { type: "activity", dimension_id: dimId }));
    if (activityTypeId) {
      fields.push(...getFieldsForScope(schemas, {
        type: "activity",
        activity_type_id: activityTypeId,
        dimension_id: dimId,
      }));
    }
  }

  // Dimension value specific scopes
  for (const dvId of dimensionValueIds) {
    const dimId = dvToDim[dvId] || null;
    fields.push(...getFieldsForScope(schemas, { type: "activity", dimension_value_id: dvId, dimension_id: dimId }));
    if (activityTypeId) {
      fields.push(...getFieldsForScope(schemas, {
        type: "activity",
        activity_type_id: activityTypeId,
        dimension_value_id: dvId,
        dimension_id: dimId,
      }));
    }
  }

  // Deduplicate by key (more specific scope wins) and sort by sort_order
  return dedupeByKey(fields).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/**
 * Collect all applicable participant meta fields for a given entity, activity type, and dimensions.
 */
export function collectParticipantFields(
  schemas: MetaFieldSchemaItem[],
  entityTypeId: string,
  activityTypeId: string | null,
  dimensionValueIds: string[],
): MetaFieldDefinition[] {
  const fields: MetaFieldDefinition[] = [];
  const base = { type: "participant" as const, entity_type_id: entityTypeId };
  const dvToDim = buildDvToDimMap(schemas);

  // Base: all activity types, all dimension values
  fields.push(...getFieldsForScope(schemas, base));

  // Activity type specific
  if (activityTypeId) {
    fields.push(...getFieldsForScope(schemas, { ...base, activity_type_id: activityTypeId }));
  }

  // Dimension-level scopes (all values of a dimension)
  const dimIds = resolveDimensionIds(dvToDim, dimensionValueIds);
  for (const dimId of dimIds) {
    fields.push(...getFieldsForScope(schemas, { ...base, dimension_id: dimId }));
    if (activityTypeId) {
      fields.push(...getFieldsForScope(schemas, {
        ...base,
        activity_type_id: activityTypeId,
        dimension_id: dimId,
      }));
    }
  }

  // Dimension value specific
  for (const dvId of dimensionValueIds) {
    const dimId = dvToDim[dvId] || null;
    fields.push(...getFieldsForScope(schemas, { ...base, dimension_value_id: dvId, dimension_id: dimId }));
    if (activityTypeId) {
      fields.push(...getFieldsForScope(schemas, {
        ...base,
        activity_type_id: activityTypeId,
        dimension_value_id: dvId,
        dimension_id: dimId,
      }));
    }
  }

  return dedupeByKey(fields);
}
