"use client";

import { useMemo, useState, DragEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { activityTypeApi, dimensionApi } from "@/services/api";
import {
  ActivityType,
  ActivityTypeAccess,
  Dimension,
  DimensionValue,
  DimensionValueRelationship,
} from "@/types";
import { Dialog } from "@/components/ui/dialog";
import { useVocabulary } from "@/hooks/useVocabulary";
import { GripVertical } from "lucide-react";

interface ActivityTypeMatrixDialogProps {
  open: boolean;
  onClose: () => void;
}

// A node in the column tree
interface ColumnNode {
  dimensionValue: DimensionValue;
  children: ColumnNode[];
}

// Flattened header cell for rendering
interface HeaderCell {
  label: string;
  colSpan: number;
  dimensionValueId: string;
}

export function ActivityTypeMatrixDialog({
  open,
  onClose,
}: ActivityTypeMatrixDialogProps) {
  const { vPlural } = useVocabulary();

  // Fetch all data needed
  const { data: dimensions = [] } = useQuery<Dimension[]>({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
    enabled: open,
  });

  const selectableDimensions = dimensions.filter((d) => !d.is_system);

  const { data: allDimensionValues = [] } = useQuery<DimensionValue[]>({
    queryKey: ["all-dimension-values", dimensions.map((d) => d.id).join(",")],
    queryFn: async () => {
      const results = await Promise.all(
        dimensions.map((d) => dimensionApi.listValues(d.id))
      );
      return results.flat();
    },
    enabled: dimensions.length > 0 && open,
  });

  const { data: relationships = [] } = useQuery<DimensionValueRelationship[]>({
    queryKey: ["dimension-relationships"],
    queryFn: dimensionApi.listRelationships,
    enabled: open,
  });

  const { data: activityTypes = [] } = useQuery<ActivityType[]>({
    queryKey: ["activity-types"],
    queryFn: activityTypeApi.list,
    enabled: open,
  });

  const { data: allAccess = [] } = useQuery<ActivityTypeAccess[]>({
    queryKey: ["activity-type-access"],
    queryFn: activityTypeApi.listAllAccess,
    enabled: open,
  });

  // Dimension ordering state (user can drag to reorder)
  const [dimOrder, setDimOrder] = useState<string[] | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // Initialize order from selectableDimensions when first available
  const orderedDimIds = useMemo(() => {
    if (dimOrder && dimOrder.length === selectableDimensions.length) {
      return dimOrder;
    }
    return selectableDimensions.map((d) => d.id);
  }, [dimOrder, selectableDimensions]);

  const orderedDims = useMemo(() => {
    const dimMap = new Map(selectableDimensions.map((d) => [d.id, d]));
    return orderedDimIds
      .map((id) => dimMap.get(id))
      .filter((d): d is Dimension => !!d);
  }, [orderedDimIds, selectableDimensions]);

  // Build lookup maps
  const dvMap = useMemo(() => {
    const map = new Map<string, DimensionValue>();
    for (const dv of allDimensionValues) map.set(dv.id, dv);
    return map;
  }, [allDimensionValues]);

  // children by parent_id
  const childrenByParent = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const rel of relationships) {
      const set = map.get(rel.parent_dimension_value_id) ?? new Set();
      set.add(rel.child_dimension_value_id);
      map.set(rel.parent_dimension_value_id, set);
    }
    return map;
  }, [relationships]);

  // Access by activity type
  const accessByType = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const entry of allAccess) {
      map.set(entry.activity_type_id, new Set(entry.dimension_value_ids));
    }
    return map;
  }, [allAccess]);

  // Build column tree from dimension order + relationships
  const { headerRows, leafColumns } = useMemo(() => {
    if (orderedDims.length === 0)
      return { headerRows: [] as HeaderCell[][], leafColumns: [] as string[][] };

    const dvsByDim = new Map<string, DimensionValue[]>();
    for (const dv of allDimensionValues) {
      const list = dvsByDim.get(dv.dimension_id) ?? [];
      list.push(dv);
      dvsByDim.set(dv.dimension_id, list);
    }

    // Build tree recursively
    function buildLevel(
      dimIndex: number,
      parentValueId: string | null
    ): ColumnNode[] {
      if (dimIndex >= orderedDims.length) return [];

      const dim = orderedDims[dimIndex];
      const dimValues = dvsByDim.get(dim.id) ?? [];

      let filteredValues: DimensionValue[];
      if (parentValueId === null) {
        // Top level: show all values for this dimension
        filteredValues = dimValues;
      } else {
        // Filter to children of parent
        const childIds = childrenByParent.get(parentValueId);
        if (!childIds || childIds.size === 0) return [];
        filteredValues = dimValues.filter((dv) => childIds.has(dv.id));
      }

      // Sort by sort_order
      filteredValues.sort((a, b) => a.sort_order - b.sort_order);

      return filteredValues.map((dv) => ({
        dimensionValue: dv,
        children: buildLevel(dimIndex + 1, dv.id),
      }));
    }

    const tree = buildLevel(0, null);

    // Flatten tree into header rows and leaf paths
    const rows: HeaderCell[][] = orderedDims.map(() => []);
    const leaves: string[][] = [];

    function countLeaves(node: ColumnNode): number {
      if (node.children.length === 0) return 1;
      return node.children.reduce((sum, c) => sum + countLeaves(c), 0);
    }

    function flatten(nodes: ColumnNode[], depth: number, path: string[]) {
      for (const node of nodes) {
        const span = countLeaves(node);
        rows[depth].push({
          label: node.dimensionValue.name,
          colSpan: span,
          dimensionValueId: node.dimensionValue.id,
        });
        const newPath = [...path, node.dimensionValue.id];
        if (node.children.length === 0) {
          // Leaf: also fill empty cells for remaining dimension levels
          for (let d = depth + 1; d < orderedDims.length; d++) {
            rows[d].push({ label: "", colSpan: 1, dimensionValueId: "" });
          }
          leaves.push(newPath);
        } else {
          flatten(node.children, depth + 1, newPath);
        }
      }
    }

    flatten(tree, 0, []);

    return { headerRows: rows, leafColumns: leaves };
  }, [orderedDims, allDimensionValues, childrenByParent]);

  // For each leaf column, compute the list of activity types
  const columnActivityTypes = useMemo(() => {
    return leafColumns.map((path) => {
      // An activity type appears in this column if its access set contains
      // the leaf dimension value (last in path)
      const leafDvId = path[path.length - 1];
      return activityTypes.filter((at) => {
        const accessSet = accessByType.get(at.id);
        if (!accessSet) return false;
        return accessSet.has(leafDvId);
      });
    });
  }, [leafColumns, activityTypes, accessByType]);

  // Max rows needed (for alignment)
  const maxRows = Math.max(1, ...columnActivityTypes.map((col) => col.length));

  // Drag handlers for dimension reordering
  const handleDragStart = (e: DragEvent, idx: number) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const newOrder = [...orderedDimIds];
    const [moved] = newOrder.splice(dragIdx, 1);
    newOrder.splice(idx, 0, moved);
    setDimOrder(newOrder);
    setDragIdx(idx);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
  };

  const isLoading =
    !dimensions.length || !allDimensionValues.length || !activityTypes.length;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Activity Type Matrix"
      className="max-w-[95vw] w-full max-h-[90vh] flex flex-col"
    >
      {/* Dimension order toolbar */}
      <div className="mb-4">
        <p className="text-xs text-gray-500 mb-2">
          Drag to reorder column hierarchy:
        </p>
        <div className="flex flex-wrap gap-2">
          {orderedDims.map((dim, idx) => (
            <div
              key={dim.id}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium cursor-grab active:cursor-grabbing select-none transition-colors ${
                dragIdx === idx
                  ? "bg-purple-100 text-purple-800 ring-2 ring-purple-400"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              <GripVertical className="h-3 w-3 text-gray-400" />
              {dim.name}
            </div>
          ))}
        </div>
      </div>

      {/* Matrix table */}
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : leafColumns.length === 0 ? (
        <p className="text-sm text-gray-500">
          No relationships defined between dimensions. Set up dimension
          hierarchy to see the matrix.
        </p>
      ) : (
        <div className="overflow-auto flex-1 border rounded-lg">
          <table className="border-collapse text-sm min-w-full">
            <thead className="sticky top-0 z-10">
              {headerRows.map((row, rowIdx) => (
                <tr key={rowIdx}>
                  <th className="bg-gray-100 border border-gray-200 px-3 py-2 text-left font-semibold text-gray-700 sticky left-0 z-20 min-w-[120px]">
                    {orderedDims[rowIdx]?.name ?? ""}
                  </th>
                  {row.map((cell, cellIdx) => (
                    <th
                      key={cellIdx}
                      colSpan={cell.colSpan}
                      className="bg-gray-50 border border-gray-200 px-3 py-2 text-center font-medium text-gray-600 whitespace-nowrap"
                    >
                      {cell.label}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {Array.from({ length: maxRows }, (_, rowIdx) => (
                <tr key={rowIdx}>
                  <td className="border border-gray-200 px-3 py-1.5 bg-gray-50 sticky left-0 z-10 font-medium text-gray-500 text-xs">
                    {rowIdx === 0 ? vPlural("activity_type") : ""}
                  </td>
                  {columnActivityTypes.map((col, colIdx) => (
                    <td
                      key={colIdx}
                      className="border border-gray-200 px-3 py-1.5 text-center whitespace-nowrap"
                    >
                      {col[rowIdx] ? (
                        <span className="text-gray-800">{col[rowIdx].name}</span>
                      ) : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}
