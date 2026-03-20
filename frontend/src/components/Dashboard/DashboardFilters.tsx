"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/services/auth";
import {
  dimensionApi,
  activityTypeApi,
} from "@/services/api";
import {
  DashboardFilters as Filters,
  Dimension,
  DimensionValue,
} from "@/types";
import { Filter, X } from "lucide-react";
import { useState } from "react";

interface DashboardFiltersProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

export function DashboardFiltersBar({
  filters,
  onChange,
}: DashboardFiltersProps) {
  const { isAuthenticated } = useAuth();

  // --- Load filter options ---
  const { data: dimensions } = useQuery({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
    staleTime: 5 * 60 * 1000,
    enabled: isAuthenticated,
  });

  const { data: allTypes } = useQuery({
    queryKey: ["activity-types"],
    queryFn: () => activityTypeApi.list(),
    staleTime: 5 * 60 * 1000,
    enabled: isAuthenticated,
  });

  // Track which dimension is expanded for value selection
  const [expandedDimId, setExpandedDimId] = useState<string | null>(null);

  // Load values for expanded dimension
  const { data: dimValues } = useQuery({
    queryKey: ["dimension-values", expandedDimId],
    queryFn: () => dimensionApi.listValues(expandedDimId!),
    staleTime: 5 * 60 * 1000,
    enabled: !!expandedDimId,
  });

  const hasFilters =
    (filters.dimension_value_ids?.length ?? 0) > 0 ||
    !!filters.activity_type_id;

  const clearAll = () => {
    onChange({});
    setExpandedDimId(null);
  };

  // Get selected dimension value labels for chips
  const selectedDimLabels = getSelectedDimLabels(
    dimensions,
    dimValues,
    filters.dimension_value_ids
  );

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Filter className="h-4 w-4 text-gray-500" />
        <span className="text-sm font-medium text-gray-700">
          Filter Activities
        </span>
        {hasFilters && (
          <button
            onClick={clearAll}
            className="ml-auto text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            <X className="h-3 w-3" />
            Clear all
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Activity Type */}
        <FilterSelect
          label="Activity Type"
          value={filters.activity_type_id || ""}
          options={(allTypes ?? []).map((t) => ({
            value: t.id,
            label: t.name,
          }))}
          onChange={(val) =>
            onChange({ ...filters, activity_type_id: val || undefined })
          }
        />

        {/* Dimensions */}
        {(dimensions ?? [])
          .filter((d) => !d.is_system)
          .map((dim) => (
            <DimensionFilter
              key={dim.id}
              dimension={dim}
              selectedValueIds={filters.dimension_value_ids ?? []}
              isExpanded={expandedDimId === dim.id}
              values={expandedDimId === dim.id ? dimValues ?? [] : []}
              displayName={dim.name}
              onToggleExpand={() =>
                setExpandedDimId(expandedDimId === dim.id ? null : dim.id)
              }
              onValueToggle={(valueId) => {
                const current = filters.dimension_value_ids ?? [];
                const next = current.includes(valueId)
                  ? current.filter((id) => id !== valueId)
                  : [...current, valueId];
                onChange({
                  ...filters,
                  dimension_value_ids: next.length > 0 ? next : undefined,
                });
              }}
            />
          ))}
      </div>

      {/* Selected filter chips */}
      {hasFilters && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {filters.activity_type_id && (
            <FilterChip
              label={
                allTypes?.find((t) => t.id === filters.activity_type_id)
                  ?.name ?? ""
              }
              onRemove={() =>
                onChange({ ...filters, activity_type_id: undefined })
              }
            />
          )}
          {selectedDimLabels.map((item) => (
            <FilterChip
              key={item.id}
              label={`${item.dimName}: ${item.valueName}`}
              onRemove={() => {
                const next = (filters.dimension_value_ids ?? []).filter(
                  (id) => id !== item.id
                );
                onChange({
                  ...filters,
                  dimension_value_ids: next.length > 0 ? next : undefined,
                });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors appearance-none cursor-pointer min-w-[140px]"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 8px center",
        paddingRight: "28px",
      }}
    >
      <option value="">All {label}s</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function DimensionFilter({
  selectedValueIds,
  isExpanded,
  values,
  displayName,
  onToggleExpand,
  onValueToggle,
}: {
  selectedValueIds: string[];
  isExpanded: boolean;
  values: DimensionValue[];
  displayName: string;
  onToggleExpand: () => void;
  onValueToggle: (valueId: string) => void;
}) {
  const selectedCount = values.filter((v) =>
    selectedValueIds.includes(v.id)
  ).length;

  return (
    <div className="relative">
      <button
        onClick={onToggleExpand}
        className={`text-sm border rounded-lg px-3 py-1.5 flex items-center gap-1.5 transition-colors cursor-pointer ${
          isExpanded || selectedCount > 0
            ? "border-blue-300 bg-blue-50 text-blue-700"
            : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
        }`}
      >
        {displayName}
        {selectedCount > 0 && (
          <span className="bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
            {selectedCount}
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-2 min-w-[200px] max-h-[280px] overflow-y-auto">
          {values.length === 0 ? (
            <p className="text-xs text-gray-400 px-2 py-1">Loading...</p>
          ) : (
            values.map((val) => (
              <label
                key={val.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm text-gray-700"
              >
                <input
                  type="checkbox"
                  checked={selectedValueIds.includes(val.id)}
                  onChange={() => onValueToggle(val.id)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                {val.name}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs border border-blue-200">
      {label}
      <button
        onClick={onRemove}
        className="hover:bg-blue-100 rounded-full p-0.5 transition-colors"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

// --- Helper ---

function getSelectedDimLabels(
  dimensions: Dimension[] | undefined,
  currentDimValues: DimensionValue[] | undefined,
  selectedIds: string[] | undefined
): { id: string; dimName: string; valueName: string }[] {
  if (!selectedIds?.length || !currentDimValues) return [];

  return selectedIds
    .map((id) => {
      const val = currentDimValues.find((v) => v.id === id);
      if (!val) return null;
      const dim = dimensions?.find((d) => d.id === val.dimension_id);
      return {
        id,
        dimName: dim?.name ?? "",
        valueName: val.name,
      };
    })
    .filter(Boolean) as { id: string; dimName: string; valueName: string }[];
}
