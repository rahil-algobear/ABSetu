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

type PathNode = {
  dimValue: DimensionValue;
  children: PathNode[];
  activityTypes: ActivityType[];
};

type HeaderCell = { label: string; colSpan: number; key: string };

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

  // Load all dimension values grouped by dimension
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

  // Load system dimension values (correspond 1:1 with activity types by name)
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

  // Build the hierarchical column tree and header rows
  const { headerRows, leafGroups } = useMemo(() => {
    if (orderedDimensions.length === 0 || systemDvs.length === 0) {
      return { headerRows: [], leafGroups: [] };
    }

    // Build tree: each node is a real dimension value.
    // Leaf nodes (last dimension) carry activityTypes directly.
    function buildTree(dimIndex: number, parentDvIds: string[]): PathNode[] {
      const dim = orderedDimensions[dimIndex];
      const dvs = allDvsByDim[dim.id] || [];
      const isLastDim = dimIndex === orderedDimensions.length - 1;
      const nodes: PathNode[] = [];

      for (const dv of dvs) {
        // This dv must be connected to every parent dv in the path
        if (parentDvIds.length > 0) {
          const connected = ruleMap.get(dv.id);
          if (!connected || !parentDvIds.every((pid) => connected.has(pid))) {
            continue;
          }
        }

        const pathSoFar = [...parentDvIds, dv.id];

        if (isLastDim) {
          // Leaf: find activity types connected to ALL dvIds in the full path
          const matchingAts: ActivityType[] = [];
          for (const sysDv of systemDvs) {
            const conn = ruleMap.get(sysDv.id);
            if (!conn) continue;
            if (pathSoFar.every((pid) => conn.has(pid))) {
              const at = sysDvToActivityType.get(sysDv.id);
              if (at) matchingAts.push(at);
            }
          }
          if (matchingAts.length > 0) {
            nodes.push({ dimValue: dv, children: [], activityTypes: matchingAts });
          }
        } else {
          // Intermediate: recurse deeper
          const children = buildTree(dimIndex + 1, pathSoFar);
          if (children.length > 0) {
            nodes.push({ dimValue: dv, children, activityTypes: [] });
          }
        }
      }

      return nodes;
    }

    const tree = buildTree(0, []);

    // Count leaf columns under a node (each leaf = 1 column)
    function countLeaves(node: PathNode): number {
      if (node.children.length === 0) return 1;
      return node.children.reduce((sum, c) => sum + countLeaves(c), 0);
    }

    // Collect header rows: one row per dimension level
    const rows: HeaderCell[][] = [];
    function collectHeaders(nodes: PathNode[], depth: number) {
      if (!rows[depth]) rows[depth] = [];
      for (const node of nodes) {
        const span = countLeaves(node);
        rows[depth].push({
          label: node.dimValue.name,
          colSpan: span,
          key: node.dimValue.id,
        });
        if (node.children.length > 0) {
          collectHeaders(node.children, depth + 1);
        }
      }
    }
    collectHeaders(tree, 0);

    // Collect leaf activity type groups (one group per leaf column)
    const leaves: ActivityType[][] = [];
    function collectLeaves(nodes: PathNode[]) {
      for (const node of nodes) {
        if (node.children.length === 0) {
          leaves.push(node.activityTypes);
        } else {
          collectLeaves(node.children);
        }
      }
    }
    collectLeaves(tree);

    return { headerRows: rows, leafGroups: leaves };
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

  const hasData = leafGroups.length > 0;

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
                              {/* Left label: dimension name */}
                              <th className="px-3 py-2 text-left font-medium text-gray-500 bg-gray-50 border border-gray-200 whitespace-nowrap sticky left-0 z-10">
                                {orderedDimensions[rowIndex]?.name || ""}
                              </th>
                              {row.map((cell) => (
                                <th
                                  key={cell.key}
                                  colSpan={cell.colSpan}
                                  className="px-3 py-2 text-center font-medium text-gray-700 bg-gray-50 border border-gray-200 whitespace-nowrap"
                                >
                                  {cell.label}
                                </th>
                              ))}
                            </tr>
                          ))}

                          {/* Activity type names — one column per leaf, types listed vertically */}
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-500 bg-purple-50 border border-gray-200 sticky left-0 z-10">
                              {vPlural("activity_type")}
                            </th>
                            {leafGroups.map((group, colIndex) => (
                              <td
                                key={colIndex}
                                className="px-2 py-3 text-center border border-gray-200 bg-purple-50 align-top"
                              >
                                <div className="flex flex-col gap-1">
                                  {group.map((at) => (
                                    <span
                                      key={at.id}
                                      className="inline-block text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded whitespace-nowrap"
                                    >
                                      {at.name}
                                    </span>
                                  ))}
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
