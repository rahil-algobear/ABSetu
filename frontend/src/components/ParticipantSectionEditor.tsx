"use client";

/**
 * Server-paginated editor for one participant section. The view-mode
 * twin is ParticipantList; the editor uses the same paginated GET so
 * sections of 500 participants don't render 500 inputs in the DOM.
 *
 * Save model: the user edits cells on the current page; "Save" sends a
 * bulk-patch with just the touched rows for that page; unchanged rows
 * on the page (and rows on other pages) are not in the payload and stay
 * untouched. Page navigation is blocked while there are unsaved edits
 * so we never silently drop a save.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { activityApi } from "@/services/api";
import { MetaFieldDefinition } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { DynamicMetaForm } from "@/components/DynamicMetaForm";
import { X } from "lucide-react";
import toast from "react-hot-toast";

interface PageEdit {
  status?: string | null;
  meta?: Record<string, unknown>;
  removed?: boolean;
}

interface ParticipantSectionEditorProps {
  activityId: string;
  sectionKey: string;
  /** The schema field that defines this section — drives status capture
   *  and status options. */
  field: MetaFieldDefinition;
  /** Per-participant meta fields to render as editable cells. */
  metaFields: MetaFieldDefinition[];
  onClose: () => void;
  pageSize?: number;
}

export function ParticipantSectionEditor({
  activityId,
  sectionKey,
  field,
  metaFields,
  onClose,
  pageSize = 25,
}: ParticipantSectionEditorProps) {
  const queryClient = useQueryClient();
  const captureStatus = (field.config?.capture_status as boolean) || false;
  const statuses = (field.config?.statuses as string[]) || ["present", "absent"];

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(pageSize);
  // Edits keyed by participant-row id (server PK), scoped to the
  // current page. Cleared on successful save.
  const [pageEdits, setPageEdits] = useState<Record<string, PageEdit>>({});

  const { data: response, isLoading, isFetching } = useQuery({
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

  const isDirty = Object.keys(pageEdits).length > 0;

  const setEdit = (rowId: string, patch: PageEdit) => {
    setPageEdits((prev) => ({ ...prev, [rowId]: { ...prev[rowId], ...patch } }));
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const updates: {
        participant_id: string;
        section_key: string;
        status?: string | null;
        meta?: Record<string, unknown>;
      }[] = [];
      const removes: { participant_id: string; section_key: string }[] = [];
      for (const [rowId, edit] of Object.entries(pageEdits)) {
        const row = rows.find((r) => r.id === rowId);
        if (!row) continue;
        if (edit.removed) {
          removes.push({
            participant_id: row.participant_id,
            section_key: sectionKey,
          });
          continue;
        }
        const update: typeof updates[number] = {
          participant_id: row.participant_id,
          section_key: sectionKey,
        };
        if (edit.status !== undefined) update.status = edit.status;
        if (edit.meta !== undefined) update.meta = edit.meta;
        // Skip rows where only `removed` was set then unset — no-op.
        if (edit.status === undefined && edit.meta === undefined) continue;
        updates.push(update);
      }
      return activityApi.bulkPatchParticipants(activityId, { updates, removes });
    },
    onSuccess: () => {
      setPageEdits({});
      toast.success("Saved");
      queryClient.invalidateQueries({
        queryKey: ["participants-page", activityId, sectionKey],
      });
      // Also invalidate the load-all participants — the view-mode
      // section count and related lookups still use it during the
      // migration.
      queryClient.invalidateQueries({ queryKey: ["participants", activityId] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || "Failed to save");
    },
  });

  const attemptPageChange = (newPage: number) => {
    if (isDirty) {
      toast.error("Save your changes on this page first");
      return;
    }
    setPage(newPage);
  };

  const attemptClose = () => {
    if (isDirty) {
      const ok = confirm("You have unsaved changes on this page. Discard?");
      if (!ok) return;
    }
    onClose();
  };

  const visibleRows = useMemo(
    () => rows.filter((r) => !pageEdits[r.id]?.removed),
    [rows, pageEdits],
  );
  const removedRows = useMemo(
    () => rows.filter((r) => pageEdits[r.id]?.removed),
    [rows, pageEdits],
  );

  if (isLoading) return <p className="text-gray-500 text-sm py-2">Loading…</p>;

  return (
    <div className="space-y-3">
      {totalCount === 0 ? (
        <p className="text-gray-400 text-xs italic py-2">
          No participants in this section. Cancel and use the picker to add.
        </p>
      ) : (
        <>
          <div className="border rounded-md overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="w-8" />
                  <th className="text-left px-3 py-2 font-medium min-w-[10rem]">
                    Name
                  </th>
                  {captureStatus && (
                    <th className="text-left px-3 py-2 font-medium min-w-[6rem]">
                      Status
                    </th>
                  )}
                  {metaFields.map((f) => (
                    <th
                      key={f.key}
                      className="text-left px-3 py-2 font-medium min-w-[12rem]"
                    >
                      {f.label}
                      {f.required && (
                        <span className="text-red-500 ml-0.5">*</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => {
                  const edit = pageEdits[r.id] || {};
                  const status = edit.status ?? r.status ?? "";
                  const meta = edit.meta ?? r.meta ?? {};
                  return (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => setEdit(r.id, { removed: true })}
                          className="text-gray-400 hover:text-red-500"
                          title="Remove"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                      <td className="px-3 py-2 min-w-[10rem] whitespace-nowrap">
                        {r.display_name || r.participant_id}
                      </td>
                      {captureStatus && (
                        <td className="px-3 py-2 min-w-[6rem]">
                          <select
                            className="border rounded px-2 py-1 text-xs w-full"
                            value={status}
                            onChange={(e) =>
                              setEdit(r.id, { status: e.target.value })
                            }
                          >
                            <option value=""></option>
                            {statuses.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}
                      {metaFields.map((f) => (
                        <td key={f.key} className="px-3 py-2 min-w-[12rem]">
                          <DynamicMetaForm
                            fields={[f]}
                            values={{ meta, dimensions: [] }}
                            onChange={(next) =>
                              setEdit(r.id, { meta: next.meta })
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {removedRows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b last:border-0 opacity-50 bg-red-50"
                  >
                    <td className="px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          setEdit(r.id, { removed: false })
                        }
                        className="text-gray-400 hover:text-gray-600 text-xs"
                        title="Undo remove"
                      >
                        Undo
                      </button>
                    </td>
                    <td
                      className="px-3 py-2 line-through"
                      colSpan={(captureStatus ? 1 : 0) + metaFields.length + 1}
                    >
                      {r.display_name || r.participant_id}
                      <Badge variant="secondary" className="ml-2">
                        Will be removed on Save
                      </Badge>
                    </td>
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
            onPageChange={attemptPageChange}
            onItemsPerPageChange={(n) => {
              if (isDirty) {
                toast.error("Save your changes on this page first");
                return;
              }
              setLimit(n);
              setPage(1);
            }}
            itemLabel="participants"
          />
        </>
      )}

      <div className="flex gap-2 pt-2 border-t">
        <Button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={!isDirty || saveMutation.isPending || isFetching}
        >
          {saveMutation.isPending ? "Saving…" : "Save this page"}
        </Button>
        <Button type="button" variant="outline" onClick={attemptClose}>
          Done
        </Button>
      </div>
    </div>
  );
}
