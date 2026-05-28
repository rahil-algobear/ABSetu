"use client";

/**
 * Form-level dispatcher. Given a resolved list of fields and the
 * current FormValues, renders the right per-type component for each
 * field. Owns the only piece of cross-field state we have today:
 * cascading dimension filtering (selecting Centre narrows District).
 *
 * Layering:
 *   Page / Modal  →  Wrapper (EntityFields / EnrollmentFields / …)
 *                 →  DynamicMetaForm  (this file — dispatch + cascade)
 *                 →  DynamicMetaField | DynamicDimensionField | …
 *
 * The wrapper is responsible for the field list (scope + stage); this
 * file is responsible only for rendering whatever it's handed.
 */

import { MetaFieldDefinition } from "@/types";
import { formatDate, formatDateTime } from "@/utils/date";

import { DynamicMetaField } from "@/components/DynamicMetaField";
import { DynamicDimensionField } from "@/components/DynamicDimensionField";
import {
  buildSelectedByDim,
  filterEligibleValues,
  useDimensionData,
} from "@/components/useDimensionData";
import type { FormValues } from "@/utils/field-visibility";

export interface DynamicMetaFormProps {
  fields: MetaFieldDefinition[];
  values: FormValues;
  onChange: (values: FormValues) => void;
  /** Field keys to render disabled. For dimension fields, "disabled"
   *  effectively means "locked at the current value" — the dispatcher
   *  presents only that value as the option list. */
  disabledKeys?: Set<string>;
}

export function DynamicMetaForm({
  fields,
  values,
  onChange,
  disabledKeys,
}: DynamicMetaFormProps) {
  const { dimensions, allDimensionValues, dimensionValueLinks } =
    useDimensionData();

  // Map of {dimension_id → currently-selected value_id} for cascading.
  const selectedByDim = buildSelectedByDim(
    values.dimensions,
    allDimensionValues,
  );

  if (fields.length === 0) return null;

  return (
    <div className="space-y-3">
      {fields.map((field) => {
        const isDisabled = disabledKeys?.has(field.key) ?? false;

        if (field.type === "dimension") {
          return renderDimensionField({
            field,
            values,
            onChange,
            isDisabled,
            allDimensionValues,
            dimensionValueLinks,
            selectedByDim,
          });
        }

        // Entity / user list types are out of scope for Phase 1 — they
        // still live in SearchSelectParticipants / ParticipantPicker.
        // The wrapper should not be handing these to DynamicMetaForm
        // yet, but skip defensively if it does.
        if (field.type === "entity_list" || field.type === "user_list") {
          return null;
        }

        return (
          <DynamicMetaField
            key={field.key}
            field={field}
            value={values.meta[field.key]}
            onChange={(newValue) =>
              onChange({
                ...values,
                meta: { ...values.meta, [field.key]: newValue },
              })
            }
            isDisabled={isDisabled}
          />
        );
      })}
    </div>
  );
}

function renderDimensionField({
  field,
  values,
  onChange,
  isDisabled,
  allDimensionValues,
  dimensionValueLinks,
  selectedByDim,
}: {
  field: MetaFieldDefinition;
  values: FormValues;
  onChange: (values: FormValues) => void;
  isDisabled: boolean;
  allDimensionValues: ReturnType<typeof useDimensionData>["allDimensionValues"];
  dimensionValueLinks: ReturnType<
    typeof useDimensionData
  >["dimensionValueLinks"];
  selectedByDim: Record<string, string>;
}) {
  const dimId = field.dimension_id;
  if (!dimId) return null;

  const dimValues = allDimensionValues.filter(
    (dv) => dv.dimension_id === dimId,
  );
  const selectedValueId = selectedByDim[dimId] || "";

  // Disabled = locked at current value. Present only that value so the
  // dropdown can't hint at any other option.
  const options = isDisabled
    ? dimValues.filter((dv) => dv.id === selectedValueId)
    : filterEligibleValues(
        dimValues,
        selectedByDim,
        dimId,
        dimensionValueLinks,
      );

  return (
    <DynamicDimensionField
      key={`dim-${field.key}`}
      field={field}
      options={options}
      selectedValueId={selectedValueId}
      isDisabled={isDisabled}
      onSelect={(newValueId) => {
        // Remove any existing value belonging to this dimension, then
        // add the new one (if non-empty).
        const otherIds = values.dimensions.filter(
          (dvId) => !dimValues.some((dv) => dv.id === dvId),
        );
        onChange({
          ...values,
          dimensions: newValueId ? [...otherIds, newValueId] : otherIds,
        });
      }}
    />
  );
}

/** Display meta values as a read-only summary */
export function MetaFieldDisplay({
  fields,
  values,
  showEmpty = false,
}: {
  fields: MetaFieldDefinition[];
  values: Record<string, unknown> | null;
  showEmpty?: boolean;
}) {
  const safeValues = values || {};
  if (!showEmpty && Object.keys(safeValues).length === 0) return null;

  return (
    <dl className="space-y-2 text-sm">
      {fields.map((field) => {
        const val = safeValues[field.key];
        const isEmpty = val === undefined || val === null || val === "";
        if (!showEmpty && isEmpty) return null;
        return (
          <div key={field.key}>
            <dt className="text-gray-500">{field.label}</dt>
            <dd className={isEmpty ? "text-gray-300 italic" : "font-medium"}>
              {isEmpty
                ? "Not set"
                : field.type === "boolean"
                  ? val
                    ? "Yes"
                    : "No"
                  : field.type === "date" && typeof val === "string"
                    ? formatDate(val)
                    : field.type === "datetime" && typeof val === "string"
                    ? formatDateTime(val)
                    : Array.isArray(val)
                      ? val.join(", ")
                      : String(val)}
            </dd>
          </div>
        );
      })}
      {/* Show any meta values not in the schema */}
      {Object.entries(safeValues)
        .filter(([key]) => !fields.some((f) => f.key === key))
        .map(([key, val]) => (
          <div key={key}>
            <dt className="text-gray-500 capitalize">{key.replace(/_/g, " ")}</dt>
            <dd className="font-medium">{String(val)}</dd>
          </div>
        ))}
    </dl>
  );
}
