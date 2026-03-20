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

function FilterChips({
  activeFilters,
  onRemoveFilter,
}: {
  activeFilters: FilterValue[];
  onRemoveFilter: (key: string) => void;
}) {
  if (activeFilters.length === 0) return null;
  return (
    <div className="flex overflow-x-auto gap-2 min-w-0">
      {activeFilters.map((f) => (
        <span
          key={f.key}
          className="inline-flex items-center rounded-md border border-gray-300 bg-white text-gray-900 shadow-sm whitespace-nowrap"
        >
          <span className="px-2 py-1.5 bg-blue-600 rounded-l-md text-white font-medium text-xs">
            {f.label}
          </span>
          <span className="px-2 py-1 text-sm">{f.displayValue}</span>
          <button
            type="button"
            onClick={() => onRemoveFilter(f.key)}
            className="ml-0.5 mr-1.5 text-gray-400 hover:text-gray-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}
    </div>
  );
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
    <div className="px-0 py-3 mb-4">
      {/* Desktop: single row — search (fixed) | filter button | chips (scrollable) */}
      <div className="hidden lg:flex flex-row w-full gap-3 items-center">
        <div className="flex-shrink-0 w-64 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 pr-10 h-10"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex-shrink-0">
          <Button
            variant={activeFilters.length > 0 ? "default" : "outline"}
            className="flex items-center gap-2 h-10"
            onClick={() => setShowFilterModal(true)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filter
            {activeFilters.length > 0 && (
              <span className="bg-white/20 text-xs rounded-full px-1.5 py-0.5">
                {activeFilters.length}
              </span>
            )}
          </Button>
        </div>
        <div className="flex min-w-0 items-center overflow-x-auto">
          <FilterChips activeFilters={activeFilters} onRemoveFilter={onRemoveFilter} />
        </div>
      </div>

      {/* Mobile: two rows — row 1: filter + chips | row 2: search */}
      <div className="flex lg:hidden flex-col gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex-shrink-0">
            <Button
              variant={activeFilters.length > 0 ? "default" : "outline"}
              className="flex items-center gap-2 h-10"
              onClick={() => setShowFilterModal(true)}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filter
              {activeFilters.length > 0 && (
                <span className="bg-white/20 text-xs rounded-full px-1.5 py-0.5">
                  {activeFilters.length}
                </span>
              )}
            </Button>
          </div>
          <FilterChips activeFilters={activeFilters} onRemoveFilter={onRemoveFilter} />
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 pr-10 h-10"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

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
