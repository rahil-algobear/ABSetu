"use client";

/**
 * Shared entity-meta fields wrapper. Used by:
 *   - Entity Listing (Add / Edit modal in /entities/[key]/page.tsx)
 *   - Entity Details (edit card in /entities/[key]/[id]/page.tsx)
 *   - CreateAndAddModal (activity-context "Create new …" flow)
 *   - SearchSelectParticipants (activity-create page's create dialog)
 *
 * The wrapper owns scope (entity), stage filtering, and required-field
 * validation (exposed via the ref handle). Rendering lives one layer
 * down in DynamicMetaForm; per-field-type rendering is one layer below
 * that in DynamicMetaField / DynamicDimensionField.
 *
 * Entity scope doesn't carry dimension fields today, so the form
 * values' `dimensions` array stays empty for this wrapper. The unified
 * FormValues shape is still used so all wrappers feed DynamicMetaForm
 * the same way.
 */

import { useImperativeHandle, useMemo, type Ref } from "react";

import type { MetaFieldDefinition, MetaFieldSchemaItem } from "@/types";
import { getStageDisabledKeys } from "@/utils/field-stage";
import {
  EMPTY_FORM_VALUES,
  getVisibleFields,
  type FormValues,
} from "@/utils/field-visibility";

import { DynamicMetaForm } from "@/components/DynamicMetaForm";

export interface EntityFieldsHandle {
  /** Returns an error message, or null when all required fields are filled. */
  validate: () => string | null;
}

export interface EntityFieldsProps {
  entityTypeId: string;
  allSchemas: MetaFieldSchemaItem[];

  values: FormValues;
  onChange: (values: FormValues) => void;

  /** Defaults to "create". Drives stage filtering/disabling per the
   *  shared convention — see utils/field-stage.ts. */
  mode?: "create" | "edit";

  ref?: Ref<EntityFieldsHandle>;
}

/**
 * Thin hook for callers that need to decide whether to render an
 * empty-state message or hide the submit button. Goes through the
 * same evaluator the renderer uses, so empty-state branching can't
 * drift from what actually appears on screen.
 */
export function useVisibleEntityFields({
  entityTypeId,
  allSchemas,
  mode = "create",
}: {
  entityTypeId: string;
  allSchemas: MetaFieldSchemaItem[];
  mode?: "create" | "edit";
}): MetaFieldDefinition[] {
  return useMemo(
    () =>
      getVisibleFields({
        allSchemas,
        scope: { type: "entity", entity_type_id: entityTypeId },
        values: EMPTY_FORM_VALUES, // entity scope has no dim deps today
        mode,
      }),
    [allSchemas, entityTypeId, mode],
  );
}

export function EntityFields({
  entityTypeId,
  allSchemas,
  values,
  onChange,
  mode = "create",
  ref,
}: EntityFieldsProps) {
  const visibleFields = useMemo(
    () =>
      getVisibleFields({
        allSchemas,
        scope: { type: "entity", entity_type_id: entityTypeId },
        values,
        mode,
      }),
    [allSchemas, entityTypeId, values, mode],
  );

  const disabledKeys = useMemo(
    () => getStageDisabledKeys(visibleFields, mode),
    [visibleFields, mode],
  );

  useImperativeHandle(
    ref,
    (): EntityFieldsHandle => ({
      validate: () => {
        for (const field of visibleFields) {
          if (!field.required || disabledKeys.has(field.key)) continue;
          // Entity scope has only meta fields today; dim/list types
          // don't appear here. If/when they do, validation rules land
          // alongside the renderer changes.
          const val = values.meta[field.key];
          if (val === undefined || val === null || val === "") {
            return `${field.label} is required.`;
          }
        }
        return null;
      },
    }),
    [visibleFields, disabledKeys, values],
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
