"use client";

import { Fragment, useState, useMemo, useCallback, useRef } from "react";
import {
  Dialog as HDialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { useQuery } from "@tanstack/react-query";
import { dimensionApi, dimensionValueLinkApi } from "@/services/api";
import { Dimension, DimensionValue, DimensionValueLink } from "@/types";

import { usePermissions } from "@/components/Auth/Permissions";
import { useRouter } from "next/navigation";
import { X, GripVertical, Pencil } from "lucide-react";

interface DimensionMatrixDialogProps {
  open: boolean;
  onClose: () => void;
  /** Pre-select a dimension key as the row dimension when opening */
  defaultRowDimKey?: string;
  /** Show the "Edit Links" button that navigates to dimension-linking (default: true) */
  showEditButton?: boolean;
}

type HeaderCell = { label: string; colSpan: number; key: string };

type LeafColumn = {
  path: (DimensionValue | null)[]; // one per dimension, null if skipped
  rowValues: DimensionValue[];
};

export function DimensionMatrixDialog({
  open,
  onClose,
  defaultRowDimKey,
  showEditButton = true,
}: DimensionMatrixDialogProps) {

  const { can } = usePermissions();
  const router = useRouter();

  const { data: dimensions = [] } = useQuery<Dimension[]>({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
    enabled: open,
  });

  // The "row" dimension — defaults to the provided key, or the last dimension
  const [rowDimId, setRowDimId] = useState<string>("");

  const defaultRowDim = defaultRowDimKey
    ? dimensions.find((d) => d.key === defaultRowDimKey)
    : undefined;
  const effectiveRowDimId = rowDimId || defaultRowDim?.id || dimensions[dimensions.length - 1]?.id || "";
  const rowDimension = dimensions.find((d) => d.id === effectiveRowDimId);

  // Column dimensions = everything except the row dimension
  const columnDimensions = useMemo(
    () => dimensions.filter((d) => d.id !== effectiveRowDimId),
    [dimensions, effectiveRowDimId]
  );

  const [dimensionOrder, setDimensionOrder] = useState<string[]>([]);

  const orderedColumnDims = useMemo(() => {
    if (columnDimensions.length === 0) return [];
    const currentIds = new Set(columnDimensions.map((d) => d.id));
    const validOrder = dimensionOrder.filter((id) => currentIds.has(id));
    if (validOrder.length !== columnDimensions.length) {
      return columnDimensions;
    }
    return validOrder.map((id) => columnDimensions.find((d) => d.id === id)!);
  }, [columnDimensions, dimensionOrder]);

  // Reset column order when row dimension changes
  const prevRowDimRef = useRef(effectiveRowDimId);
  if (prevRowDimRef.current !== effectiveRowDimId) {
    prevRowDimRef.current = effectiveRowDimId;
    setDimensionOrder([]);
  }

  const { data: allDvsByDim = {} } = useQuery<Record<string, DimensionValue[]>>({
    queryKey: ["all-dvs-by-dim", dimensions.map((d) => d.id).join(",")],
    queryFn: async () => {
      const result: Record<string, DimensionValue[]> = {};
      await Promise.all(
        dimensions.map(async (dim) => {
          result[dim.id] = await dimensionApi.listValues(dim.id, true);
        })
      );
      return result;
    },
    enabled: open && dimensions.length > 0,
  });

  const rowDvs = allDvsByDim[effectiveRowDimId] || [];

  const { data: allDimensionValueLinks = [] } = useQuery<DimensionValueLink[]>({
    queryKey: ["dimension-value-links-all"],
    queryFn: () => dimensionValueLinkApi.list(),
    enabled: open,
  });

  // Bidirectional link lookup: dvId → Set<connected dvId>
  const linkMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const link of allDimensionValueLinks) {
      const { dimension_value_id_1: id1, dimension_value_id_2: id2 } = link;
      if (!map.has(id1)) map.set(id1, new Set());
      if (!map.has(id2)) map.set(id2, new Set());
      map.get(id1)!.add(id2);
      map.get(id2)!.add(id1);
    }
    return map;
  }, [allDimensionValueLinks]);

  // Build leaf columns and header rows
  const { headerRows, leafColumns } = useMemo(() => {
    if (orderedColumnDims.length === 0 || rowDvs.length === 0) {
      return { headerRows: [], leafColumns: [] };
    }

    // Find row dimension values connected to ALL non-null ancestor column values
    function findRowValues(ancestorDvIds: string[]): DimensionValue[] {
      if (ancestorDvIds.length === 0) return [];
      const result: DimensionValue[] = [];
      for (const rdv of rowDvs) {
        const conn = linkMap.get(rdv.id);
        if (!conn) continue;
        if (ancestorDvIds.every((pid) => conn.has(pid))) {
          result.push(rdv);
        }
      }
      return result;
    }

    function buildLeaves(
      dimIndex: number,
      pathSoFar: (DimensionValue | null)[],
      ancestorDvIds: string[]
    ): LeafColumn[] {
      if (dimIndex >= orderedColumnDims.length) {
        const vals = findRowValues(ancestorDvIds);
        if (vals.length > 0) {
          return [{ path: [...pathSoFar], rowValues: vals }];
        }
        if (ancestorDvIds.length > 0) {
          return [{ path: [...pathSoFar], rowValues: [] }];
        }
        return [];
      }

      const dim = orderedColumnDims[dimIndex];
      const dvs = allDvsByDim[dim.id] || [];

      const matchingDvs = ancestorDvIds.length === 0
        ? dvs
        : dvs.filter((dv) => {
            const connected = linkMap.get(dv.id);
            if (!connected) return false;
            return ancestorDvIds.every((pid) => connected.has(pid));
          });

      const results: LeafColumn[] = [];

      // Normal branches
      for (const dv of matchingDvs) {
        results.push(
          ...buildLeaves(
            dimIndex + 1,
            [...pathSoFar, dv],
            [...ancestorDvIds, dv.id]
          )
        );
      }

      // Gap branches: orphan values at deeper levels
      const matchingDvIdSet = new Set(matchingDvs.map((d) => d.id));
      for (
        let gapTarget = dimIndex + 1;
        gapTarget < orderedColumnDims.length;
        gapTarget++
      ) {
        const skippedDvIds = new Set(matchingDvIdSet);
        for (let s = dimIndex + 1; s < gapTarget; s++) {
          for (const sdv of allDvsByDim[orderedColumnDims[s].id] || []) {
            skippedDvIds.add(sdv.id);
          }
        }

        const targetDvs = allDvsByDim[orderedColumnDims[gapTarget].id] || [];
        const orphans = targetDvs.filter((tdv) => {
          if (ancestorDvIds.length > 0) {
            const conn = linkMap.get(tdv.id);
            if (!conn || !ancestorDvIds.every((pid) => conn.has(pid)))
              return false;
          }
          const conn = linkMap.get(tdv.id);
          if (!conn) return true;
          for (const sid of skippedDvIds) {
            if (conn.has(sid)) return false;
          }
          return true;
        });

        if (orphans.length > 0) {
          const gapPath = [...pathSoFar];
          for (let g = dimIndex; g < gapTarget; g++) gapPath.push(null);

          for (const orphan of orphans) {
            results.push(
              ...buildLeaves(
                gapTarget + 1,
                [...gapPath, orphan],
                [...ancestorDvIds, orphan.id]
              )
            );
          }
        }
      }

      // Gap-only leaf if nothing found
      if (results.length === 0 && ancestorDvIds.length > 0) {
        const gapPath = [...pathSoFar];
        for (let g = dimIndex; g < orderedColumnDims.length; g++)
          gapPath.push(null);
        const vals = findRowValues(ancestorDvIds);
        results.push({ path: gapPath, rowValues: vals });
      }

      return results;
    }

    const leaves = buildLeaves(0, [], []);

    // Build header rows
    const rows: HeaderCell[][] = [];
    for (let dimIndex = 0; dimIndex < orderedColumnDims.length; dimIndex++) {
      const row: HeaderCell[] = [];
      let col = 0;
      while (col < leaves.length) {
        const value = leaves[col].path[dimIndex];
        let span = 1;
        while (col + span < leaves.length) {
          const next = leaves[col + span];
          if (next.path[dimIndex]?.id !== value?.id) break;
          let ancestorsSame = true;
          for (let a = 0; a < dimIndex; a++) {
            if (next.path[a]?.id !== leaves[col].path[a]?.id) {
              ancestorsSame = false;
              break;
            }
          }
          if (!ancestorsSame) break;
          span++;
        }
        row.push({
          label: value?.name || "",
          colSpan: span,
          key: value?.id ? `${value.id}-${col}` : `gap-${dimIndex}-${col}`,
        });
        col += span;
      }
      rows.push(row);
    }

    return { headerRows: rows, leafColumns: leaves };
  }, [orderedColumnDims, allDvsByDim, rowDvs, linkMap]);

  // Drag and drop for dimension chip reordering
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const handleDragStart = useCallback((index: number) => {
    dragItem.current = index;
  }, []);

  const handleDragEnter = useCallback((index: number) => {
    dragOverItem.current = index;
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const items = [...(dimensionOrder.length === orderedColumnDims.length
      ? dimensionOrder
      : orderedColumnDims.map((d) => d.id))];
    const draggedItem = items.splice(dragItem.current, 1)[0];
    items.splice(dragOverItem.current, 0, draggedItem);
    setDimensionOrder(items);
    dragItem.current = null;
    dragOverItem.current = null;
  }, [dimensionOrder, orderedColumnDims]);

  const hasData = leafColumns.length > 0;

  return (
    <Transition show={open} as={Fragment}>
      <HDialog onClose={onClose} className="relative z-50">
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-2 sm:p-4">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="w-full max-w-[95vw] max-h-[90vh] rounded-xl bg-white shadow-xl flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
                  <DialogTitle className="text-lg font-semibold">
                    Dimension Matrix
                  </DialogTitle>
                  <div className="flex items-center gap-2">
                    {showEditButton && can("dimension:manage") && (
                      <button
                        onClick={() => {
                          onClose();
                          router.push("/admin/dimension-linking");
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
                      >
                        <Pencil size={14} />
                        Edit Links
                      </button>
                    )}
                    <button
                      onClick={onClose}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                {/* Row dimension selector + column reorder bar */}
                <div className="px-6 py-3 border-b bg-gray-50 shrink-0 space-y-3">
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-gray-500 font-medium">Row dimension:</label>
                    <select
                      className="border rounded-md px-2 py-1 text-sm"
                      value={effectiveRowDimId}
                      onChange={(e) => setRowDimId(e.target.value)}
                    >
                      {dimensions.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>

                  {orderedColumnDims.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-2">
                        Drag to reorder column hierarchy:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {orderedColumnDims.map((dim, index) => (
                          <div
                            key={dim.id}
                            draggable
                            onDragStart={() => handleDragStart(index)}
                            onDragEnter={() => handleDragEnter(index)}
                            onDragEnd={handleDragEnd}
                            onDragOver={(e) => e.preventDefault()}
                            className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow select-none"
                          >
                            <GripVertical className="h-3 w-3 text-gray-400" />
                            {dim.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Matrix content */}
                <div className="flex-1 overflow-auto p-6">
                  {!hasData ? (
                    <div className="text-center py-12 text-gray-500">
                      <p className="text-sm">
                        No dimension link connections found.
                      </p>
                      <p className="text-xs mt-1 text-gray-400">
                        Create dimension links to see the matrix.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm border-collapse">
                        <thead>
                          {/* One header row per column dimension level */}
                          {headerRows.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                              <th className="px-3 py-2 text-left font-medium text-gray-500 bg-gray-50 border border-gray-200 whitespace-nowrap sticky left-0 z-10">
                                {orderedColumnDims[rowIndex] ? orderedColumnDims[rowIndex].name : ""}
                              </th>
                              {row.map((cell) => (
                                <th
                                  key={cell.key}
                                  colSpan={cell.colSpan}
                                  className={`px-3 py-2 text-center font-medium border border-gray-200 whitespace-nowrap ${
                                    cell.label
                                      ? "text-gray-700 bg-gray-50"
                                      : "text-gray-300 bg-gray-50/50 italic"
                                  }`}
                                >
                                  {cell.label || "—"}
                                </th>
                              ))}
                            </tr>
                          ))}

                          {/* Row dimension values */}
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-500 bg-purple-50 border border-gray-200 sticky left-0 z-10">
                              {rowDimension ? rowDimension.name : ""}
                            </th>
                            {leafColumns.map((leaf, colIndex) => (
                              <td
                                key={colIndex}
                                className="px-2 py-3 text-center border border-gray-200 bg-purple-50 align-top"
                              >
                                <div className="flex flex-col gap-1">
                                  {leaf.rowValues.length > 0 ? (
                                    leaf.rowValues.map((rv) => (
                                      <span
                                        key={rv.id}
                                        className="inline-block text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded whitespace-nowrap"
                                      >
                                        {rv.name}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-xs text-gray-400">—</span>
                                  )}
                                </div>
                              </td>
                            ))}
                          </tr>
                        </thead>
                      </table>
                    </div>
                  )}
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </HDialog>
    </Transition>
  );
}
