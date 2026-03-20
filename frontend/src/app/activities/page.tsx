"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  activityApi,
  activityTypeApi,
} from "@/services/api";
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
import { formatDate, DATE_FORMATS } from "@/utils/date";

function ActivitiesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeKey = searchParams.get("type");

  const { data: activityTypes = [] } = useQuery({
    queryKey: ["activity-types"],
    queryFn: activityTypeApi.list,
  });

  // Determine activity type from URL param
  const activityType = activityTypes.find((c) => c.key === typeKey);
  const selectedTypeId = activityType?.id || "";
  const typeName = activityType?.name || "Activity";

  // Fetch filter definitions
  const { data: filterData } = useQuery({
    queryKey: ["activity-filters"],
    queryFn: activityApi.getFilters,
  });

  // All definitions (for slug mapping in useListParams)
  const allFilterDefs: FilterDefinition[] = useMemo(() => {
    return (filterData?.filters || []).map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type as FilterDefinition["type"],
      options: f.options,
      min: f.min,
      max: f.max,
    }));
  }, [filterData]);

  // Definitions for the filter modal (without activity_type_id — implicit from URL)
  const filterDefinitions: FilterDefinition[] = useMemo(() => {
    return allFilterDefs.filter((f) => f.key !== "activity_type_id");
  }, [allFilterDefs]);

  // List params from URL — uses filter definitions for slug mapping
  const listParams = useListParams({
    defaultSortBy: "start_date",
    defaultSortOrder: "desc",
    filterDefinitions: allFilterDefs,
  });

  // Paginated activity list — scoped to activity type
  const { data: response, isLoading } = useQuery({
    queryKey: ["activities", selectedTypeId, listParams.apiParams],
    queryFn: () =>
      activityApi.listPaginated({
        ...listParams.apiParams,
        activity_type_id: selectedTypeId || undefined,
      }),
  });

  const activities = response?.data || [];
  const totalCount = response?.count || 0;
  const totalPages = Math.ceil(totalCount / listParams.limit);

  const getActivityTitle = (a: (typeof activities)[0]) => {
    if (a.title) return a.title;
    if (a.dimensions.length > 0) return a.dimensions[0].value_name;
    return typeName;
  };

  // Derive unique dimension columns from loaded activities
  const dimensionColumns = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of activities) {
      for (const dim of a.dimensions) {
        if (!seen.has(dim.dimension_key)) {
          seen.set(dim.dimension_key, dim.dimension_name);
        }
      }
    }
    return Array.from(seen.entries()).map(([key, name]) => ({ key, name }));
  }, [activities]);

  return (
    <PageLayout>
      <PageHeader
        title={`${typeName}s`}
        actions={
          <Can permission="activity:create">
            <Button size="sm" onClick={() => router.push(`/activities/new?type=${typeKey}`)}>
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
          searchPlaceholder={`Search ${typeName.toLowerCase()}s...`}
        />

        {isLoading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : activities.length === 0 ? (
          <p className="text-gray-500 text-sm">No {typeName.toLowerCase()}s found.</p>
        ) : (
          <>
            <div className="bg-white shadow-sm border rounded-lg overflow-hidden">
              <Table stickyRows={1} className="h-[calc(100vh-400px)] lg:h-[calc(100vh-300px)]">
                <TableHeader>
                  <TableRow>
                    <SortableTableHead
                      label="Start Date"
                      sortKey="start_date"
                      currentSortBy={listParams.sortBy}
                      currentSortOrder={listParams.sortOrder}
                      onSort={listParams.setSorting}
                    />
                    <TableHead>End Date</TableHead>
                    <TableHead>Title</TableHead>
                    {dimensionColumns.map((dc) => (
                      <TableHead key={dc.key}>{dc.name}</TableHead>
                    ))}
                    {!activityType && <TableHead>Type</TableHead>}
                    <TableHead>Participants</TableHead>
                    <SortableTableHead
                      label="Created"
                      sortKey="created_at"
                      currentSortBy={listParams.sortBy}
                      currentSortOrder={listParams.sortOrder}
                      onSort={listParams.setSorting}
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activities.map((a) => (
                    <TableRow
                      key={a.id}
                      onClick={() => router.push(`/activities/${a.id}`)}
                    >
                      <TableCell>{formatDate(a.start_date)}</TableCell>
                      <TableCell>{formatDate(a.end_date)}</TableCell>
                      <TableCell className="font-medium">
                        <Link
                          href={`/activities/${a.id}`}
                          className="text-primary hover:underline"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          {getActivityTitle(a)}
                        </Link>
                      </TableCell>
                      {dimensionColumns.map((dc) => {
                        const dim = a.dimensions.find((d) => d.dimension_key === dc.key);
                        return (
                          <TableCell key={dc.key}>
                            {dim ? dim.value_name : "—"}
                          </TableCell>
                        );
                      })}
                      {!activityType && (
                        <TableCell className="text-gray-500">
                          {a.activity_type_name}
                        </TableCell>
                      )}
                      <TableCell>{a.participant_count}</TableCell>
                      <TableCell className="text-gray-500">
                        {formatDate(a.updated_at, DATE_FORMATS.DISPLAY)}
                      </TableCell>
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
                itemLabel={`${typeName.toLowerCase()}s`}
              />
            </div>
          </>
        )}
      </PageContent>
    </PageLayout>
  );
}

export default function ActivitiesPage() {
  return (
    <Suspense fallback={<PageLayout><PageContent><p className="text-gray-500">Loading...</p></PageContent></PageLayout>}>
      <ActivitiesPageContent />
    </Suspense>
  );
}
