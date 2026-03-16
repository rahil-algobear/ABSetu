"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dimensionApi, tagRuleApi } from "@/services/api";
import { Dimension, DimensionValue, TagRule } from "@/types";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";

export default function TagRulesPage() {
  const queryClient = useQueryClient();

  const { data: dimensions = [] } = useQuery<Dimension[]>({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
  });

  const [dim1Id, setDim1Id] = useState<string>("");
  const [dim2Id, setDim2Id] = useState<string>("");

  // Auto-select first two dimensions
  const effectiveDim1 = dim1Id || dimensions[0]?.id || "";
  const effectiveDim2 = dim2Id || dimensions[1]?.id || "";

  const { data: values1 = [] } = useQuery<DimensionValue[]>({
    queryKey: ["dimension-values", effectiveDim1],
    queryFn: () => dimensionApi.listValues(effectiveDim1),
    enabled: !!effectiveDim1,
  });

  const { data: values2 = [] } = useQuery<DimensionValue[]>({
    queryKey: ["dimension-values", effectiveDim2],
    queryFn: () => dimensionApi.listValues(effectiveDim2),
    enabled: !!effectiveDim2,
  });

  const { data: rules = [] } = useQuery<TagRule[]>({
    queryKey: ["tag-rules", effectiveDim1, effectiveDim2],
    queryFn: () => tagRuleApi.list(effectiveDim1, effectiveDim2),
    enabled: !!effectiveDim1 && !!effectiveDim2,
  });

  // Build a set of active pairs for the matrix
  const activePairs = new Set(
    rules.map((r) => `${r.dimension_value_id_1}:${r.dimension_value_id_2}`)
  );

  const [pendingPairs, setPendingPairs] = useState<Set<string> | null>(null);
  const displayPairs = pendingPairs ?? activePairs;

  const togglePair = (v1Id: string, v2Id: string) => {
    const key = `${v1Id}:${v2Id}`;
    const next = new Set(displayPairs);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPendingPairs(next);
  };

  const bulkSyncMutation = useMutation({
    mutationFn: () => {
      const pairs: [string, string][] = Array.from(displayPairs).map((key) => {
        const [a, b] = key.split(":");
        return [a, b];
      });
      return tagRuleApi.bulkSync({
        dimension_id_1: effectiveDim1,
        dimension_id_2: effectiveDim2,
        pairs,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tag-rules"] });
      setPendingPairs(null);
      toast.success("Tag rules saved");
    },
    onError: () => toast.error("Failed to save tag rules"),
  });

  const hasPendingChanges = pendingPairs !== null;

  const dim1 = dimensions.find((d) => d.id === effectiveDim1);
  const dim2 = dimensions.find((d) => d.id === effectiveDim2);

  if (dimensions.length < 2) {
    return (
      <p className="text-gray-500 text-sm">
        You need at least 2 dimensions to define tag rules.
      </p>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Tag Rules</h2>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Define valid combinations between dimension values. Check cells to create rules.
      </p>

      {/* Dimension selectors */}
      <div className="flex gap-4 mb-4">
        <div>
          <label className="text-sm font-medium">Rows</label>
          <select
            className="ml-2 border rounded-md px-2 py-1 text-sm"
            value={effectiveDim1}
            onChange={(e) => { setDim1Id(e.target.value); setPendingPairs(null); }}
          >
            {dimensions.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Columns</label>
          <select
            className="ml-2 border rounded-md px-2 py-1 text-sm"
            value={effectiveDim2}
            onChange={(e) => { setDim2Id(e.target.value); setPendingPairs(null); }}
          >
            {dimensions.filter((d) => d.id !== effectiveDim1).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Matrix */}
      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">
                {dim1?.name} \ {dim2?.name}
              </th>
              {values2.map((v2) => (
                <th key={v2.id} className="px-3 py-2 text-center font-medium text-gray-700 border-b whitespace-nowrap">
                  {v2.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {values1.map((v1) => (
              <tr key={v1.id} className="border-b last:border-b-0">
                <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">
                  {v1.name}
                </td>
                {values2.map((v2) => {
                  const key = `${v1.id}:${v2.id}`;
                  const checked = displayPairs.has(key);
                  return (
                    <td key={v2.id} className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePair(v1.id, v2.id)}
                        className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasPendingChanges && (
        <div className="flex gap-2 mt-4">
          <Button onClick={() => bulkSyncMutation.mutate()} disabled={bulkSyncMutation.isPending}>
            Save Changes
          </Button>
          <Button variant="outline" onClick={() => setPendingPairs(null)}>
            Cancel
          </Button>
        </div>
      )}
    </>
  );
}
