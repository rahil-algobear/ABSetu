import { useEffect, useRef, useCallback } from "react";
import { DimensionValue, DimensionValueLink } from "@/types";

/**
 * Pure utility: given dimension values, links, user access, and current selections,
 * compute any auto-selections that should be applied.
 *
 * Rules:
 * 1. If user has access to exactly 1 value in a dimension (and it's eligible), auto-select it.
 * 2. If selecting a value narrows a linked dimension to exactly 1 eligible value, auto-select it.
 * 3. Repeat until stable (no new selections).
 *
 * Returns the new dimension_value_ids array, or null if no changes needed.
 */
export function computeAutoSelections({
  dimensions,
  allDimensionValues,
  dimensionValueLinks,
  userDimensionValueIds,
  currentSelections,
}: {
  /** All dimensions (need id). */
  dimensions: { id: string }[];
  /** All dimension values across all dimensions. */
  allDimensionValues: DimensionValue[];
  /** All dimension value links. */
  dimensionValueLinks: DimensionValueLink[];
  /** The current user's accessible dimension value IDs (empty = unrestricted). */
  userDimensionValueIds: string[];
  /** Currently selected dimension value IDs. */
  currentSelections: string[];
}): string[] | null {
  // Build bidirectional link set
  const linkPairs = new Set<string>();
  for (const link of dimensionValueLinks) {
    linkPairs.add(`${link.dimension_value_id_1}:${link.dimension_value_id_2}`);
    linkPairs.add(`${link.dimension_value_id_2}:${link.dimension_value_id_1}`);
  }

  // Group dimension values by dimension ID
  const valuesByDim = new Map<string, DimensionValue[]>();
  for (const dv of allDimensionValues) {
    const list = valuesByDim.get(dv.dimension_id) || [];
    list.push(dv);
    valuesByDim.set(dv.dimension_id, list);
  }

  // Group user access by dimension
  const userAccessByDim = new Map<string, Set<string>>();
  if (userDimensionValueIds.length > 0) {
    for (const dvId of userDimensionValueIds) {
      const dv = allDimensionValues.find((v) => v.id === dvId);
      if (dv) {
        const set = userAccessByDim.get(dv.dimension_id) || new Set();
        set.add(dvId);
        userAccessByDim.set(dv.dimension_id, set);
      }
    }
  }

  // Build current selection map: dimId → selected dvId
  const selectionByDim = new Map<string, string>();
  for (const dvId of currentSelections) {
    const dv = allDimensionValues.find((v) => v.id === dvId);
    if (dv) {
      selectionByDim.set(dv.dimension_id, dvId);
    }
  }

  let changed = false;
  let stable = false;

  while (!stable) {
    stable = true;

    for (const dim of dimensions) {
      // Skip if already selected
      if (selectionByDim.has(dim.id)) continue;

      const dimValues = valuesByDim.get(dim.id) || [];

      // Filter by dimension value links (cascade from other selections)
      const otherSelections = Array.from(selectionByDim.entries())
        .filter(([dimId]) => dimId !== dim.id)
        .map(([, dvId]) => dvId);

      let eligible = dimValues;
      if (otherSelections.length > 0) {
        eligible = dimValues.filter((dv) =>
          otherSelections.every((selectedId) =>
            linkPairs.has(`${dv.id}:${selectedId}`)
          )
        );
      }

      // Further restrict by user access (if user has assignments for this dimension)
      const userAccess = userAccessByDim.get(dim.id);
      if (userAccess) {
        eligible = eligible.filter((dv) => userAccess.has(dv.id));
      }

      // Auto-select if exactly 1 eligible value
      if (eligible.length === 1) {
        selectionByDim.set(dim.id, eligible[0].id);
        changed = true;
        stable = false; // Re-run to cascade further
      }
    }
  }

  if (!changed) return null;

  return Array.from(selectionByDim.values());
}

/**
 * Hook that auto-selects dimension values based on user access and dimension linking.
 *
 * Call this in your form component. It will invoke `onAutoSelect` whenever
 * auto-selections are computed, passing the new dimension_value_ids array.
 */
export function useDimensionAutoSelect({
  dimensions,
  allDimensionValues,
  dimensionValueLinks,
  userDimensionValueIds,
  currentSelections,
  onAutoSelect,
}: {
  dimensions: { id: string }[];
  allDimensionValues: DimensionValue[];
  dimensionValueLinks: DimensionValueLink[];
  userDimensionValueIds: string[];
  currentSelections: string[];
  onAutoSelect: (dimensionValueIds: string[]) => void;
}) {
  // Track what we've already auto-applied to avoid infinite loops
  const lastApplied = useRef<string>("");

  const stableOnAutoSelect = useCallback(onAutoSelect, [onAutoSelect]);

  useEffect(() => {
    // Don't run until data is loaded
    if (dimensions.length === 0 || allDimensionValues.length === 0) return;

    const result = computeAutoSelections({
      dimensions,
      allDimensionValues,
      dimensionValueLinks,
      userDimensionValueIds,
      currentSelections,
    });

    if (result) {
      const key = result.slice().sort().join(",");
      if (key !== lastApplied.current) {
        lastApplied.current = key;
        stableOnAutoSelect(result);
      }
    }
  }, [
    dimensions,
    allDimensionValues,
    dimensionValueLinks,
    userDimensionValueIds,
    currentSelections,
    stableOnAutoSelect,
  ]);
}
