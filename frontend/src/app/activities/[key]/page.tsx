"use client";

import { Suspense, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  activityApi,
  activityTypeApi,
} from "@/services/api";
import { Activity, ListColumnConfig } from "@/types";
import { Can } from "@/components/Auth/Permissions";
import { useListParams } from "@/hooks/useListParams";
import type { FilterDefinition } from "@/components/ui/filter-modal";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
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
import { PageLayout } from "@/components/ui/page-layout";
import { PageContent } from "@/components/ui/page-content";
import { Plus } from "lucide-react";
import Link from "next/link";
import { formatDate, formatDateTime, DATE_FORMATS } from "@/utils/date";

/** Simple English pluralizer for display names */
function pluralize(word: string): string {
  if (word.endsWith("y") && !/[aeiou]y$/i.test(word)) {
    return word.slice(0, -1) + "ies";
  }
  if (word.endsWith("s") || word.endsWith("x") || word.endsWith("z") || word.endsWith("sh") || word.endsWith("ch")) {
    return word + "es";
  }
  return word + "s";
}

function ActivityTypeListContent() {
  const { key: typeKey } = useParams<{ key: string }>();
  const router = useRouter();

  const { data: activityTypes = [] } = useQuery({
    queryKey: ["activity-types"],
    queryFn: activityTypeApi.list,
  });

  const activityType = activityTypes.find((c) => c.key === typeKey);
  const selectedTypeId = activityType?.id || "";
  const typeName = activityType?.name || "Activity";

  // Fetch filter definitions + column config (scoped by activity type)
  const { data: filterData } = useQuery({
    queryKey: ["activity-filters", selectedTypeId],
    queryFn: () => activityApi.getFilters(selectedTypeId || undefined),
    enabled: !!selectedTypeId,
  });

  const columns: ListColumnConfig[] = filterData?.columns || [];
  const sortableKeys = new Set(filterData?.sortable_keys || []);

  // All definitions (for slug mapping in useListParams)
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

  // Definitions for the filter modal (without activity_type_id — implicit from URL)
  const filterDefinitions: FilterDefinition[] = useMemo(() => {
    return allFilterDefs.filter((f) => f.key !== "activity_type_id");
  }, [allFilterDefs]);

  // List params from URL — uses filter defs + columns for slug mapping
  // (columns cover sortable-only fields that aren't in filter defs).
  const listParams = useListParams({
    defaultSortBy: "created_at",
    defaultSortOrder: "desc",
    filterDefinitions: allFilterDefs,
    columns,
  });

  // Paginated activity list — scoped to activity type
  const { data: response, isLoading } = useQuery({
    queryKey: ["activities", selectedTypeId, listParams.apiParams],
    queryFn: () =>
      activityApi.listPaginated({
        ...listParams.apiParams,
        activity_type_id: selectedTypeId || undefined,
      }),
    enabled: !!selectedTypeId,
  });

  const activities = response?.data || [];
  const totalCount = response?.count || 0;
  const totalPages = Math.ceil(totalCount / listParams.limit);

  const getActivityTitle = (a: Activity) => {
    if (a.title) return a.title;
    if (a.dimensions.length > 0) return a.dimensions[0].value_name;
    return typeName;
  };

  // Helper to render a cell value for a given column config
  const renderCellValue = (activity: Activity, col: ListColumnConfig) => {
    // Static built-in columns
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
    // Dimension columns
    if (col.field_type === "dimension") {
      const dim = activity.dimensions.find(
        (d) => d.dimension_key === col.dimension_key
      );
      return dim ? dim.value_name : "—";
    }
    // Meta field columns
    const metaKey = col.key.replace(/^meta:/, "");
    const val = activity.meta?.[metaKey];
    if (val === undefined || val === null) return "—";
    if (col.field_type === "date" && typeof val === "string") return formatDate(val);
    if (col.field_type === "datetime" && typeof val === "string") return formatDateTime(val);
    if (Array.isArray(val)) return val.join(", ");
    if (typeof val === "boolean") return val ? "Yes" : "No";
    return String(val);
  };

  return (
    <PageLayout>
      <PageHeader
        title={pluralize(typeName)}
        actions={
          <Can permission="activity:create">
            <Button size="sm" onClick={() => router.push(`/activities/${typeKey}/new`)}>
              <Plus className="h-4 w-4 mr-1" />
              New {typeName}
            </Button>
          </Can>
        }
      />

      <PageContent>
        <ListToolbar
          search={listParams.search}
          onSearchChange={listParams.setSearch}
          filterDefinitions={filterDefinitions}
          activeFilters={listParams.activeFilters}
          onFiltersChange={listParams.setActiveFilters}
          onRemoveFilter={listParams.removeFilter}
          searchPlaceholder={`Search ${pluralize(typeName).toLowerCase()}...`}
        />

        {isLoading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : activities.length === 0 ? (
          <p className="text-gray-500 text-sm">No {pluralize(typeName).toLowerCase()} found.</p>
        ) : (
          <>
            <div className="bg-white shadow-sm border rounded-lg overflow-hidden">
              <Table stickyRows={1} className="max-h-[calc(100vh-400px)] lg:max-h-[calc(100vh-300px)]">
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
                      )
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activities.map((a) => (
                    <TableRow
                      key={a.id}
                      onClick={() => router.push(`/activities/${typeKey}/${a.id}`)}
                    >
                      {columns.map((col) => (
                        <TableCell
                          key={col.key}
                          className={col.key === "title" ? "font-medium" : col.key === "created_at" ? "text-gray-500" : ""}
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
                itemLabel={pluralize(typeName).toLowerCase()}
              />
            </div>
          </>
        )}
      </PageContent>
    </PageLayout>
  );
}

export default function ActivityTypeListPage() {
  return (
    <Suspense fallback={<PageLayout><PageContent><p className="text-gray-500">Loading...</p></PageContent></PageLayout>}>
      <ActivityTypeListContent />
    </Suspense>
  );
}
