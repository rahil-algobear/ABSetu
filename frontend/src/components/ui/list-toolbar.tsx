"use client";

import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "./input";
import { Button } from "./button";
import { FilterModal, FilterDefinition } from "./filter-modal";
import { FilterValue } from "@/hooks/useListParams";

interface ListToolbarProps {
  search: string;
  onSearchChange: (term: string) => void;
  filterDefinitions: FilterDefinition[];
  activeFilters: FilterValue[];
  onFiltersChange: (filters: FilterValue[]) => void;
  onRemoveFilter: (key: string) => void;
  searchPlaceholder?: string;
}

export function ListToolbar({
  search,
  onSearchChange,
  filterDefinitions,
  activeFilters,
  onFiltersChange,
  onRemoveFilter,
  searchPlaceholder = "Search...",
}: ListToolbarProps) {
  const [showFilterModal, setShowFilterModal] = useState(false);

  return (
    <div className="space-y-2 mb-4">
      {/* Top bar: search + filter button */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          variant={activeFilters.length > 0 ? "default" : "outline"}
          size="default"
          onClick={() => setShowFilterModal(true)}
        >
          <SlidersHorizontal className="h-4 w-4 mr-1.5" />
          Filter
          {activeFilters.length > 0 && (
            <span className="ml-1.5 bg-white/20 text-xs rounded-full px-1.5 py-0.5">
              {activeFilters.length}
            </span>
          )}
        </Button>
      </div>

      {/* Filter carousel — active filter chips */}
      {activeFilters.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {activeFilters.map((f) => (
            <span
              key={f.key}
              className="inline-flex items-center gap-1 px-3 py-1 text-sm bg-blue-50 text-blue-700 border border-blue-200 rounded-full whitespace-nowrap"
            >
              <span className="text-blue-500 font-medium">{f.label}:</span>
              {f.displayValue}
              <button
                type="button"
                onClick={() => onRemoveFilter(f.key)}
                className="ml-0.5 hover:bg-blue-100 rounded-full p-0.5 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Filter Modal */}
      <FilterModal
        open={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        filterDefinitions={filterDefinitions}
        activeFilters={activeFilters}
        onApply={onFiltersChange}
      />
    </div>
  );
}
