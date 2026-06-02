"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { activityApi } from "@/services/api";
import { Activity, ListColumnConfig } from "@/types";
import { useListParams } from "@/hooks/useListParams";
import { withFrom } from "@/hooks/useFromLink";
import { pluralize } from "@/utils/pluralize";
import type { FilterDefinition } from "@/components/ui/filter-modal";

import { ListToolbar } from "@/components/ui/list-toolbar";
import { Pagination } from "@/components/ui/pagination";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/page-table";
import { formatDate, formatDateTime, DATE_FORMATS } from "@/utils/date";

interface ActivityListProps {
  /** Activity-type key — used to build the row navigation link */
  activityTypeKey: string;
  /** Activity-type UUID — used to fetch filters/columns and scope the list */
  activityTypeId: string;
  /** Activity-type display name — used in placeholders and empty state */
  activityTypeName: string;
  /**
   * Extra API filters merged into every list request. Use this to scope the
   * list (e.g., to activities a given entity participated in). Not surfaced
   * in the filter modal.
   */
  extraFilters?: Record<string, string | undefined>;
  /**
   * Label used as the back-link target when navigating into a row's detail
   * page. Defaults to the plural activity-type name (e.g. "Sessions"). Pass
   * a richer label when the list is embedded inside another detail view
   * (e.g. the entity name when rendered under Entity → Activities).
   */
  fromLabel?: string;
  /**
   * When true, clicking a row opens the activity detail in a new tab
   * instead of navigating the current tab. Useful when the list is
   * embedded inside another detail page (e.g., entity Activities tab).
   */
  openRowInNewTab?: boolean;
}

export function ActivityList({
  activityTypeKey,
  activityTypeId,
  activityTypeName,
  extraFilters,
  fromLabel,
  openRowInNewTab = false,
}: ActivityListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { data: filterData } = useQuery({
    queryKey: ["activity-filters", activityTypeId],
    queryFn: () => activityApi.getFilters(activityTypeId || undefined),
    enabled: !!activityTypeId,
  });

  const columns: ListColumnConfig[] = filterData?.columns || [];
  const sortableKeys = new Set(filterData?.sortable_keys || []);

  const allFilterDefs: FilterDefinition[] = useMemo(() => {
    return (filterData?.filters || []).map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type as FilterDefinition["type"],
      section: f.section,
      options: f.options,
      min: f.min,
      max: f.max,
    }));
  }, [filterData]);

  const filterDefinitions: FilterDefinition[] = useMemo(() => {
    return allFilterDefs.filter((f) => f.key !== "activity_type_id");
  }, [allFilterDefs]);

  const listParams = useListParams({
    defaultSortBy: "created_at",
    defaultSortOrder: "desc",
    filterDefinitions: allFilterDefs,
    columns,
  });

  const { data: response, isLoading } = useQuery({
    queryKey: ["activities", activityTypeId, listParams.apiParams, extraFilters],
    queryFn: () =>
      activityApi.listPaginated({
        ...listParams.apiParams,
        activity_type_id: activityTypeId || undefined,
        ...extraFilters,
      }),
    enabled: !!activityTypeId,
  });

  const activities = response?.data || [];
  const totalCount = response?.count || 0;
  const totalPages = Math.ceil(totalCount / listParams.limit);

  const renderCellValue = (activity: Activity, col: ListColumnConfig) => {
    if (col.field_type === "static") {
      switch (col.key) {
        case "participant_count":
          return activity.participant_count;
        case "created_at":
          return formatDate(activity.created_at, DATE_FORMATS.DISPLAY);
        case "created_by":
          return activity.created_by_name || "—";
        default:
          return "—";
      }
    }
    if (col.field_type === "dimension") {
      const dim = activity.dimensions.find(
        (d) => d.dimension_key === col.dimension_key,
      );
      return dim ? dim.value_name : "—";
    }
    const metaKey = col.key.replace(/^meta:/, "");
    const val = activity.meta?.[metaKey];
    if (val === undefined || val === null) return "—";
    if (col.field_type === "date" && typeof val === "string") return formatDate(val);
    if (col.field_type === "datetime" && typeof val === "string") return formatDateTime(val);
    if (Array.isArray(val)) return val.join(", ");
    if (typeof val === "boolean") return val ? "Yes" : "No";
    return String(val);
  };

  const pluralName = pluralize(activityTypeName);
  const backLabel = fromLabel ?? pluralName;
  const search = searchParams.toString();
  const fromUrl = search ? `${pathname}?${search}` : pathname;

  return (
    <>
      <ListToolbar
        search={listParams.search}
        onSearchChange={listParams.setSearch}
        filterDefinitions={filterDefinitions}
        activeFilters={listParams.activeFilters}
        onFiltersChange={listParams.setActiveFilters}
        onRemoveFilter={listParams.removeFilter}
        searchPlaceholder={`Search ${pluralName.toLowerCase()}...`}
      />

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : activities.length === 0 ? (
        <p className="text-gray-500 text-sm">No {pluralName.toLowerCase()} found.</p>
      ) : (
        <div className="bg-white shadow-sm border rounded-lg overflow-hidden">
          <Table
            stickyRows={1}
            className="max-h-[calc(100vh-400px)] lg:max-h-[calc(100vh-200px)]"
          >
            <TableHeader>
              <TableRow>
                {columns.map((col) =>
                  sortableKeys.has(col.key) ? (
                    <SortableTableHead
                      key={col.key}
                      label={col.label}
                      sortKey={col.key}
                      currentSortBy={listParams.sortBy}
                      currentSortOrder={listParams.sortOrder}
                      onSort={listParams.setSorting}
                    />
                  ) : (
                    <TableHead key={col.key}>{col.label}</TableHead>
                  ),
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {activities.map((a) => (
                <TableRow
                  key={a.id}
                  onClick={() => {
                    const href = withFrom(
                      `/activities/${activityTypeKey}/${a.id}`,
                      fromUrl,
                      backLabel,
                    );
                    if (openRowInNewTab) {
                      window.open(href, "_blank", "noopener");
                    } else {
                      router.push(href);
                    }
                  }}
                >
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={
                        col.key === "title"
                          ? "font-medium"
                          : col.key === "created_at"
                            ? "text-gray-500"
                            : ""
                      }
                    >
                      {renderCellValue(a, col)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            currentPage={listParams.page}
            totalPages={totalPages}
            totalItems={totalCount}
            itemsPerPage={listParams.limit}
            onPageChange={listParams.setPage}
            onItemsPerPageChange={listParams.setLimit}
            itemLabel={pluralName.toLowerCase()}
          />
        </div>
      )}
    </>
  );
}
