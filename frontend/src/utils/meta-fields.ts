import { MetaFieldDefinition, MetaFieldSchemaItem } from "@/types";

/**
 * Find a single schema item matching exact scope criteria.
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
    if ((s.scope.dimension_id || null) !== (criteria.dimension_id || null)) return false;
    if ((s.scope.activity_type_id || null) !== (criteria.activity_type_id || null)) return false;
    if ((s.scope.dimension_value_id || null) !== (criteria.dimension_value_id || null)) return false;
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
 * Collect all applicable activity meta fields for a given activity type + dimension values.
 * Returns fields from: type-only, dv-only, and type+dv scopes.
 */
export function collectActivityFields(
  schemas: MetaFieldSchemaItem[],
  activityTypeId: string | null,
  dimensionValueIds: string[],
): MetaFieldDefinition[] {
  const fields: MetaFieldDefinition[] = [];

  // Base scope: all activities (no activity_type, no dimension_value)
  fields.push(...getFieldsForScope(schemas, { type: "activity" }));

  if (activityTypeId) {
    fields.push(...getFieldsForScope(schemas, { type: "activity", activity_type_id: activityTypeId }));
  }

  for (const dvId of dimensionValueIds) {
    fields.push(...getFieldsForScope(schemas, { type: "activity", dimension_value_id: dvId }));
    if (activityTypeId) {
      fields.push(...getFieldsForScope(schemas, {
        type: "activity",
        activity_type_id: activityTypeId,
        dimension_value_id: dvId,
      }));
    }
  }

  // Sort by sort_order
  fields.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return fields;
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

  // Base: all activity types, all dimension values
  fields.push(...getFieldsForScope(schemas, base));

  // Activity type specific
  if (activityTypeId) {
    fields.push(...getFieldsForScope(schemas, { ...base, activity_type_id: activityTypeId }));
  }

  // Dimension value specific
  for (const dvId of dimensionValueIds) {
    fields.push(...getFieldsForScope(schemas, { ...base, dimension_value_id: dvId }));
    if (activityTypeId) {
      fields.push(...getFieldsForScope(schemas, {
        ...base,
        activity_type_id: activityTypeId,
        dimension_value_id: dvId,
      }));
    }
  }

  return fields;
}
