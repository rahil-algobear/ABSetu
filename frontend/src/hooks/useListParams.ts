"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useMemo, useCallback, useRef, useEffect, useState } from "react";

export interface FilterValue {
  key: string; // e.g. "entity_type_id", "dim:uuid", "meta:age"
  label: string; // display label for the filter
  value: string | string[]; // selected value(s)
  displayValue: string; // human-readable value for chip display
}

interface UseListParamsOptions {
  defaultSortBy?: string;
  defaultSortOrder?: "asc" | "desc";
  defaultLimit?: number;
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
 * 2. filter_* params
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
): string {
  const sp = new URLSearchParams();

  // 1. Search
  if (params.search) {
    sp.set("search", params.search);
  }

  // 2. Filters — repeated params for multi-value (like ABWealth)
  for (const f of params.filters) {
    const vals = Array.isArray(f.value) ? f.value : [f.value];
    for (const v of vals) {
      sp.append(`filter_${f.key}`, v);
    }
  }

  // 3. Sort (omit defaults)
  if (params.sortBy) {
    sp.set("sort_by", params.sortBy);
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

  // Parse current state from URL
  const search = searchParams.get("search") || "";

  const activeFilters = useMemo((): FilterValue[] => {
    // Collect all values per filter key (supports repeated params)
    const filterMap = new Map<string, string[]>();
    searchParams.forEach((value, key) => {
      if (key.startsWith("filter_")) {
        const filterKey = key.slice(7);
        const arr = filterMap.get(filterKey) || [];
        arr.push(value);
        filterMap.set(filterKey, arr);
      }
    });
    return Array.from(filterMap.entries()).map(([key, values]) => ({
      key,
      label: key, // Will be enriched by the page component
      value: values.length === 1 ? values[0] : values,
      displayValue: values.join(", "),
    }));
  }, [searchParams]);

  const sortBy = searchParams.get("sort_by") || defaultSortBy;
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
        );
        navigate(url);
      }, 500);
    },
    [pathname, activeFilters, sortBy, sortOrder, limit, defaultSortOrder, defaultLimit, navigate],
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
      );
      navigate(url);
    },
    [pathname, search, sortBy, sortOrder, limit, defaultSortOrder, defaultLimit, navigate],
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
      );
      navigate(url);
    },
    [pathname, search, activeFilters, page, limit, defaultSortOrder, defaultLimit, navigate],
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
      );
      navigate(url);
    },
    [pathname, search, activeFilters, sortBy, sortOrder, limit, defaultSortOrder, defaultLimit, navigate],
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
      );
      navigate(url);
    },
    [pathname, search, activeFilters, sortBy, sortOrder, defaultSortOrder, defaultLimit, navigate],
  );

  // Build API params — serialized for query key and API call
  const apiParams = useMemo(() => {
    // Convert activeFilters to JSON dict for backend
    const filtersDict: Record<string, string | string[]> = {};
    for (const f of activeFilters) {
      filtersDict[f.key] = f.value;
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
  }, [search, activeFilters, sortBy, sortOrder, page, limit]);

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
