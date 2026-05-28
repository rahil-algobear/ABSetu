"use client";

/**
 * Shared entity-meta fields renderer. Used by both places that collect
 * entity meta:
 *   - Entity Listing (Add / Edit modal in /entities/[key]/page.tsx)
 *   - CreateAndAddModal (activity-context "Create new …" flow)
 *
 * The renderer owns: field collection (entity scope), stage-based
 * filtering, stage-based disabling, and required-field validation
 * (exposed via the ref handle). Parents own the form wrapper and the
 * create/update mutation.
 *
 * For the same conventions applied to enrollment fields, see
 * EnrollmentFields.tsx — both go through utils/field-stage.ts.
 */

import { useImperativeHandle, useMemo, type Ref } from "react";

import type { MetaFieldDefinition, MetaFieldSchemaItem } from "@/types";
import { getFieldsForScope } from "@/utils/meta-fields";
import { filterVisibleFields, getStageDisabledKeys } from "@/utils/field-stage";

import { DynamicMetaForm } from "@/components/DynamicMetaForm";

export interface EntityFieldsHandle {
  /** Returns an error message, or null when all required fields are filled. */
  validate: () => string | null;
}

export interface EntityFieldsProps {
  entityTypeId: string;
  allSchemas: MetaFieldSchemaItem[];

  metaValues: Record<string, unknown>;
  onMetaChange: (values: Record<string, unknown>) => void;

  /** Defaults to "create". Drives stage filtering/disabling per the
   *  shared convention — see utils/field-stage.ts. */
  mode?: "create" | "edit";

  ref?: Ref<EntityFieldsHandle>;
}

/**
 * Thin wrapper around getFieldsForScope that applies the same
 * visibility rules the renderer uses. Parents call this when they need
 * to decide whether to render an empty state or hide the submit button.
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
      filterVisibleFields(
        getFieldsForScope(allSchemas, {
          type: "entity",
          entity_type_id: entityTypeId,
        }),
        mode,
      ),
    [allSchemas, entityTypeId, mode],
  );
}

export function EntityFields({
  entityTypeId,
  allSchemas,
  metaValues,
  onMetaChange,
  mode = "create",
  ref,
}: EntityFieldsProps) {
  const allFields = useMemo(
    () =>
      getFieldsForScope(allSchemas, {
        type: "entity",
        entity_type_id: entityTypeId,
      }),
    [allSchemas, entityTypeId],
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
    (): EntityFieldsHandle => ({
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
