"use client";

/**
 * Shared enrollment-fields wrapper. Used by:
 *   - EnrollmentForm (entity detail / quick enroll) — standalone
 *   - EnrollAndAddModal (activity context, existing entity) — activity-supplied dims
 *   - CreateAndAddModal (activity context, new entity)    — activity-supplied dims
 *
 * Owns: scope (enrollment), stage filtering, required-field validation
 * (via ref handle), and the small piece of activity-domain bookkeeping
 * needed to surface activity-supplied dimensions as pre-filled and
 * locked.
 *
 * Doesn't own: dimension data fetching, cascading-filter logic, or any
 * per-field-type rendering. All of that lives in DynamicMetaForm + the
 * Dynamic*Field components.
 */

import { useImperativeHandle, useMemo, type Ref } from "react";

import type { MetaFieldDefinition, MetaFieldSchemaItem } from "@/types";
import { getStageDisabledKeys } from "@/utils/field-stage";
import {
  getVisibleFields,
  type FormValues,
} from "@/utils/field-visibility";
import { useDimensionData } from "@/components/useDimensionData";

import { DynamicMetaForm } from "@/components/DynamicMetaForm";

export interface EnrollmentFieldsHandle {
  /** Returns an error message, or null when all required fields are filled. */
  validate: () => string | null;
}

/**
 * Identifies a dimension whose value is supplied by the surrounding
 * activity (not picked by the user). Pass these and the wrapper:
 *   - merges them into values.dimensions (so dim-value-scoped fields
 *     surface based on them)
 *   - marks the corresponding form-builder field keys as disabled (so
 *     the dispatcher renders them as locked-at-current-value)
 *
 * Used by EnrollAndAddModal and CreateAndAddModal; not used by the
 * standalone EnrollmentForm.
 */
export interface ActivitySuppliedDimension {
  dimension_id: string;
  value_id: string;
}

export interface EnrollmentFieldsProps {
  entityTypeId: string;
  allSchemas: MetaFieldSchemaItem[];

  values: FormValues;
  onChange: (values: FormValues) => void;

  /** Optional. Activity-side flows pass these to lock + preset the
   *  matching dimension fields. Standalone entity flows pass nothing
   *  (or an empty array). */
  activitySuppliedDimensions?: ActivitySuppliedDimension[];

  /** Defaults to "create". */
  mode?: "create" | "edit";

  ref?: Ref<EnrollmentFieldsHandle>;
}

/**
 * Thin hook for callers that need to decide whether to render an
 * empty-state message or hide the submit button. Goes through the
 * same evaluator the renderer uses.
 */
export function useVisibleEnrollmentFields({
  entityTypeId,
  allSchemas,
  values,
  mode = "create",
}: {
  entityTypeId: string;
  allSchemas: MetaFieldSchemaItem[];
  values: FormValues;
  mode?: "create" | "edit";
}): MetaFieldDefinition[] {
  return useMemo(
    () =>
      getVisibleFields({
        allSchemas,
        scope: { type: "enrollment", entity_type_id: entityTypeId },
        values,
        mode,
      }),
    [allSchemas, entityTypeId, values, mode],
  );
}

export function EnrollmentFields({
  entityTypeId,
  allSchemas,
  values,
  onChange,
  activitySuppliedDimensions,
  mode = "create",
  ref,
}: EnrollmentFieldsProps) {
  const { allDimensionValues } = useDimensionData();

  // Merge any activity-supplied dim values into values.dimensions for
  // the purposes of field collection. We don't write these back to
  // parent state — they're transient render-time facts. Parent state
  // continues to hold only what the user has picked + whatever it
  // seeded at mount.
  const effectiveValues = useMemo<FormValues>(() => {
    if (!activitySuppliedDimensions?.length) return values;
    const suppliedIds = activitySuppliedDimensions.map((d) => d.value_id);
    const merged = new Set<string>([...values.dimensions, ...suppliedIds]);
    return { ...values, dimensions: Array.from(merged) };
  }, [values, activitySuppliedDimensions]);

  const visibleFields = useMemo(
    () =>
      getVisibleFields({
        allSchemas,
        scope: { type: "enrollment", entity_type_id: entityTypeId },
        values: effectiveValues,
        mode,
      }),
    [allSchemas, entityTypeId, effectiveValues, mode],
  );

  // Disabled keys come from two places:
  //   1. Stage rules (create-only fields locked on edit)
  //   2. Activity-supplied dim fields (locked + preset)
  const activitySuppliedFieldKeys = useMemo(() => {
    if (!activitySuppliedDimensions?.length) return new Set<string>();
    const suppliedDimIds = new Set(
      activitySuppliedDimensions.map((d) => d.dimension_id),
    );
    const keys = new Set<string>();
    for (const f of visibleFields) {
      if (
        f.type === "dimension" &&
        f.dimension_id &&
        suppliedDimIds.has(f.dimension_id)
      ) {
        keys.add(f.key);
      }
    }
    return keys;
  }, [visibleFields, activitySuppliedDimensions]);

  const disabledKeys = useMemo(() => {
    const stageKeys = getStageDisabledKeys(visibleFields, mode);
    if (activitySuppliedFieldKeys.size === 0) return stageKeys;
    return new Set<string>([...stageKeys, ...activitySuppliedFieldKeys]);
  }, [visibleFields, mode, activitySuppliedFieldKeys]);

  useImperativeHandle(
    ref,
    (): EnrollmentFieldsHandle => ({
      validate: () => {
        for (const field of visibleFields) {
          if (!field.required || disabledKeys.has(field.key)) continue;

          if (field.type === "dimension") {
            const dimId = field.dimension_id;
            if (!dimId) continue;
            const hasValue = effectiveValues.dimensions.some(
              (dvId) =>
                allDimensionValues.find((dv) => dv.id === dvId)
                  ?.dimension_id === dimId,
            );
            if (!hasValue) return `${field.label} is required.`;
            continue;
          }

          const val = effectiveValues.meta[field.key];
          if (val === undefined || val === null || val === "") {
            return `${field.label} is required.`;
          }
        }
        return null;
      },
    }),
    [visibleFields, disabledKeys, effectiveValues, allDimensionValues],
  );

  // Pass the EFFECTIVE values down so activity-supplied dim values
  // render correctly. Parent's onChange still flows through unchanged
  // — when the user edits something, we drop the supplied-dim entries
  // because they shouldn't end up in user-managed state.
  const handleChange = (next: FormValues) => {
    if (!activitySuppliedDimensions?.length) {
      onChange(next);
      return;
    }
    const suppliedIds = new Set(
      activitySuppliedDimensions.map((d) => d.value_id),
    );
    onChange({
      ...next,
      dimensions: next.dimensions.filter((id) => !suppliedIds.has(id)),
    });
  };

  return (
    <DynamicMetaForm
      fields={visibleFields}
      values={effectiveValues}
      onChange={handleChange}
      disabledKeys={disabledKeys}
    />
  );
}
