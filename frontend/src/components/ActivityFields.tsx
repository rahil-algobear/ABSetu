"use client";

/**
 * Shared activity-meta fields wrapper. Used by:
 *   - Activity Create (/activities/[key]/new)
 *   - Activity Detail edit modal (/activities/[key]/[id])
 *
 * The wrapper owns activity scope, stage filtering, the activity-
 * specific rules below, and required-field validation (exposed via
 * the ref handle). Rendering lives in DynamicMetaForm.
 *
 * Activity-specific rules baked in here:
 *
 *   1. Dimensions are immutable post-create. In edit mode, every
 *      dimension field is added to disabledKeys so DynamicDimensionField
 *      renders a locked single-option select.
 *
 *   2. Title fields configured with `mode = "generated"` are filtered
 *      out — the backend generates the value, the user never sees an
 *      input for it.
 *
 *   3. Optional `includeParticipantSections` — defaults to true.
 *      Activity-create wants entity_list / user_list sections rendered
 *      inline. The edit modal wants only meta + dim and renders
 *      participants in a separate page section, so it passes false.
 *
 * Why this lives at the wrapper and not in DynamicMetaForm: each
 * activity-specific rule (#1 + #2) is true for activity scope only.
 * EntityFields / EnrollmentFields don't have these constraints.
 * Pushing them down would leak activity semantics into the
 * dispatcher.
 *
 * The previous extraction attempt was reverted because it excluded
 * dim/entity_list/user_list fields from the renderer, which broke the
 * admin-configured sort_order. Phase 1/2 added per-type renderers for
 * every field type, so this version can pass every visible field
 * through without dropping anything.
 */

import { useImperativeHandle, useMemo, type Ref } from "react";

import type {
  MetaFieldDefinition,
  MetaFieldSchemaItem,
} from "@/types";
import { getStageDisabledKeys } from "@/utils/field-stage";
import {
  getVisibleFields,
  type FormValues,
} from "@/utils/field-visibility";
import { useDimensionData } from "@/components/useDimensionData";

import { DynamicMetaForm } from "@/components/DynamicMetaForm";

export interface ActivityFieldsHandle {
  /** Returns an error message, or null when all required fields are filled. */
  validate: () => string | null;
}

export interface ActivityFieldsProps {
  activityTypeId: string | null;
  allSchemas: MetaFieldSchemaItem[];

  values: FormValues;
  onChange: (values: FormValues) => void;

  /** Defaults to "create". On edit, dimension fields are auto-locked. */
  mode?: "create" | "edit";

  /** Defaults to true. Pass false to hide entity_list / user_list
   *  fields (e.g. when the surrounding page renders participants in
   *  its own section). */
  includeParticipantSections?: boolean;

  ref?: Ref<ActivityFieldsHandle>;
}

/** Drops fields the wrapper renders nothing for: generated-title and
 *  (when opted out) participant sections. */
function applyActivityFilters(
  fields: MetaFieldDefinition[],
  includeParticipantSections: boolean,
): MetaFieldDefinition[] {
  return fields.filter((f) => {
    if (f.key === "title") {
      const titleConfig = (f.config || { mode: "free_text" }) as {
        mode?: string;
      };
      if (titleConfig.mode === "generated") return false;
    }
    if (!includeParticipantSections) {
      if (f.type === "entity_list" || f.type === "user_list") return false;
    }
    return true;
  });
}

/**
 * Thin hook for callers that need to decide whether to render an
 * empty-state message or hide the submit button. Applies the same
 * activity-specific filters as the renderer.
 */
export function useVisibleActivityFields({
  activityTypeId,
  allSchemas,
  values,
  mode = "create",
  includeParticipantSections = true,
}: {
  activityTypeId: string | null;
  allSchemas: MetaFieldSchemaItem[];
  values: FormValues;
  mode?: "create" | "edit";
  includeParticipantSections?: boolean;
}): MetaFieldDefinition[] {
  return useMemo(
    () =>
      applyActivityFilters(
        getVisibleFields({
          allSchemas,
          scope: { type: "activity", activity_type_id: activityTypeId },
          values,
          mode,
        }),
        includeParticipantSections,
      ),
    [allSchemas, activityTypeId, values, mode, includeParticipantSections],
  );
}

export function ActivityFields({
  activityTypeId,
  allSchemas,
  values,
  onChange,
  mode = "create",
  includeParticipantSections = true,
  ref,
}: ActivityFieldsProps) {
  const { allDimensionValues } = useDimensionData();

  const visibleFields = useMemo(
    () =>
      applyActivityFilters(
        getVisibleFields({
          allSchemas,
          scope: { type: "activity", activity_type_id: activityTypeId },
          values,
          mode,
        }),
        includeParticipantSections,
      ),
    [allSchemas, activityTypeId, values, mode, includeParticipantSections],
  );

  // Stage-based disabled keys + the activity-specific "freeze dims on
  // edit" rule unioned together.
  const disabledKeys = useMemo(() => {
    const keys = getStageDisabledKeys(visibleFields, mode);
    if (mode === "edit") {
      for (const f of visibleFields) {
        if (f.type === "dimension") keys.add(f.key);
      }
    }
    return keys;
  }, [visibleFields, mode]);

  useImperativeHandle(
    ref,
    (): ActivityFieldsHandle => ({
      validate: () => {
        for (const field of visibleFields) {
          if (!field.required || disabledKeys.has(field.key)) continue;

          if (field.type === "dimension") {
            const dimId = field.dimension_id;
            if (!dimId) continue;
            const hasValue = values.dimensions.some(
              (dvId) =>
                allDimensionValues.find((dv) => dv.id === dvId)
                  ?.dimension_id === dimId,
            );
            if (!hasValue) return `${field.label} is required.`;
            continue;
          }

          if (field.type === "entity_list" || field.type === "user_list") {
            // Participant sections validate when the section has at
            // least one row. We don't know section keys here without
            // depending on the section-key helper, but the dispatcher
            // already wires participants through. Validate emptiness
            // via the participants bucket.
            const sectionKey =
              field.type === "user_list"
                ? "user"
                : field.entity_type_id || field.key;
            const rows = values.participants?.[sectionKey] ?? [];
            if (rows.length === 0) {
              return `${field.label} is required.`;
            }
            continue;
          }

          const val = values.meta[field.key];
          if (val === undefined || val === null || val === "") {
            return `${field.label} is required.`;
          }
        }
        return null;
      },
    }),
    [visibleFields, disabledKeys, values, allDimensionValues],
  );

  return (
    <DynamicMetaForm
      fields={visibleFields}
      values={values}
      onChange={onChange}
      disabledKeys={disabledKeys}
    />
  );
}
