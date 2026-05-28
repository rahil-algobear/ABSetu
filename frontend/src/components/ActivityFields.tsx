"use client";

/**
 * Shared activity-meta fields renderer. Used by the places that
 * collect activity meta:
 *   - Activity Detail edit modal (/activities/[key]/[id])
 *
 * The renderer owns: field collection (activity scope, including
 * activity-type + dimension-value scopes), stage-based filtering,
 * stage-based disabling, and required-field validation (exposed via
 * the ref handle). Parents own the form wrapper and the
 * create/update mutation.
 *
 * What's intentionally excluded — these are not simple inputs, so
 * they belong in the surrounding layout, not in the meta renderer:
 *   - dimension fields (rendered as labels/badges in the parent, or
 *     as a picker on create)
 *   - entity_list / user_list (participant sections — owned by the
 *     parent)
 *   - title in "generated" mode (auto-derived, no input)
 *
 * For the same conventions applied to entity and enrollment fields,
 * see EntityFields.tsx / EnrollmentFields.tsx — all three go through
 * utils/field-stage.ts.
 */

import { useImperativeHandle, useMemo, type Ref } from "react";

import type { MetaFieldDefinition, MetaFieldSchemaItem } from "@/types";
import { collectActivityFields } from "@/utils/meta-fields";
import { filterVisibleFields, getStageDisabledKeys } from "@/utils/field-stage";

import { DynamicMetaForm } from "@/components/DynamicMetaForm";

export interface ActivityFieldsHandle {
  /** Returns an error message, or null when all required fields are filled. */
  validate: () => string | null;
}

export interface ActivityFieldsProps {
  activityTypeId: string | null;
  dimensionValueIds: string[];
  allSchemas: MetaFieldSchemaItem[];

  metaValues: Record<string, unknown>;
  onMetaChange: (values: Record<string, unknown>) => void;

  /** Defaults to "create". Drives stage filtering/disabling per the
   *  shared convention — see utils/field-stage.ts. */
  mode?: "create" | "edit";

  ref?: Ref<ActivityFieldsHandle>;
}

/** Standard meta input types this renderer is responsible for. */
function isInputField(f: MetaFieldDefinition): boolean {
  if (f.type === "dimension") return false;
  if (f.type === "entity_list" || f.type === "user_list") return false;
  if (f.key === "title") {
    const titleConfig = (f.config || { mode: "free_text" }) as { mode?: string };
    if (titleConfig.mode === "generated") return false;
  }
  return true;
}

/**
 * Thin wrapper around collectActivityFields that applies the same
 * visibility rules the renderer uses. Parents call this when they need
 * to decide whether to render an empty state or hide the submit button.
 */
export function useVisibleActivityFields({
  activityTypeId,
  dimensionValueIds,
  allSchemas,
  mode = "create",
}: {
  activityTypeId: string | null;
  dimensionValueIds: string[];
  allSchemas: MetaFieldSchemaItem[];
  mode?: "create" | "edit";
}): MetaFieldDefinition[] {
  const dvKey = dimensionValueIds.join(",");
  return useMemo(
    () =>
      filterVisibleFields(
        collectActivityFields(allSchemas, activityTypeId, dimensionValueIds).filter(
          isInputField,
        ),
        mode,
      ),
    // dimensionValueIds is fed through a stable join-key to avoid array-identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allSchemas, activityTypeId, dvKey, mode],
  );
}

export function ActivityFields({
  activityTypeId,
  dimensionValueIds,
  allSchemas,
  metaValues,
  onMetaChange,
  mode = "create",
  ref,
}: ActivityFieldsProps) {
  const dvKey = dimensionValueIds.join(",");

  const allFields = useMemo(
    () =>
      collectActivityFields(allSchemas, activityTypeId, dimensionValueIds).filter(
        isInputField,
      ),
    // dimensionValueIds is fed through a stable join-key to avoid array-identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allSchemas, activityTypeId, dvKey],
  );

  const visibleFields = useMemo(
    () => filterVisibleFields(allFields, mode),
    [allFields, mode],
  );

  const disabledKeys = useMemo(
    () => getStageDisabledKeys(allFields, mode),
    [allFields, mode],
  );

  useImperativeHandle(
    ref,
    (): ActivityFieldsHandle => ({
      validate: () => {
        for (const field of visibleFields) {
          if (!field.required || disabledKeys.has(field.key)) continue;
          const val = metaValues[field.key];
          if (val === undefined || val === null || val === "") {
            return `${field.label} is required.`;
          }
        }
        return null;
      },
    }),
    [visibleFields, disabledKeys, metaValues],
  );

  return (
    <DynamicMetaForm
      fields={visibleFields}
      values={metaValues}
      onChange={onMetaChange}
      disabledKeys={disabledKeys}
    />
  );
}
