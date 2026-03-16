"use client";

import { useState } from "react";

interface AccessCheckboxSectionProps {
  title: string;
  items: { id: string; name: string }[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  emptyLabel?: string;
}

export function AccessCheckboxSection({
  title,
  items,
  selectedIds,
  onToggle,
  onToggleAll,
  emptyLabel,
}: AccessCheckboxSectionProps) {
  const [search, setSearch] = useState("");
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
  const filtered = search
    ? sorted.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : sorted;
  const allSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id));
  const noneSelected = items.every((i) => !selectedIds.has(i.id));

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium">{title}</label>
        <button
          type="button"
          onClick={onToggleAll}
          className="text-xs text-purple-600 hover:text-purple-800"
        >
          {allSelected ? "Clear All" : "Select All"}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">No {title.toLowerCase()} available</p>
      ) : (
        <>
          {items.length > 5 && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${title.toLowerCase()}...`}
              className="w-full mb-1 px-2 py-1 text-sm border rounded-md border-gray-300 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          )}
          <div className="space-y-1 max-h-36 overflow-y-auto border rounded-md p-2">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 py-1">No matches</p>
            ) : (
              filtered.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => onToggle(item.id)}
                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  {item.name}
                </label>
              ))
            )}
          </div>
        </>
      )}
      <p className="text-xs text-gray-400 mt-1">
        {noneSelected
          ? (emptyLabel || "No restriction — sees all")
          : `${selectedIds.size} of ${items.length} selected`}
      </p>
    </div>
  );
}
