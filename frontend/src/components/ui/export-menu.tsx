"use client";

import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "./button";

export type ExportScope = "current" | "all";

interface ExportMenuProps {
  onExport: (scope: ExportScope) => void;
  isExporting: boolean;
  /** When true, the "Current view" option mentions active filters. */
  hasActiveFilters?: boolean;
  label?: string;
}

/**
 * Download control for list pages — opens a menu offering the current
 * (filtered) view or all records, mirroring the two export modes. Gate it
 * with <Can permission="...:export"> at the call site.
 */
export function ExportMenu({
  onExport,
  isExporting,
  hasActiveFilters = false,
  label = "Download",
}: ExportMenuProps) {
  return (
    <Menu as="div" className="relative flex-shrink-0">
      <MenuButton
        as={Button}
        variant="outline"
        size="sm"
        disabled={isExporting}
        className="h-10 gap-2"
        aria-label={label}
      >
        {isExporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        <span className="hidden sm:inline">{isExporting ? "Preparing…" : label}</span>
      </MenuButton>
      <MenuItems
        anchor="bottom end"
        className="z-30 mt-1 w-64 rounded-md border border-gray-200 bg-white py-1 shadow-lg focus:outline-none"
      >
        <MenuItem>
          {({ focus }) => (
            <button
              type="button"
              onClick={() => onExport("current")}
              className={`block w-full px-3 py-2 text-left ${focus ? "bg-blue-50" : ""}`}
            >
              <span className="block text-sm font-medium text-gray-900">Current view</span>
              <span className="block text-xs text-gray-500">
                {hasActiveFilters
                  ? "Applies your active filters & search"
                  : "Applies your current search"}
              </span>
            </button>
          )}
        </MenuItem>
        <MenuItem>
          {({ focus }) => (
            <button
              type="button"
              onClick={() => onExport("all")}
              className={`block w-full px-3 py-2 text-left ${focus ? "bg-blue-50" : ""}`}
            >
              <span className="block text-sm font-medium text-gray-900">All records</span>
              <span className="block text-xs text-gray-500">Every record you can access</span>
            </button>
          )}
        </MenuItem>
      </MenuItems>
    </Menu>
  );
}
