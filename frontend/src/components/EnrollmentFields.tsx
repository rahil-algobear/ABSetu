"use client";

/**
 * Shared enrollment-fields renderer. Used by all three places that
 * collect enrollment data:
 *   - EnrollmentForm (entity detail / quick enroll) — picker mode
 *   - EnrollAndAddModal (activity context, existing entity) — activity mode
 *   - CreateAndAddModal (activity context, new entity) — activity mode
 *
 * The renderer owns: field collection, sort order, stage-based disabling,
 * locked-dim chips, cascading dim dropdowns, and required-field validation.
 * Parents own: the form wrapper, the mutation, surrounding sections (status
 * toggle, entity fields, etc.).
 *
 * Validation is exposed via the ref handle so a single submit handler in
 * the parent can call `ref.current?.validate()` instead of duplicating the
 * field walk.
 */

import { useImperativeHandle, useMemo, type Ref } from "react";
import { useQuery } from "@tanstack/react-query";

import { dimensionApi, dimensionValueLinkApi } from "@/services/api";
import type {
  Dimension,
  DimensionValue,
  DimensionValueLink,
  MetaFieldDefinition,
  MetaFieldSchemaItem,
} from "@/types";
import { collectEnrollmentFields } from "@/utils/meta-fields";

/**
 * Thin wrapper around collectEnrollmentFields that filters to visible
 * fields. Parents call this when they need to decide whether to render
 * an empty state (or hide the submit button), without paying for the
 * renderer's dimension queries.
 */
export function useVisibleEnrollmentFields({
  entityTypeId,
  allSchemas,
  knownDimensionValueIds,
}: {
  entityTypeId: string;
  allSchemas: MetaFieldSchemaItem[];
  knownDimensionValueIds: string[];
}): MetaFieldDefinition[] {
  return useMemo(
    () =>
      collectEnrollmentFields(allSchemas, entityTypeId, knownDimensionValueIds)
        .filter((f) => f.visible !== false),
    [allSchemas, entityTypeId, knownDimensionValueIds],
  );
}

import { DynamicMetaForm } from "@/components/DynamicMetaForm";

export interface EnrollmentLockedDimension {
  dimension_id: string;
  value_id: string;
  value_name: string;
}

export type EnrollmentDimensionMode = "picker" | "activity";

export interface EnrollmentFieldsHandle {
  /** Returns an error message, or null when all required fields are filled. */
  validate: () => string | null;
}

export interface EnrollmentFieldsProps {
  entityTypeId: string;
  allSchemas: MetaFieldSchemaItem[];

  /** Dimensions whose value is fixed by the surrounding context (the
   *  activity supplies these). Rendered as locked chips. Pass `[]` for the
   *  standalone entity flow. */
  lockedDimensions: EnrollmentLockedDimension[];

  /** Dimension value IDs the user has picked (does NOT include locked
   *  ones). Always required, even when empty. */
  userDimensionValueIds: string[];
  onUserDimensionsChange: (ids: string[]) => void;

  metaValues: Record<string, unknown>;
  onMetaChange: (values: Record<string, unknown>) => void;

  /** `picker`  → unlocked dimension fields render as cascading dropdowns
   *              (standalone entity flow).
   *  `activity` → unlocked dimension fields render as an italic
   *              "configure via entity detail" hint (activity flow does
   *              not let users pick dimensions outside the activity). */
  dimensionMode: EnrollmentDimensionMode;

  /** Defaults to "create". Drives stage-based field disabling:
   *  - create → disable fields with stage = "record"
   *  - edit   → disable fields with stage = "create" */
  mode?: "create" | "edit";

  ref?: Ref<EnrollmentFieldsHandle>;
}

export function EnrollmentFields({
  entityTypeId,
  allSchemas,
  lockedDimensions,
  userDimensionValueIds,
  onUserDimensionsChange,
  metaValues,
  onMetaChange,
  dimensionMode,
  mode = "create",
  ref,
}: EnrollmentFieldsProps) {
  const { data: dimensions = [] } = useQuery<Dimension[]>({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
  });

  const { data: allDimensionValues = [] } = useQuery<DimensionValue[]>({
    queryKey: ["all-dimension-values", dimensions.map((d) => d.id).join(",")],
    queryFn: async () => {
      const results = await Promise.all(
        dimensions.map((d) => dimensionApi.listAccessibleValues(d.id)),
      );
      return results.flat();
    },
    enabled: dimensions.length > 0,
  });

  const { data: dimensionValueLinks = [] } = useQuery<DimensionValueLink[]>({
    queryKey: ["dimension-value-links-all"],
    queryFn: () => dimensionValueLinkApi.list(),
  });

  const lockedDimByDimId = useMemo(
    () => new Map(lockedDimensions.map((d) => [d.dimension_id, d])),
    [lockedDimensions],
  );

  // Field set: depends on EVERY currently-known dimension value (locked +
  // user), so dimension-value-scoped fields appear as the user picks.
  const allKnownDimValueIds = useMemo(
    () => [
      ...lockedDimensions.map((d) => d.value_id),
      ...userDimensionValueIds,
    ],
    [lockedDimensions, userDimensionValueIds],
  );

  const allFields = useMemo(
    () => collectEnrollmentFields(allSchemas, entityTypeId, allKnownDimValueIds),
    [allSchemas, entityTypeId, allKnownDimValueIds],
  );

  const visibleFields = useMemo(
    () => allFields.filter((f) => f.visible !== false),
    [allFields],
  );

  const disabledKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const f of allFields) {
      if (mode === "edit" && f.stage === "create") keys.add(f.key);
      if (mode === "create" && f.stage === "record") keys.add(f.key);
    }
    return keys;
  }, [allFields, mode]);

  // Cascading dropdown filter: only the user-selected ids participate,
  // since locked ones come from a different (non-user) axis.
  const selectedByDim = useMemo(() => {
    const map: Record<string, string> = {};
    for (const dim of dimensions) {
      const dimValues = allDimensionValues.filter(
        (dv) => dv.dimension_id === dim.id,
      );
      const selected = userDimensionValueIds.find((id) =>
        dimValues.some((dv) => dv.id === id),
      );
      if (selected) map[dim.id] = selected;
    }
    return map;
  }, [dimensions, allDimensionValues, userDimensionValueIds]);

  useImperativeHandle(
    ref,
    (): EnrollmentFieldsHandle => ({
      validate: () => {
        for (const field of visibleFields) {
          if (!field.required || disabledKeys.has(field.key)) continue;
          if (field.type === "dimension") {
            // Activity mode: the activity supplies the locked ones and we
            // deliberately don't surface a picker for the rest, so we
            // can't validate user input here. Backend will reject if a
            // required field is genuinely missing.
            if (dimensionMode === "activity") {
              const dimId = field.dimension_id;
              if (!dimId) continue;
              // Locked dimensions are always satisfied by the activity.
              if (lockedDimByDimId.has(dimId)) continue;
              continue;
            }
            // Picker mode: every required dim field must have a value
            // among userDimensionValueIds.
            const dimId = field.dimension_id;
            if (!dimId) continue;
            const hasValue = userDimensionValueIds.some(
              (dvId) =>
                allDimensionValues.find((dv) => dv.id === dvId)?.dimension_id ===
                dimId,
            );
            if (!hasValue) return `${field.label} is required.`;
            continue;
          }
          const val = metaValues[field.key];
          if (val === undefined || val === null || val === "") {
            return `${field.label} is required.`;
          }
        }
        return null;
      },
    }),
    [
      visibleFields,
      disabledKeys,
      dimensionMode,
      lockedDimByDimId,
      userDimensionValueIds,
      allDimensionValues,
      metaValues,
    ],
  );

  const renderField = (field: MetaFieldDefinition) => {
    if (field.type === "dimension") {
      const dimId = field.dimension_id;

      // Locked → readonly chip (activity-supplied).
      const locked = dimId ? lockedDimByDimId.get(dimId) : undefined;
      if (locked) {
        return (
          <div key={`dim-${field.key}`}>
            <label className="text-sm font-medium">
              {field.label}
              {field.required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            <div className="mt-1 px-3 py-2 border rounded-md bg-gray-50 text-sm text-gray-700">
              {locked.value_name}
            </div>
          </div>
        );
      }

      // Activity mode without a locked value: deferred — user must
      // configure on the entity detail page.
      if (dimensionMode === "activity") {
        return (
          <div
            key={`dim-${field.key}`}
            className="text-xs text-gray-400 italic"
          >
            {field.label}: configure via the entity detail page
          </div>
        );
      }

      // Picker mode → cascading dropdown.
      const dim = dimensions.find((d) => d.id === dimId);
      if (!dim) return null;
      const dimValues = allDimensionValues.filter(
        (dv) => dv.dimension_id === dim.id,
      );
      const filtered = filterByLinkedValues(
        dimValues,
        selectedByDim,
        dim.id,
        dimensionValueLinks,
      );
      const currentSelection =
        userDimensionValueIds.find((dvId) =>
          dimValues.some((dv) => dv.id === dvId),
        ) || "";
      const isFieldDisabled = disabledKeys.has(field.key);
      return (
        <div key={`dim-${field.key}`}>
          <label className="text-sm font-medium">
            {field.label}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          <select
            className="w-full mt-1 border rounded-md p-2 text-sm disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
            value={currentSelection}
            onChange={(e) => {
              const newId = e.target.value;
              const otherIds = userDimensionValueIds.filter(
                (dvId) => !dimValues.some((dv) => dv.id === dvId),
              );
              onUserDimensionsChange(newId ? [...otherIds, newId] : otherIds);
            }}
            required={field.required}
            disabled={isFieldDisabled}
          >
            <option value="">Select {field.label}...</option>
            {filtered.map((dv) => (
              <option key={dv.id} value={dv.id}>
                {dv.name}
              </option>
            ))}
          </select>
        </div>
      );
    }

    return (
      <div key={`field-${field.key}`}>
        <DynamicMetaForm
          fields={[field]}
          values={metaValues}
          onChange={onMetaChange}
          disabledKeys={disabledKeys}
        />
      </div>
    );
  };

  return <>{visibleFields.map(renderField)}</>;
}

/**
 * Cascading dimension filter — values for one dimension narrow when other
 * dimensions are already selected, using the admin-configured value links.
 * Pulled out of EnrollmentForm so it can be shared with the picker mode.
 */
function filterByLinkedValues(
  targetDimValues: DimensionValue[],
  selectedByDim: Record<string, string>,
  targetDimId: string,
  dimensionValueLinks: DimensionValueLink[],
): DimensionValue[] {
  const otherSelections = Object.entries(selectedByDim)
    .filter(([dimId, dvId]) => dimId !== targetDimId && dvId)
    .map(([, dvId]) => dvId);

  if (otherSelections.length === 0) return targetDimValues;

  const linkPairs = new Set<string>();
  for (const link of dimensionValueLinks) {
    linkPairs.add(`${link.dimension_value_id_1}:${link.dimension_value_id_2}`);
    linkPairs.add(`${link.dimension_value_id_2}:${link.dimension_value_id_1}`);
  }

  return targetDimValues.filter((dv) =>
    otherSelections.every((selectedId) =>
      linkPairs.has(`${dv.id}:${selectedId}`),
    ),
  );
}
