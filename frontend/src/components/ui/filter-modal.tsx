"use client";

import { useState, useEffect } from "react";
import { Dialog } from "./dialog";
import { Button } from "./button";
import { Input } from "./input";
import { FilterValue } from "@/hooks/useListParams";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDefinition {
  key: string;
  label: string;
  type: "select" | "range" | "date_range" | "boolean" | "text";
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

  const handleRangeChange = (key: string, field: "min" | "max", val: string) => {
    const current = localFilters[key];
    const rangeStr = typeof current === "string" ? current : "";
    const [min, max] = rangeStr.split(":").map((s) => s || "");
    const newRange = field === "min" ? `${val}:${max}` : `${min}:${val}`;
    setLocalFilters({ ...localFilters, [key]: newRange });
  };

  const handleDateChange = (key: string, field: "start" | "end", val: string) => {
    const current = localFilters[key];
    const dateStr = typeof current === "string" ? current : "";
    const [start, end] = dateStr.split(":").map((s) => s || "");
    const newDate = field === "start" ? `${val}:${end}` : `${start}:${val}`;
    setLocalFilters({ ...localFilters, [key]: newDate });
  };

  const handleApply = () => {
    const filters: FilterValue[] = [];
    for (const def of filterDefinitions) {
      const val = localFilters[def.key];
      if (!val || (Array.isArray(val) && val.length === 0)) continue;

      let displayValue = "";
      if (def.type === "select" && def.options) {
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
    <Dialog open={open} onClose={onClose} title="Filters" className="max-w-lg">
      <div className="space-y-5 max-h-[60vh] overflow-y-auto">
        {filterDefinitions.map((def) => (
          <div key={def.key}>
            <p className="text-sm font-medium text-gray-700 mb-2">{def.label}</p>

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
                      ? (localFilters[def.key] as string).split(":")[0]
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
                      ? (localFilters[def.key] as string).split(":")[1]
                      : "") || ""
                  }
                  onChange={(e) => handleRangeChange(def.key, "max", e.target.value)}
                  className="w-28"
                />
              </div>
            )}

            {def.type === "date_range" && (
              <div className="flex gap-2 items-center">
                <Input
                  type="date"
                  value={
                    (typeof localFilters[def.key] === "string"
                      ? (localFilters[def.key] as string).split(":")[0]
                      : "") || ""
                  }
                  onChange={(e) => handleDateChange(def.key, "start", e.target.value)}
                />
                <span className="text-gray-400">to</span>
                <Input
                  type="date"
                  value={
                    (typeof localFilters[def.key] === "string"
                      ? (localFilters[def.key] as string).split(":")[1]
                      : "") || ""
                  }
                  onChange={(e) => handleDateChange(def.key, "end", e.target.value)}
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
        ))}

        {filterDefinitions.length === 0 && (
          <p className="text-sm text-gray-500">No filters available.</p>
        )}
      </div>

      <div className="flex justify-between pt-4 mt-4 border-t">
        <Button variant="ghost" size="sm" onClick={handleClear}>
          Clear All
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleApply}>
            Apply
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
