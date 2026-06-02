"use client";

/**
 * Per-type renderer for simple meta field types: text, number, date,
 * datetime, select, multiselect, boolean. Pure presentation — no API
 * fetches, no cross-field state.
 *
 * Complex types (dimension, entity_list, user_list) have their own
 * renderers (DynamicDimensionField, etc.); DynamicMetaForm dispatches
 * to the right one based on field.type.
 */

import type { MetaFieldDefinition } from "@/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DateTimeInput } from "@/components/ui/date-time-input";

export interface DynamicMetaFieldProps {
  field: MetaFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  isDisabled: boolean;
}

export function DynamicMetaField({
  field,
  value,
  onChange,
  isDisabled,
}: DynamicMetaFieldProps) {
  // Default fallback: empty value falls through to the field-defined default.
  const resolvedValue =
    value != null && value !== "" ? value : field.default;

  return (
    <div className={isDisabled ? "opacity-60" : undefined}>
      <Label htmlFor={`meta-${field.key}`} className="text-sm mb-1 block">
        {field.label}
        {field.required && !isDisabled && (
          <span className="text-red-500 ml-0.5">*</span>
        )}
      </Label>

      {field.type === "text" && (
        <Input
          id={`meta-${field.key}`}
          value={(resolvedValue as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          required={field.required && !isDisabled}
          disabled={isDisabled}
        />
      )}

      {field.type === "number" && (
        <Input
          id={`meta-${field.key}`}
          type="number"
          value={resolvedValue != null ? String(resolvedValue) : ""}
          onChange={(e) =>
            onChange(e.target.value ? Number(e.target.value) : "")
          }
          required={field.required && !isDisabled}
          disabled={isDisabled}
        />
      )}

      {(field.type === "date" || field.type === "datetime") && (
        <DateTimeInput
          value={(resolvedValue as string) || ""}
          onChange={(val) => onChange(val)}
          required={field.required && !isDisabled}
          allowTime={field.type === "datetime"}
          disabled={isDisabled}
        />
      )}

      {field.type === "select" && (
        <select
          id={`meta-${field.key}`}
          className="w-full border rounded-md p-2 text-sm"
          value={(resolvedValue as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          required={field.required && !isDisabled}
          disabled={isDisabled}
        >
          <option value="">Select...</option>
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )}

      {field.type === "multiselect" && (
        <select
          id={`meta-${field.key}`}
          className="w-full border rounded-md p-2 text-sm"
          multiple
          value={Array.isArray(resolvedValue) ? (resolvedValue as string[]) : []}
          onChange={(e) => {
            const selected = Array.from(
              e.target.selectedOptions,
              (o) => o.value,
            );
            onChange(selected);
          }}
          disabled={isDisabled}
        >
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )}

      {field.type === "boolean" && (
        <div className="flex items-center gap-2">
          <Switch
            id={`meta-${field.key}`}
            checked={Boolean(resolvedValue)}
            onCheckedChange={(checked) => onChange(checked)}
            disabled={isDisabled}
          />
          <span className="text-sm text-gray-600">
            {resolvedValue ? "Yes" : "No"}
          </span>
        </div>
      )}
    </div>
  );
}
