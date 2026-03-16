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
import { dimensionApi, tagRuleApi, activityTypeApi } from "@/services/api";
import { Dimension, DimensionValue, TagRule, ActivityType } from "@/types";
import { useVocabulary } from "@/hooks/useVocabulary";
import { X, GripVertical } from "lucide-react";

interface ActivityTypeMatrixDialogProps {
  open: boolean;
  onClose: () => void;
}

type HeaderCell = { label: string; colSpan: number; key: string };

type LeafColumn = {
  path: (DimensionValue | null)[]; // one per dimension, null if skipped
  activityTypes: ActivityType[];
};

export function ActivityTypeMatrixDialog({ open, onClose }: ActivityTypeMatrixDialogProps) {
  const { vPlural } = useVocabulary();

  const { data: dimensions = [] } = useQuery<Dimension[]>({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
    enabled: open,
  });

  const nonSystemDimensions = useMemo(
    () => dimensions.filter((d) => !d.is_system),
    [dimensions]
  );

  const systemDimension = useMemo(
    () => dimensions.find((d) => d.is_system === "activity_type"),
    [dimensions]
  );

  const [dimensionOrder, setDimensionOrder] = useState<string[]>([]);

  const orderedDimensions = useMemo(() => {
    if (nonSystemDimensions.length === 0) return [];
    const currentIds = new Set(nonSystemDimensions.map((d) => d.id));
    const validOrder = dimensionOrder.filter((id) => currentIds.has(id));
    if (validOrder.length !== nonSystemDimensions.length) {
      return nonSystemDimensions;
    }
    return validOrder.map((id) => nonSystemDimensions.find((d) => d.id === id)!);
  }, [nonSystemDimensions, dimensionOrder]);

  const { data: allDvsByDim = {} } = useQuery<Record<string, DimensionValue[]>>({
    queryKey: ["all-dvs-by-dim", nonSystemDimensions.map((d) => d.id).join(",")],
    queryFn: async () => {
      const result: Record<string, DimensionValue[]> = {};
      await Promise.all(
        nonSystemDimensions.map(async (dim) => {
          result[dim.id] = await dimensionApi.listValues(dim.id);
        })
      );
      return result;
    },
    enabled: open && nonSystemDimensions.length > 0,
  });

  const { data: systemDvs = [] } = useQuery<DimensionValue[]>({
    queryKey: ["dimension-values", systemDimension?.id],
    queryFn: () => dimensionApi.listValues(systemDimension!.id),
    enabled: open && !!systemDimension,
  });

  const { data: allTagRules = [] } = useQuery<TagRule[]>({
    queryKey: ["tag-rules-all"],
    queryFn: () => tagRuleApi.list(),
    enabled: open,
  });

  const { data: activityTypes = [] } = useQuery<ActivityType[]>({
    queryKey: ["activity-types"],
    queryFn: activityTypeApi.list,
    enabled: open,
  });

  // Bidirectional rule lookup: dvId → Set<connected dvId>
  const ruleMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const rule of allTagRules) {
      const { dimension_value_id_1: id1, dimension_value_id_2: id2 } = rule;
      if (!map.has(id1)) map.set(id1, new Set());
      if (!map.has(id2)) map.set(id2, new Set());
      map.get(id1)!.add(id2);
      map.get(id2)!.add(id1);
    }
    return map;
  }, [allTagRules]);

  // Map system dv id → activity type (matched by name)
  const sysDvToActivityType = useMemo(() => {
    const nameMap = new Map<string, ActivityType>();
    for (const at of activityTypes) {
      nameMap.set(at.name, at);
    }
    const map = new Map<string, ActivityType>();
    for (const dv of systemDvs) {
      const at = nameMap.get(dv.name);
      if (at) map.set(dv.id, at);
    }
    return map;
  }, [systemDvs, activityTypes]);

  // Build leaf columns and header rows
  const { headerRows, leafColumns } = useMemo(() => {
    if (orderedDimensions.length === 0 || systemDvs.length === 0) {
      return { headerRows: [], leafColumns: [] };
    }

    // Find activity types connected to ALL non-null dimension values in a path
    function findActivityTypes(ancestorDvIds: string[]): ActivityType[] {
      if (ancestorDvIds.length === 0) return [];
      const result: ActivityType[] = [];
      for (const sysDv of systemDvs) {
        const conn = ruleMap.get(sysDv.id);
        if (!conn) continue;
        if (ancestorDvIds.every((pid) => conn.has(pid))) {
          const at = sysDvToActivityType.get(sysDv.id);
          if (at) result.push(at);
        }
      }
      return result;
    }

    // Build leaf columns recursively. After normal branches through matching
    // values at the current level, also discovers "orphan" values at deeper
    // levels that aren't reachable through any value at the current level
    // (e.g. Transformation/Unlimited have no Project but should still appear
    // when Project is the first dimension in the ordering).
    function buildLeaves(
      dimIndex: number,
      pathSoFar: (DimensionValue | null)[],
      ancestorDvIds: string[]
    ): LeafColumn[] {
      if (dimIndex >= orderedDimensions.length) {
        const ats = findActivityTypes(ancestorDvIds);
        if (ats.length > 0) {
          return [{ path: [...pathSoFar], activityTypes: ats }];
        }
        if (ancestorDvIds.length > 0) {
          return [{ path: [...pathSoFar], activityTypes: [] }];
        }
        return [];
      }

      const dim = orderedDimensions[dimIndex];
      const dvs = allDvsByDim[dim.id] || [];

      const matchingDvs = ancestorDvIds.length === 0
        ? dvs
        : dvs.filter((dv) => {
            const connected = ruleMap.get(dv.id);
            if (!connected) return false;
            return ancestorDvIds.every((pid) => connected.has(pid));
          });

      const results: LeafColumn[] = [];

      // 1. Normal branches through matching values at this level
      for (const dv of matchingDvs) {
        results.push(
          ...buildLeaves(
            dimIndex + 1,
            [...pathSoFar, dv],
            [...ancestorDvIds, dv.id]
          )
        );
      }

      // 2. Gap branches: find orphan values at deeper levels that connect
      //    to ancestors but NOT to any matching value at this level (or
      //    intermediate skipped levels). These need a null gap at this level.
      const matchingDvIdSet = new Set(matchingDvs.map((d) => d.id));
      for (
        let gapTarget = dimIndex + 1;
        gapTarget < orderedDimensions.length;
        gapTarget++
      ) {
        // Collect all dimension value IDs in skipped levels
        // (current level uses only matching values; intermediate levels use all)
        const skippedDvIds = new Set(matchingDvIdSet);
        for (let s = dimIndex + 1; s < gapTarget; s++) {
          for (const sdv of allDvsByDim[orderedDimensions[s].id] || []) {
            skippedDvIds.add(sdv.id);
          }
        }

        const targetDvs = allDvsByDim[orderedDimensions[gapTarget].id] || [];
        const orphans = targetDvs.filter((tdv) => {
          // Must connect to all ancestors
          if (ancestorDvIds.length > 0) {
            const conn = ruleMap.get(tdv.id);
            if (!conn || !ancestorDvIds.every((pid) => conn.has(pid)))
              return false;
          }
          // Must NOT connect to any value in skipped levels
          const conn = ruleMap.get(tdv.id);
          if (!conn) return true;
          for (const sid of skippedDvIds) {
            if (conn.has(sid)) return false;
          }
          return true;
        });

        if (orphans.length > 0) {
          // Build path with nulls for all skipped levels
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

      // 3. If nothing found at all (no normal branches, no orphans), and
      //    there are ancestors, produce a gap-only leaf so the ancestor
      //    path still appears in the matrix
      if (results.length === 0 && ancestorDvIds.length > 0) {
        const gapPath = [...pathSoFar];
        for (let g = dimIndex; g < orderedDimensions.length; g++)
          gapPath.push(null);
        const ats = findActivityTypes(ancestorDvIds);
        results.push({ path: gapPath, activityTypes: ats });
      }

      return results;
    }

    const leaves = buildLeaves(0, [], []);

    // Build header rows from leaf paths.
    // Only merge consecutive cells when BOTH the current dimension value
    // AND all ancestor dimension values are the same — prevents merging
    // "Thane" across different programmes.
    const rows: HeaderCell[][] = [];
    for (let dimIndex = 0; dimIndex < orderedDimensions.length; dimIndex++) {
      const row: HeaderCell[] = [];
      let col = 0;
      while (col < leaves.length) {
        const value = leaves[col].path[dimIndex];
        let span = 1;
        while (col + span < leaves.length) {
          const next = leaves[col + span];
          // Same value at this level?
          if (next.path[dimIndex]?.id !== value?.id) break;
          // Same ancestors at all levels above?
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
  }, [orderedDimensions, allDvsByDim, systemDvs, ruleMap, sysDvToActivityType]);

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
    const items = [...(dimensionOrder.length === orderedDimensions.length
      ? dimensionOrder
      : orderedDimensions.map((d) => d.id))];
    const draggedItem = items.splice(dragItem.current, 1)[0];
    items.splice(dragOverItem.current, 0, draggedItem);
    setDimensionOrder(items);
    dragItem.current = null;
    dragOverItem.current = null;
  }, [dimensionOrder, orderedDimensions]);

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
                    {vPlural("activity_type")} Matrix
                  </DialogTitle>
                  <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Dimension chip reorder bar */}
                <div className="px-6 py-3 border-b bg-gray-50 shrink-0">
                  <p className="text-xs text-gray-500 mb-2">
                    Drag to reorder column hierarchy:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {orderedDimensions.map((dim, index) => (
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

                {/* Matrix content */}
                <div className="flex-1 overflow-auto p-6">
                  {!hasData ? (
                    <div className="text-center py-12 text-gray-500">
                      <p className="text-sm">
                        No {vPlural("activity_type").toLowerCase()} with tag rule connections found.
                      </p>
                      <p className="text-xs mt-1 text-gray-400">
                        Create tag rules between dimensions and {vPlural("activity_type").toLowerCase()} to see the matrix.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm border-collapse">
                        <thead>
                          {/* One header row per dimension level */}
                          {headerRows.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                              <th className="px-3 py-2 text-left font-medium text-gray-500 bg-gray-50 border border-gray-200 whitespace-nowrap sticky left-0 z-10">
                                {orderedDimensions[rowIndex]?.name || ""}
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

                          {/* Activity type names — one column per leaf */}
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-500 bg-purple-50 border border-gray-200 sticky left-0 z-10">
                              {vPlural("activity_type")}
                            </th>
                            {leafColumns.map((leaf, colIndex) => (
                              <td
                                key={colIndex}
                                className="px-2 py-3 text-center border border-gray-200 bg-purple-50 align-top"
                              >
                                <div className="flex flex-col gap-1">
                                  {leaf.activityTypes.length > 0 ? (
                                    leaf.activityTypes.map((at) => (
                                      <span
                                        key={at.id}
                                        className="inline-block text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded whitespace-nowrap"
                                      >
                                        {at.name}
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
