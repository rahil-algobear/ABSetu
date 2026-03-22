"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useMemo, useCallback, useRef, useEffect, useState } from "react";
import type { FilterDefinition } from "@/components/ui/filter-modal";

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
  /** When provided, URL params use human-readable slugs instead of raw keys/UUIDs */
  filterDefinitions?: FilterDefinition[];
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

// --- Slug utilities ---

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

interface SlugMappings {
  keySlugToReal: Map<string, string>;
  keyRealToSlug: Map<string, string>;
  valueSlugToReal: Map<string, Map<string, string>>;
  valueRealToSlug: Map<string, Map<string, string>>;
}

function buildSlugMappings(defs: FilterDefinition[]): SlugMappings {
  const keySlugToReal = new Map<string, string>();
  const keyRealToSlug = new Map<string, string>();
  const valueSlugToReal = new Map<string, Map<string, string>>();
  const valueRealToSlug = new Map<string, Map<string, string>>();

  for (const def of defs) {
    const ks = slugify(def.label);
    keySlugToReal.set(ks, def.key);
    keyRealToSlug.set(def.key, ks);

    if (def.options) {
      const vsToR = new Map<string, string>();
      const vrToS = new Map<string, string>();
      for (const opt of def.options) {
        const vs = slugify(opt.label);
        vsToR.set(vs, opt.value);
        vrToS.set(opt.value, vs);
      }
      valueSlugToReal.set(def.key, vsToR);
      valueRealToSlug.set(def.key, vrToS);
    }
  }

  return { keySlugToReal, keyRealToSlug, valueSlugToReal, valueRealToSlug };
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
    const keySlug = slugMappings?.keyRealToSlug.get(f.key) || f.key;
    const valMap = slugMappings?.valueRealToSlug.get(f.key);
    const vals = Array.isArray(f.value) ? f.value : [f.value];
    for (const v of vals) {
      const valSlug = valMap?.get(v) || v;
      sp.append(`filter_${keySlug}`, valSlug);
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

  // Build slug mappings from filter definitions
  const slugMappings = useMemo((): SlugMappings | null => {
    if (!options.filterDefinitions?.length) return null;
    return buildSlugMappings(options.filterDefinitions);
  }, [options.filterDefinitions]);

  // Parse current state from URL
  const search = searchParams.get("search") || "";

  // Whether filter definitions are expected but still loading
  const defsLoading = !!options.filterDefinitions && options.filterDefinitions.length === 0;

  const activeFilters = useMemo((): FilterValue[] => {
    // Wait for filter definitions before parsing URL params — avoids sending
    // slug keys to the API and rendering merged chips before we can resolve them.
    if (defsLoading) return [];

    // Collect all values per filter key (supports repeated params)
    const filterMap = new Map<string, string[]>();
    const realKeySet = new Set(options.filterDefinitions?.map((d) => d.key) || []);

    searchParams.forEach((rawValue, paramKey) => {
      if (!paramKey.startsWith("filter_")) return;
      const urlKey = paramKey.slice(7);

      // Resolve key: direct match on real key first, then slug match
      let realKey: string;
      if (realKeySet.has(urlKey)) {
        realKey = urlKey;
      } else if (slugMappings?.keySlugToReal.has(urlKey)) {
        realKey = slugMappings.keySlugToReal.get(urlKey)!;
      } else {
        // No match — skip invalid param
        return;
      }

      // Resolve value: slug → real when mapping available
      const valMap = slugMappings?.valueSlugToReal.get(realKey);
      const realValue = valMap?.get(rawValue) || rawValue;

      const arr = filterMap.get(realKey) || [];
      arr.push(realValue);
      filterMap.set(realKey, arr);
    });

    return Array.from(filterMap.entries()).map(([key, values]) => {
      const def = options.filterDefinitions?.find((d) => d.key === key);
      const value = values.length === 1 ? values[0] : values;

      let displayValue = values.join(", ");
      if (def?.type === "date_range" && typeof value === "string") {
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
  }, [searchParams, slugMappings, options.filterDefinitions, defsLoading]);

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
      if (def?.type === "date_range" && typeof f.value === "string") {
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
