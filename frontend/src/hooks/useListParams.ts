"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useMemo, useCallback, useRef, useEffect, useState } from "react";
import type { FilterDefinition } from "@/components/ui/filter-modal";
import {
  buildSlugMappings,
  keyRealToSlug,
  keySlugToReal,
  valueRealToSlug,
  valueSlugToReal,
  type SlugMappings,
  type SlugSource,
} from "@/utils/listSlugs";

export interface FilterValue {
  key: string; // real key e.g. "entity_type_id", "dim:uuid", "meta:age"
  label: string; // display label for the filter
  value: string | string[]; // selected value(s) — real values (UUIDs etc.)
  displayValue: string; // human-readable value for chip display
}

interface UseListParamsOptions {
  defaultSortBy?: string;
  defaultSortOrder?: "asc" | "desc";
  defaultLimit?: number;
  /** Filter modal definitions — drive slug mapping for filter_* keys and values. */
  filterDefinitions?: FilterDefinition[];
  /**
   * All visible list columns — drives slug mapping for sort_by, covering
   * sortable-only fields that don't appear in filterDefinitions.
   */
  columns?: SlugSource[];
}

interface UseListParamsReturn {
  // Search
  search: string;
  setSearch: (term: string) => void;

  // Filters
  activeFilters: FilterValue[];
  setActiveFilters: (filters: FilterValue[]) => void;
  removeFilter: (key: string, value?: string) => void;

  // Sort
  sortBy: string | null;
  sortOrder: "asc" | "desc";
  setSorting: (key: string, order: "asc" | "desc") => void;

  // Pagination
  page: number;
  limit: number;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;

  // For API calls — serialized params
  apiParams: {
    search?: string;
    filters?: string;
    sort_by?: string;
    sort_order: string;
    page: number;
    limit: number;
  };
}

/**
 * URL param ordering:
 * 1. search
 * 2. filter_* params (slugified when mappings available)
 * 3. sort_by, sort_order
 * 4. page, show
 */
function buildOrderedUrl(
  pathname: string,
  params: {
    search?: string;
    filters: FilterValue[];
    sortBy?: string | null;
    sortOrder?: string;
    page?: number;
    show?: number;
  },
  defaults: { sortOrder: string; limit: number },
  slugMappings: SlugMappings | null,
): string {
  const sp = new URLSearchParams();

  // 1. Search
  if (params.search) {
    sp.set("search", params.search);
  }

  // 2. Filters — use slugs for readable URLs
  for (const f of params.filters) {
    const keySlug = keyRealToSlug(f.key, slugMappings);
    const vals = Array.isArray(f.value) ? f.value : [f.value];
    for (const v of vals) {
      sp.append(`filter_${keySlug}`, valueRealToSlug(f.key, v, slugMappings));
    }
  }

  // 3. Sort (omit defaults) — also slugified
  if (params.sortBy) {
    sp.set("sort_by", keyRealToSlug(params.sortBy, slugMappings));
  }
  if (params.sortOrder && params.sortOrder !== defaults.sortOrder) {
    sp.set("sort_order", params.sortOrder);
  }

  // 4. Pagination (omit defaults)
  if (params.page && params.page > 1) {
    sp.set("page", String(params.page));
  }
  if (params.show && params.show !== defaults.limit) {
    sp.set("show", String(params.show));
  }

  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function useListParams(
  options: UseListParamsOptions = {},
): UseListParamsReturn {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const defaultSortBy = options.defaultSortBy ?? null;
  const defaultSortOrder = options.defaultSortOrder ?? "desc";
  const defaultLimit = options.defaultLimit ?? 25;

  // Debounce timer ref for search
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Local search state for immediate UI update
  const [localSearch, setLocalSearch] = useState(searchParams.get("search") || "");

  // Sync local search with URL params when they change externally
  useEffect(() => {
    setLocalSearch(searchParams.get("search") || "");
  }, [searchParams]);

  // Build slug mappings from filter defs + visible columns. Filter defs go
  // first so their option-value mappings win on key collisions.
  const slugMappings = useMemo((): SlugMappings | null => {
    const filters = options.filterDefinitions || [];
    const cols = options.columns || [];
    if (!filters.length && !cols.length) return null;
    return buildSlugMappings(filters, cols);
  }, [options.filterDefinitions, options.columns]);

  // Parse current state from URL
  const search = searchParams.get("search") || "";

  // Whether slug sources are expected but still loading. We treat either
  // source being explicitly passed-but-empty as "still loading" so we don't
  // resolve URL slugs against an empty mapping.
  const defsLoading =
    (!!options.filterDefinitions && options.filterDefinitions.length === 0) ||
    (!!options.columns && options.columns.length === 0);

  const realKeySet = useMemo(
    () =>
      new Set([
        ...(options.filterDefinitions?.map((d) => d.key) || []),
        ...(options.columns?.map((c) => c.key) || []),
      ]),
    [options.filterDefinitions, options.columns],
  );

  const activeFilters = useMemo((): FilterValue[] => {
    // Wait for filter definitions before parsing URL params — avoids sending
    // slug keys to the API and rendering merged chips before we can resolve them.
    if (defsLoading) return [];

    // Collect all values per filter key (supports repeated params)
    const filterMap = new Map<string, string[]>();

    searchParams.forEach((rawValue, paramKey) => {
      if (!paramKey.startsWith("filter_")) return;
      const urlKey = paramKey.slice(7);

      const realKey = keySlugToReal(urlKey, slugMappings, realKeySet);
      if (!realKey) return;

      const realValue = valueSlugToReal(realKey, rawValue, slugMappings);

      const arr = filterMap.get(realKey) || [];
      arr.push(realValue);
      filterMap.set(realKey, arr);
    });

    return Array.from(filterMap.entries()).map(([key, values]) => {
      const def = options.filterDefinitions?.find((d) => d.key === key);
      const value = values.length === 1 ? values[0] : values;

      let displayValue = values.join(", ");
      if ((def?.type === "date_range" || def?.type === "datetime_range") && typeof value === "string") {
        const [start, end] = value.split("|");
        if (start && end) displayValue = `${start} to ${end}`;
        else if (start) displayValue = `from ${start}`;
        else if (end) displayValue = `until ${end}`;
      }

      return {
        key,
        label: def?.label || key,
        value,
        displayValue,
      };
    });
  }, [searchParams, slugMappings, options.filterDefinitions, defsLoading, realKeySet]);

  // sort_by may also be slugged; wait for defs before resolving so we never
  // send an unresolved slug to the API.
  const sortBy = useMemo(() => {
    const raw = searchParams.get("sort_by");
    if (!raw) return defaultSortBy;
    if (defsLoading) return defaultSortBy;
    return keySlugToReal(raw, slugMappings, realKeySet) ?? raw;
  }, [searchParams, slugMappings, defsLoading, realKeySet, defaultSortBy]);
  const sortOrder = (searchParams.get("sort_order") || defaultSortOrder) as "asc" | "desc";
  const page = parseInt(searchParams.get("page") || "1", 10) || 1;
  const limit = parseInt(searchParams.get("show") || String(defaultLimit), 10) || defaultLimit;

  // Navigation helper — replace URL without scroll
  const navigate = useCallback(
    (url: string) => {
      router.replace(url, { scroll: false });
    },
    [router],
  );

  const setSearch = useCallback(
    (term: string) => {
      // Update local state immediately for responsive UI
      setLocalSearch(term);

      // Debounce the URL update
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
      searchTimerRef.current = setTimeout(() => {
        const url = buildOrderedUrl(
          pathname,
          {
            search: term || undefined,
            filters: activeFilters,
            sortBy,
            sortOrder,
            page: 1, // Reset page on search
            show: limit,
          },
          { sortOrder: defaultSortOrder, limit: defaultLimit },
          slugMappings,
        );
        navigate(url);
      }, 500);
    },
    [pathname, activeFilters, sortBy, sortOrder, limit, defaultSortOrder, defaultLimit, navigate, slugMappings],
  );

  // Clean up debounce timer
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  const setActiveFilters = useCallback(
    (filters: FilterValue[]) => {
      const url = buildOrderedUrl(
        pathname,
        {
          search: search || undefined,
          filters,
          sortBy,
          sortOrder,
          page: 1, // Reset page on filter change
          show: limit,
        },
        { sortOrder: defaultSortOrder, limit: defaultLimit },
        slugMappings,
      );
      navigate(url);
    },
    [pathname, search, sortBy, sortOrder, limit, defaultSortOrder, defaultLimit, navigate, slugMappings],
  );

  const removeFilter = useCallback(
    (key: string, value?: string) => {
      if (!value) {
        // Remove entire filter
        const updated = activeFilters.filter((f) => f.key !== key);
        setActiveFilters(updated);
        return;
      }
      // Remove specific value from a multi-value filter
      const updated = activeFilters
        .map((f) => {
          if (f.key !== key) return f;
          const vals = Array.isArray(f.value) ? f.value.filter((v) => v !== value) : [];
          if (vals.length === 0) return null;
          return { ...f, value: vals.length === 1 ? vals[0] : vals };
        })
        .filter(Boolean) as FilterValue[];
      setActiveFilters(updated);
    },
    [activeFilters, setActiveFilters],
  );

  const setSorting = useCallback(
    (newSortBy: string, newSortOrder: "asc" | "desc") => {
      const url = buildOrderedUrl(
        pathname,
        {
          search: search || undefined,
          filters: activeFilters,
          sortBy: newSortBy,
          sortOrder: newSortOrder,
          page, // Preserve page on sort change
          show: limit,
        },
        { sortOrder: defaultSortOrder, limit: defaultLimit },
        slugMappings,
      );
      navigate(url);
    },
    [pathname, search, activeFilters, page, limit, defaultSortOrder, defaultLimit, navigate, slugMappings],
  );

  const setPage = useCallback(
    (newPage: number) => {
      const url = buildOrderedUrl(
        pathname,
        {
          search: search || undefined,
          filters: activeFilters,
          sortBy,
          sortOrder,
          page: newPage,
          show: limit,
        },
        { sortOrder: defaultSortOrder, limit: defaultLimit },
        slugMappings,
      );
      navigate(url);
    },
    [pathname, search, activeFilters, sortBy, sortOrder, limit, defaultSortOrder, defaultLimit, navigate, slugMappings],
  );

  const setLimit = useCallback(
    (newLimit: number) => {
      const url = buildOrderedUrl(
        pathname,
        {
          search: search || undefined,
          filters: activeFilters,
          sortBy,
          sortOrder,
          page: 1, // Reset page on limit change
          show: newLimit,
        },
        { sortOrder: defaultSortOrder, limit: defaultLimit },
        slugMappings,
      );
      navigate(url);
    },
    [pathname, search, activeFilters, sortBy, sortOrder, defaultSortOrder, defaultLimit, navigate, slugMappings],
  );

  // Build API params — serialized for query key and API call
  const apiParams = useMemo(() => {
    // Convert activeFilters to JSON dict for backend (always uses real keys/values)
    const filtersDict: Record<string, unknown> = {};
    for (const f of activeFilters) {
      const def = options.filterDefinitions?.find((d) => d.key === f.key);
      if ((def?.type === "date_range" || def?.type === "datetime_range") && typeof f.value === "string") {
        const parts = f.value.split("|");
        const start = parts[0] && parts[0] !== "undefined" ? parts[0] : undefined;
        const end = parts[1] && parts[1] !== "undefined" ? parts[1] : undefined;
        if (start || end) {
          filtersDict[f.key] = { start, end };
        }
      } else {
        filtersDict[f.key] = f.value;
      }
    }
    const hasFilters = Object.keys(filtersDict).length > 0;

    return {
      ...(search ? { search } : {}),
      ...(hasFilters ? { filters: JSON.stringify(filtersDict) } : {}),
      ...(sortBy ? { sort_by: sortBy } : {}),
      sort_order: sortOrder,
      page,
      limit,
    };
  }, [search, activeFilters, sortBy, sortOrder, page, limit, options.filterDefinitions]);

  return {
    search: localSearch,
    setSearch,
    activeFilters,
    setActiveFilters,
    removeFilter,
    sortBy,
    sortOrder,
    setSorting,
    page,
    limit,
    setPage,
    setLimit,
    apiParams,
  };
}
