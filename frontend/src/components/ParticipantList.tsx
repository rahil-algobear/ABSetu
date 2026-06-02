"use client";

/**
 * Server-paginated participant table for a single section of an
 * activity. Read-only — bulk edit lives in ParticipantSectionEditor.
 *
 * Each page fetch returns rows with a server-resolved display_name, so
 * we don't have to batch-load entity/user names on the client per
 * page. Names link to the entity detail page (new tab) for entity
 * participants; user rows render plain text.
 */

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { activityApi } from "@/services/api";
import { ActivityParticipant, MetaFieldDefinition } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";

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
  /** Page size. Defaults to 25 to match the rest of the app. */
  pageSize?: number;
}

export function ParticipantList({
  activityId,
  sectionKey,
  entityTypeKey,
  metaFields,
  hasStatus,
  pageSize = 25,
}: ParticipantListProps) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(pageSize);

  const { data: response, isLoading } = useQuery({
    queryKey: ["participants-page", activityId, sectionKey, page, limit],
    queryFn: () =>
      activityApi.getParticipantsPage(activityId, {
        section_key: sectionKey,
        page,
        limit,
      }),
  });

  const rows = response?.data || [];
  const totalCount = response?.count || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

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

  if (isLoading && !response) {
    return <p className="text-gray-500 text-sm py-2">Loading…</p>;
  }
  if (totalCount === 0) {
    return <p className="text-gray-400 text-xs italic py-2">No participants added yet</p>;
  }

  return (
    <div className="space-y-2">
      <div className="border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Name</th>
              {hasStatus && (
                <th className="text-left px-3 py-2 font-medium">Status</th>
              )}
              {metaFields.map((f) => (
                <th key={f.key} className="text-left px-3 py-2 font-medium">
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="px-3 py-2">{renderName(p)}</td>
                {hasStatus && (
                  <td className="px-3 py-2">
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
                    <td key={f.key} className="px-3 py-2 text-gray-700">
                      {display}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        currentPage={page}
        totalPages={totalPages}
        totalItems={totalCount}
        itemsPerPage={limit}
        onPageChange={setPage}
        onItemsPerPageChange={(n) => {
          setLimit(n);
          setPage(1);
        }}
        itemLabel="participants"
      />
    </div>
  );
}
