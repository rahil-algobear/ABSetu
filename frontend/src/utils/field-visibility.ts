/**
 * Unified form-value shape and the visibility evaluator that decides
 * which fields render given the current state.
 *
 * Why one shape: form-builder forms collect a mix of "scalar" meta
 * values (text/number/date/select/etc.) and structural selections
 * (dimension values, future: participant lists). Keeping them in
 * separate state buckets at every call site led to bespoke wiring per
 * caller. The FormValues shape pins both into one object so wrappers
 * (EntityFields, EnrollmentFields, future ActivityFields) and the
 * underlying DynamicMetaForm dispatcher can take a single
 * values/onChange pair.
 *
 * Why one evaluator: dim-dependent field visibility (e.g. "show
 * 'Local Tax ID' only when Centre = Mumbai") and stage filtering
 * (create vs edit) used to live across collectEnrollmentFields +
 * filterVisibleFields + inline logic in wrappers. getVisibleFields
 * folds them into one composable call so every wrapper resolves "what
 * fields belong here right now" the same way.
 */

import type {
  MetaFieldDefinition,
  MetaFieldSchemaItem,
} from "@/types";
import {
  collectActivityFields,
  collectEnrollmentFields,
  collectParticipantFields,
  getFieldsForScope,
} from "@/utils/meta-fields";
import { filterVisibleFields } from "@/utils/field-stage";

/**
 * Unified value bag for any form-builder form. Each field type reads
 * from / writes to the bucket it owns:
 *
 *   - "text"/"number"/"date"/"select"/etc. → values.meta[field.key]
 *   - "dimension"                          → values.dimensions (array of value IDs)
 *
 * Future: entity_list / user_list will land here as a `participants`
 * bucket keyed by section key.
 */
export interface FormValues {
  meta: Record<string, unknown>;
  /** Dimension value IDs the form has selected. Order is not
   *  significant; uniqueness across dimensions is the caller's
   *  responsibility (one value per dimension). */
  dimensions: string[];
}

export const EMPTY_FORM_VALUES: FormValues = Object.freeze({
  meta: {},
  dimensions: [],
}) as FormValues;

/**
 * Discriminated union describing which form-builder scope a wrapper is
 * collecting fields for. Each variant carries the IDs that scope
 * narrows on; dim selections are read out of FormValues, not here.
 */
export type FieldScope =
  | { type: "entity"; entity_type_id: string }
  | { type: "enrollment"; entity_type_id: string | null }
  | { type: "activity"; activity_type_id: string | null }
  | {
      type: "participant";
      entity_type_id: string;
      activity_type_id: string | null;
    };

/**
 * The single point where "what fields render in this form right now"
 * is decided. Composes scope-specific field collection + stage
 * filtering. Wrappers call this; nothing else should.
 *
 * Note: this util doesn't fetch anything. It works against
 * already-loaded schemas + the current FormValues, so it's safe to
 * call inside useMemo without paying for queries.
 */
export function getVisibleFields({
  allSchemas,
  scope,
  values,
  mode,
}: {
  allSchemas: MetaFieldSchemaItem[];
  scope: FieldScope;
  values: FormValues;
  mode: "create" | "edit";
}): MetaFieldDefinition[] {
  const collected = collectByScope(allSchemas, scope, values);
  return filterVisibleFields(collected, mode);
}

function collectByScope(
  allSchemas: MetaFieldSchemaItem[],
  scope: FieldScope,
  values: FormValues,
): MetaFieldDefinition[] {
  switch (scope.type) {
    case "entity":
      return getFieldsForScope(allSchemas, {
        type: "entity",
        entity_type_id: scope.entity_type_id,
      });
    case "enrollment":
      return collectEnrollmentFields(
        allSchemas,
        scope.entity_type_id,
        values.dimensions,
      );
    case "activity":
      return collectActivityFields(
        allSchemas,
        scope.activity_type_id,
        values.dimensions,
      );
    case "participant":
      return collectParticipantFields(
        allSchemas,
        scope.entity_type_id,
        scope.activity_type_id,
        values.dimensions,
      );
  }
}
