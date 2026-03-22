"use client";

import { MetaFieldDefinition } from "@/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { formatDateTime } from "@/utils/date";

interface DynamicMetaFormProps {
  fields: MetaFieldDefinition[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}

export function DynamicMetaForm({ fields, values, onChange }: DynamicMetaFormProps) {
  if (fields.length === 0) return null;

  const getVal = (field: MetaFieldDefinition) => {
    const v = values[field.key];
    if (v != null && v !== "") return v;
    return field.default;
  };

  const setValue = (key: string, value: unknown) => {
    onChange({ ...values, [key]: value });
  };

  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <div key={field.key}>
          <Label htmlFor={`meta-${field.key}`} className="text-sm mb-1 block">
            {field.label}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
          </Label>

          {field.type === "text" && (
            <Input
              id={`meta-${field.key}`}
              value={(getVal(field) as string) || ""}
              onChange={(e) => setValue(field.key, e.target.value)}
              required={field.required}
            />
          )}

          {field.type === "number" && (
            <Input
              id={`meta-${field.key}`}
              type="number"
              value={getVal(field) != null ? String(getVal(field)) : ""}
              onChange={(e) => setValue(field.key, e.target.value ? Number(e.target.value) : "")}
              required={field.required}
            />
          )}

          {(field.type === "date" || field.type === "datetime") && (
            <DateTimeInput
              value={(getVal(field) as string) || ""}
              onChange={(val) => setValue(field.key, val)}
              required={field.required}
              allowTime={field.type === "datetime"}
            />
          )}

          {field.type === "select" && (
            <select
              id={`meta-${field.key}`}
              className="w-full border rounded-md p-2 text-sm"
              value={(getVal(field) as string) || ""}
              onChange={(e) => setValue(field.key, e.target.value)}
              required={field.required}
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
              value={Array.isArray(getVal(field)) ? (getVal(field) as string[]) : []}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions, (o) => o.value);
                setValue(field.key, selected);
              }}
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
                checked={Boolean(getVal(field))}
                onCheckedChange={(checked) => setValue(field.key, checked)}
              />
              <span className="text-sm text-gray-600">
                {getVal(field) ? "Yes" : "No"}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
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
                  : (field.type === "date" || field.type === "datetime") && typeof val === "string"
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
