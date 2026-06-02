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

/** Participant section record shape carried by `FormValues.participants`. */
export interface ParticipantRecord {
  participant_id: string;
  participant_type: "user" | "entity";
  status?: string;
  meta?: Record<string, unknown>;
}

/**
 * Convention for the key under which a participant section's records
 * live inside `FormValues.participants`.
 *
 * - "user_list"   → "user"  (single user section per activity)
 * - "entity_list" → field.entity_type_id (one section per entity type)
 *                   falls back to field.key for legacy fields without
 *                   an entity_type_id set.
 *
 * Centralized so the dispatcher (DynamicMetaForm) and the page
 * (activity create's save path) agree on the same key.
 */
export function deriveParticipantSectionKey(
  field: Pick<MetaFieldDefinition, "type" | "entity_type_id" | "key">,
): string {
  if (field.type === "user_list") return "user";
  if (field.type === "entity_list") return field.entity_type_id || field.key;
  throw new Error(
    `deriveParticipantSectionKey called on non-list field type: ${field.type}`,
  );
}

/**
 * Unified value bag for any form-builder form. Each field type reads
 * from / writes to the bucket it owns:
 *
 *   - "text"/"number"/"date"/"select"/etc. → values.meta[field.key]
 *   - "dimension"                          → values.dimensions (array of value IDs)
 *   - "entity_list" / "user_list"          → values.participants[sectionKey]
 *
 * The participants bucket is optional because most wrappers
 * (EntityFields, EnrollmentFields) never carry list-type fields.
 */
export interface FormValues {
  meta: Record<string, unknown>;
  /** Dimension value IDs the form has selected. Order is not
   *  significant; uniqueness across dimensions is the caller's
   *  responsibility (one value per dimension). */
  dimensions: string[];
  /** Participant sections keyed by `deriveParticipantSectionKey(field)`.
   *  Optional — wrappers without entity_list/user_list fields leave
   *  this undefined. */
  participants?: Record<string, ParticipantRecord[]>;
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
