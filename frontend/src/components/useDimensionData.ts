"use client";

/**
 * Shared dimension-data hook. Fetches dimensions, accessible values
 * (org-scoped), and value-to-value links via TanStack Query.
 *
 * Multiple call sites on the same page share the same queryKeys, so
 * react-query dedupes the requests automatically — no need to lift
 * the fetches to a higher component or context.
 *
 * DynamicMetaForm uses this to render dim fields and to compute
 * cross-field cascading. Wrappers that need to peek into the same
 * data (e.g. to look up display names for backend-supplied values)
 * can call this directly without paying for an extra fetch.
 */

import { useQuery } from "@tanstack/react-query";

import { dimensionApi, dimensionValueLinkApi } from "@/services/api";
import type {
  Dimension,
  DimensionValue,
  DimensionValueLink,
} from "@/types";

export interface DimensionData {
  dimensions: Dimension[];
  allDimensionValues: DimensionValue[];
  dimensionValueLinks: DimensionValueLink[];
}

export function useDimensionData(): DimensionData {
  const { data: dimensions = [] } = useQuery<Dimension[]>({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
  });

  const { data: allDimensionValues = [] } = useQuery<DimensionValue[]>({
    queryKey: [
      "all-dimension-values",
      dimensions.map((d) => d.id).join(","),
    ],
    queryFn: async () => {
      const results = await Promise.all(
        dimensions.map((d) => dimensionApi.listAccessibleValues(d.id)),
      );
      return results.flat();
    },
    enabled: dimensions.length > 0,
  });

  const { data: dimensionValueLinks = [] } = useQuery<DimensionValueLink[]>({
    queryKey: ["dimension-value-links-all"],
    queryFn: () => dimensionValueLinkApi.list(),
  });

  return { dimensions, allDimensionValues, dimensionValueLinks };
}

/**
 * Cascading dimension filter — values for one dimension narrow when
 * other dimensions are already selected, using the admin-configured
 * value links. Pure function so it's usable outside React.
 */
export function filterEligibleValues(
  targetDimValues: DimensionValue[],
  selectedByDim: Record<string, string>,
  targetDimId: string,
  dimensionValueLinks: DimensionValueLink[],
): DimensionValue[] {
  const otherSelections = Object.entries(selectedByDim)
    .filter(([dimId, dvId]) => dimId !== targetDimId && dvId)
    .map(([, dvId]) => dvId);

  if (otherSelections.length === 0) return targetDimValues;

  const linkPairs = new Set<string>();
  for (const link of dimensionValueLinks) {
    linkPairs.add(`${link.dimension_value_id_1}:${link.dimension_value_id_2}`);
    linkPairs.add(`${link.dimension_value_id_2}:${link.dimension_value_id_1}`);
  }

  return targetDimValues.filter((dv) =>
    otherSelections.every((selectedId) =>
      linkPairs.has(`${dv.id}:${selectedId}`),
    ),
  );
}

/**
 * Build a {dimension_id → selected value_id} map from the form's
 * dimension value array, using the allDimensionValues lookup to map
 * value_id → dimension_id.
 */
export function buildSelectedByDim(
  selectedValueIds: string[],
  allDimensionValues: DimensionValue[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const dvId of selectedValueIds) {
    const dv = allDimensionValues.find((v) => v.id === dvId);
    if (dv) map[dv.dimension_id] = dvId;
  }
  return map;
}
