"use client";

/**
 * Server-paginated participant table for a single section of an
 * activity. Read-only — bulk edit lives in ParticipantSectionEditor.
 *
 * URL-backed search / sort / page via useListParams, same as the
 * activity listing page. Search and sort are by participant name
 * (resolved server-side, section-scoped). Each page fetch returns rows
 * with a server-resolved display_name, so we don't batch-load names on
 * the client. Names link to the entity detail page (new tab) for
 * entity participants; user rows render plain text.
 */

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

import { activityApi } from "@/services/api";
import { ActivityParticipant, MetaFieldDefinition } from "@/types";
import { useListParams } from "@/hooks/useListParams";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { ListToolbar } from "@/components/ui/list-toolbar";

interface ParticipantListProps {
  activityId: string;
  /** Section identity — what the bulk-edit code calls section_key. */
  sectionKey: string;
  /** Entity-type key for building the participant-row link. Null for
   *  user sections (no detail page) and for entity sections with no
   *  configured type key (rare). */
  entityTypeKey?: string | null;
  /** Per-participant meta fields to render as columns. Comes from the
   *  schema for this section's (activity_type, dimensions). */
  metaFields: MetaFieldDefinition[];
  /** Render the Status column. */
  hasStatus: boolean;
  /** Display label for the section (used in the search placeholder). */
  sectionLabel: string;
}

export function ParticipantList({
  activityId,
  sectionKey,
  entityTypeKey,
  metaFields,
  hasStatus,
  sectionLabel,
}: ParticipantListProps) {
  const listParams = useListParams({
    defaultSortOrder: "asc",
    defaultLimit: 25,
  });

  const { data: response, isLoading } = useQuery({
    queryKey: ["participants-page", activityId, sectionKey, listParams.apiParams],
    queryFn: () =>
      activityApi.getParticipantsPage(activityId, {
        section_key: sectionKey,
        page: listParams.apiParams.page,
        limit: listParams.apiParams.limit,
        search: listParams.apiParams.search,
        sort_by: listParams.apiParams.sort_by,
        sort_order: listParams.apiParams.sort_order,
      }),
  });

  const rows = response?.data || [];
  const totalCount = response?.count || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / listParams.limit));

  const nameSortActive = listParams.sortBy === "name";

  const renderName = (p: ActivityParticipant) => {
    const name = p.display_name || p.participant_id;
    if (p.participant_type === "entity" && entityTypeKey) {
      return (
        <Link
          href={`/entities/${entityTypeKey}/${p.participant_id}`}
          target="_blank"
          rel="noopener"
          className="text-purple-600 hover:underline"
        >
          {name}
        </Link>
      );
    }
    return name;
  };

  return (
    <div className="space-y-2">
      <ListToolbar
        search={listParams.search}
        onSearchChange={listParams.setSearch}
        filterDefinitions={[]}
        activeFilters={[]}
        onFiltersChange={() => {}}
        onRemoveFilter={() => {}}
        searchPlaceholder={`Search ${sectionLabel.toLowerCase()}...`}
      />

      {isLoading && !response ? (
        <p className="text-gray-500 text-sm py-2">Loading…</p>
      ) : totalCount === 0 ? (
        <p className="text-gray-400 text-xs italic py-2">
          {listParams.search ? "No matches" : "No participants added yet"}
        </p>
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium min-w-[10rem]">
                  <button
                    type="button"
                    onClick={() =>
                      listParams.setSorting(
                        "name",
                        nameSortActive && listParams.sortOrder === "asc"
                          ? "desc"
                          : "asc",
                      )
                    }
                    className="inline-flex items-center gap-1 hover:text-gray-900"
                  >
                    Name
                    {nameSortActive ? (
                      listParams.sortOrder === "asc" ? (
                        <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
                    )}
                  </button>
                </th>
                {hasStatus && (
                  <th className="text-left px-3 py-2 font-medium min-w-[6rem]">
                    Status
                  </th>
                )}
                {metaFields.map((f) => (
                  <th
                    key={f.key}
                    className="text-left px-3 py-2 font-medium min-w-[10rem]"
                  >
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-3 py-2 min-w-[10rem] whitespace-nowrap">
                    {renderName(p)}
                  </td>
                  {hasStatus && (
                    <td className="px-3 py-2 min-w-[6rem]">
                      {p.status && (
                        <Badge
                          variant={p.status === "present" ? "default" : "secondary"}
                        >
                          {p.status}
                        </Badge>
                      )}
                    </td>
                  )}
                  {metaFields.map((f) => {
                    const val = p.meta?.[f.key];
                    const empty = val === undefined || val === null || val === "";
                    const display = empty
                      ? "—"
                      : f.type === "boolean"
                        ? val ? "Yes" : "No"
                        : Array.isArray(val)
                          ? val.join(", ")
                          : String(val);
                    return (
                      <td
                        key={f.key}
                        className="px-3 py-2 text-gray-700 min-w-[10rem]"
                      >
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalCount > 0 && (
        <Pagination
          currentPage={listParams.page}
          totalPages={totalPages}
          totalItems={totalCount}
          itemsPerPage={listParams.limit}
          onPageChange={listParams.setPage}
          onItemsPerPageChange={listParams.setLimit}
          itemLabel="participants"
        />
      )}
    </div>
  );
}
