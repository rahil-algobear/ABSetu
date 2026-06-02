"use client";

/**
 * Per-type renderer for dimension fields. Pure presentation: receives
 * an already-filtered option list and the currently-selected value ID,
 * renders a <select>. The dispatcher (DynamicMetaForm) owns the
 * cascading-filter logic and the dim-data fetches — this component
 * doesn't know which other dimensions exist or how value links work.
 */

import type { DimensionValue, MetaFieldDefinition } from "@/types";
import { Label } from "@/components/ui/label";

export interface DynamicDimensionFieldProps {
  field: MetaFieldDefinition;
  /** Eligible values for this field's dimension after cross-field
   *  cascading. When the field is disabled, the dispatcher may pass
   *  just the selected value to keep the rendering minimal. */
  options: DimensionValue[];
  /** Currently-selected value ID, or "" if none. */
  selectedValueId: string;
  /** Fired with the new value ID (or "" to clear). Dispatcher is
   *  responsible for updating FormValues.dimensions accordingly. */
  onSelect: (valueId: string) => void;
  isDisabled: boolean;
}

export function DynamicDimensionField({
  field,
  options,
  selectedValueId,
  onSelect,
  isDisabled,
}: DynamicDimensionFieldProps) {
  return (
    <div className={isDisabled ? "opacity-60" : undefined}>
      <Label htmlFor={`dim-${field.key}`} className="text-sm mb-1 block">
        {field.label}
        {field.required && !isDisabled && (
          <span className="text-red-500 ml-0.5">*</span>
        )}
      </Label>
      <select
        id={`dim-${field.key}`}
        className="w-full border rounded-md p-2 text-sm disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
        value={selectedValueId}
        onChange={(e) => onSelect(e.target.value)}
        required={field.required && !isDisabled}
        disabled={isDisabled}
      >
        <option value="">Select {field.label}...</option>
        {options.map((dv) => (
          <option key={dv.id} value={dv.id}>
            {dv.name}
          </option>
        ))}
      </select>
    </div>
  );
}
