"use client";

import { useState, useEffect } from "react";
import { Dialog } from "./dialog";
import { Button } from "./button";
import { Input } from "./input";
import { DateTimeInput } from "./date-time-input";
import { X } from "lucide-react";
import { FilterValue } from "@/hooks/useListParams";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDefinition {
  key: string;
  label: string;
  type: "select" | "range" | "date_range" | "datetime_range" | "boolean" | "text";
  options?: FilterOption[];
  min?: number;
  max?: number;
}

interface FilterModalProps {
  open: boolean;
  onClose: () => void;
  filterDefinitions: FilterDefinition[];
  activeFilters: FilterValue[];
  onApply: (filters: FilterValue[]) => void;
}

export function FilterModal({
  open,
  onClose,
  filterDefinitions,
  activeFilters,
  onApply,
}: FilterModalProps) {
  // Local state — only commits on Apply
  const [localFilters, setLocalFilters] = useState<Record<string, string | string[]>>({});

  // Reset local state from active filters when modal opens
  useEffect(() => {
    if (open) {
      const map: Record<string, string | string[]> = {};
      for (const f of activeFilters) {
        map[f.key] = f.value;
      }
      setLocalFilters(map);
    }
  }, [open, activeFilters]);

  const handleSelectToggle = (key: string, value: string) => {
    const current = localFilters[key];
    const arr = Array.isArray(current) ? [...current] : current ? [current] : [];
    const idx = arr.indexOf(value);
    if (idx >= 0) {
      arr.splice(idx, 1);
    } else {
      arr.push(value);
    }
    setLocalFilters({ ...localFilters, [key]: arr.length > 0 ? arr : [] });
  };

  const handleSelectAll = (def: FilterDefinition) => {
    if (!def.options) return;
    setLocalFilters({
      ...localFilters,
      [def.key]: def.options.map((o) => o.value),
    });
  };

  const handleClearGroup = (key: string) => {
    setLocalFilters({ ...localFilters, [key]: [] });
  };

  const handleRangeChange = (key: string, field: "min" | "max", val: string) => {
    const current = localFilters[key];
    const rangeStr = typeof current === "string" ? current : "";
    const [min, max] = rangeStr.split("|").map((s) => s || "");
    const newRange = field === "min" ? `${val}|${max}` : `${min}|${val}`;
    setLocalFilters({ ...localFilters, [key]: newRange });
  };

  const handleDateChange = (key: string, field: "start" | "end", val: string) => {
    const current = localFilters[key];
    const dateStr = typeof current === "string" ? current : "";
    const parts = dateStr.split("|");
    const start = parts[0] || "";
    const end = parts[1] || "";
    const newDate = field === "start" ? `${val}|${end}` : `${start}|${val}`;
    setLocalFilters({ ...localFilters, [key]: newDate });
  };

  const handleApply = () => {
    const filters: FilterValue[] = [];
    for (const def of filterDefinitions) {
      const val = localFilters[def.key];
      if (!val || (Array.isArray(val) && val.length === 0)) continue;

      let displayValue = "";
      if ((def.type === "date_range" || def.type === "datetime_range") && typeof val === "string") {
        const [start, end] = val.split("|");
        if (start && end) displayValue = `${start} to ${end}`;
        else if (start) displayValue = `from ${start}`;
        else if (end) displayValue = `until ${end}`;
      } else if (def.type === "select" && def.options) {
        const vals = Array.isArray(val) ? val : [val];
        displayValue = vals
          .map((v) => def.options!.find((o) => o.value === v)?.label || v)
          .join(", ");
      } else if (typeof val === "string") {
        displayValue = val;
      } else {
        displayValue = val.join(", ");
      }

      filters.push({
        key: def.key,
        label: def.label,
        value: val,
        displayValue,
      });
    }
    onApply(filters);
    onClose();
  };

  const handleClear = () => {
    setLocalFilters({});
  };

  const isSelectActive = (key: string, value: string) => {
    const current = localFilters[key];
    if (Array.isArray(current)) return current.includes(value);
    return current === value;
  };

  return (
    <Dialog open={open} onClose={onClose} className="max-w-lg p-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-300">
        <h2 className="text-lg font-semibold">Filters</h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="max-h-[60vh] overflow-y-auto">
        {filterDefinitions.map((def, i) => (
          <div key={def.key}>
            {i > 0 && <div className="border-t border-gray-200" />}
            <div className="px-6 py-4">
              <div className="flex items-center gap-3 mb-2">
                <p className="text-sm font-medium text-gray-700">{def.label}</p>
                {def.type === "select" && def.options && def.options.length > 0 && (
                  <div className="text-xs text-gray-600">
                    <span
                      onClick={() => handleSelectAll(def)}
                      className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                    >
                      Select All
                    </span>
                    {" / "}
                    <span
                      onClick={() => handleClearGroup(def.key)}
                      className="text-gray-600 hover:text-gray-800 hover:underline cursor-pointer"
                    >
                      Clear
                    </span>
                  </div>
                )}
              </div>

              {def.type === "select" && def.options && (
                <div className="flex flex-wrap gap-2">
                  {def.options.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleSelectToggle(def.key, opt.value)}
                      className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                        isSelectActive(def.key, opt.value)
                          ? "bg-blue-100 border-blue-400 text-blue-700"
                          : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}

              {def.type === "range" && (
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={
                      (typeof localFilters[def.key] === "string"
                        ? (localFilters[def.key] as string).split("|")[0]
                        : "") || ""
                    }
                    onChange={(e) => handleRangeChange(def.key, "min", e.target.value)}
                    className="w-28"
                  />
                  <span className="text-gray-400">to</span>
                  <Input
                    type="number"
                    placeholder="Max"
                    value={
                      (typeof localFilters[def.key] === "string"
                        ? (localFilters[def.key] as string).split("|")[1]
                        : "") || ""
                    }
                    onChange={(e) => handleRangeChange(def.key, "max", e.target.value)}
                    className="w-28"
                  />
                </div>
              )}

              {(def.type === "date_range" || def.type === "datetime_range") && (
                <div className="flex gap-2 items-center">
                  <DateTimeInput
                    value={
                      (typeof localFilters[def.key] === "string"
                        ? (localFilters[def.key] as string).split("|")[0]
                        : "") || ""
                    }
                    onChange={(val) => handleDateChange(def.key, "start", val)}
                    allowTime={def.type === "datetime_range"}
                    showLabel={false}
                  />
                  <span className="text-gray-400">to</span>
                  <DateTimeInput
                    value={
                      (typeof localFilters[def.key] === "string"
                        ? (localFilters[def.key] as string).split("|")[1]
                        : "") || ""
                    }
                    onChange={(val) => handleDateChange(def.key, "end", val)}
                    allowTime={def.type === "datetime_range"}
                    showLabel={false}
                  />
                </div>
              )}

              {def.type === "boolean" && (
                <div className="flex gap-2">
                  {["true", "false"].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() =>
                        setLocalFilters({
                          ...localFilters,
                          [def.key]: localFilters[def.key] === v ? "" : v,
                        })
                      }
                      className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                        localFilters[def.key] === v
                          ? "bg-blue-100 border-blue-400 text-blue-700"
                          : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {v === "true" ? "Yes" : "No"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {filterDefinitions.length === 0 && (
          <p className="text-sm text-gray-500 px-6 py-4">No filters available.</p>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-300 px-6 py-4 flex justify-end gap-3">
        <Button variant="outline" size="sm" onClick={handleClear}>
          Clear Filters
        </Button>
        <Button size="sm" onClick={handleApply}>
          Apply Filters
        </Button>
      </div>
    </Dialog>
  );
}
