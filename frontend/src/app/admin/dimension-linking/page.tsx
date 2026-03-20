"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dimensionApi, dimensionValueLinkApi } from "@/services/api";
import { Dimension, DimensionValue, DimensionValueLink } from "@/types";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { LayoutGrid } from "lucide-react";
import { DimensionMatrixDialog } from "@/components/DimensionMatrixDialog";
import { usePermissions } from "@/components/Auth/Permissions";
import toast from "react-hot-toast";

export default function DimensionLinkingPage() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canManage = can("dimension:manage");
  const { data: dimensions = [] } = useQuery<Dimension[]>({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
  });

  const [matrixOpen, setMatrixOpen] = useState(false);
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

  const { data: links = [] } = useQuery<DimensionValueLink[]>({
    queryKey: ["dimension-value-links", effectiveDim1, effectiveDim2],
    queryFn: () => dimensionValueLinkApi.list(effectiveDim1, effectiveDim2),
    enabled: !!effectiveDim1 && !!effectiveDim2,
  });

  // Build a set of active pairs for the matrix (both directions)
  const activePairs = new Set(
    links.flatMap((r) => [
      `${r.dimension_value_id_1}:${r.dimension_value_id_2}`,
      `${r.dimension_value_id_2}:${r.dimension_value_id_1}`,
    ])
  );

  const [pendingPairs, setPendingPairs] = useState<Set<string> | null>(null);
  const displayPairs = pendingPairs ?? activePairs;

  const togglePair = (v1Id: string, v2Id: string) => {
    const key = `${v1Id}:${v2Id}`;
    const rev = `${v2Id}:${v1Id}`;
    const next = new Set(displayPairs);
    if (next.has(key) || next.has(rev)) {
      next.delete(key);
      next.delete(rev);
    } else {
      next.add(key);
      next.add(rev);
    }
    setPendingPairs(next);
  };

  const bulkSyncMutation = useMutation({
    mutationFn: () => {
      // Deduplicate: keep only one direction per pair (smaller ID first)
      const seen = new Set<string>();
      const pairs: [string, string][] = [];
      for (const key of displayPairs) {
        const [a, b] = key.split(":");
        const normalized = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (!seen.has(normalized)) {
          seen.add(normalized);
          pairs.push([a, b]);
        }
      }
      return dimensionValueLinkApi.bulkSync({
        dimension_id_1: effectiveDim1,
        dimension_id_2: effectiveDim2,
        pairs,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dimension-value-links"] });
      setPendingPairs(null);
      toast.success("Dimension links saved");
    },
    onError: () => toast.error("Failed to save dimension links"),
  });

  const hasPendingChanges = pendingPairs !== null;

  const dim1 = dimensions.find((d) => d.id === effectiveDim1);
  const dim2 = dimensions.find((d) => d.id === effectiveDim2);

  if (dimensions.length < 2) {
    return (
      <p className="text-gray-500 text-sm">
        You need at least 2 dimensions to define dimension links.
      </p>
    );
  }

  return (
    <>
      <PageHeader
        title="Dimension Linking"
        description="Define valid combinations between dimension values. Check cells to create links."
        actions={
          <Button size="sm" variant="outline" onClick={() => setMatrixOpen(true)}>
            <LayoutGrid className="h-4 w-4 mr-1" />
            View Matrix
          </Button>
        }
      />

      {/* Dimension selectors */}
      <div className="flex gap-4 mb-4">
        <div>
          <label className="text-sm font-medium">Rows</label>
          <select
            className="ml-2 border rounded-md px-2 py-1 text-sm"
            value={effectiveDim1}
            onChange={(e) => { setDim1Id(e.target.value); setPendingPairs(null); }}
          >
            {dimensions.filter((d) => d.id !== effectiveDim2).map((d) => (
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
                {dim1 ? dim1.name : ""} \ {dim2 ? dim2.name : ""}
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
              <tr key={v1.id} className="border-b last:border-b-0 bg-white">
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
                        readOnly={!canManage}
                        onClick={canManage ? undefined : (e) => e.preventDefault()}
                        className={`rounded border-gray-300 text-purple-600 focus:ring-purple-500 ${!canManage ? "pointer-events-none opacity-75" : ""}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasPendingChanges && canManage && (
        <div className="flex gap-2 mt-4">
          <Button onClick={() => bulkSyncMutation.mutate()} disabled={bulkSyncMutation.isPending}>
            Save Changes
          </Button>
          <Button variant="outline" onClick={() => setPendingPairs(null)}>
            Cancel
          </Button>
        </div>
      )}

      <DimensionMatrixDialog
        open={matrixOpen}
        onClose={() => setMatrixOpen(false)}
        showEditButton={false}
      />
    </>
  );
}
