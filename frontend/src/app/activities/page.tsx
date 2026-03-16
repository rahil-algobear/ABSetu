"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  activityApi,
  activityTypeApi,
  dimensionApi,
  dimensionValueLinkApi,
} from "@/services/api";
import { Dimension, DimensionValue, DimensionValueLink } from "@/types";
import { Can } from "@/components/Auth/Permissions";
import { useVocabulary } from "@/hooks/useVocabulary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageLayout } from "@/components/ui/page-layout";
import { Plus } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

/**
 * Given a set of tag rules and the currently selected dimension value IDs,
 * return the filtered list of allowed values for a target dimension.
 */
function getFilteredValues(
  targetDimValues: DimensionValue[],
  selectedByDim: Record<string, string>,
  targetDimId: string,
  dimensionValueLinks: DimensionValueLink[],
): DimensionValue[] {
  const otherSelections = Object.entries(selectedByDim)
    .filter(([dimId, dvId]) => dimId !== targetDimId && dvId)
    .map(([, dvId]) => dvId);

  if (otherSelections.length === 0) {
    return targetDimValues;
  }

  const linkPairs = new Set<string>();
  for (const link of dimensionValueLinks) {
    linkPairs.add(`${link.dimension_value_id_1}:${link.dimension_value_id_2}`);
    linkPairs.add(`${link.dimension_value_id_2}:${link.dimension_value_id_1}`);
  }

  return targetDimValues.filter((dv) =>
    otherSelections.every(
      (selectedId) => linkPairs.has(`${dv.id}:${selectedId}`)
    )
  );
}

export default function ActivitiesPage() {
  const [showCreate, setShowCreate] = useState(false);
  const queryClient = useQueryClient();
  const { v, vPlural, vDim } = useVocabulary();

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ["activities"],
    queryFn: activityApi.list,
  });

  const { data: activityTypes = [] } = useQuery({
    queryKey: ["activity-types"],
    queryFn: () => activityTypeApi.list(),
  });

  const { data: dimensions = [] } = useQuery<Dimension[]>({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
  });

  // Load all dimension values
  const { data: allDimensionValues = [] } = useQuery<DimensionValue[]>({
    queryKey: ["all-dimension-values", dimensions.map((d) => d.id).join(",")],
    queryFn: async () => {
      const results = await Promise.all(
        dimensions.map((d) => dimensionApi.listValues(d.id))
      );
      return results.flat();
    },
    enabled: dimensions.length > 0,
  });

  // Load all dimension value links (used for cascading filters)
  const { data: dimensionValueLinks = [] } = useQuery<DimensionValueLink[]>({
    queryKey: ["dimension-value-links-all"],
    queryFn: () => dimensionValueLinkApi.list(),
  });

  // Non-system dimensions shown as selectable dropdowns
  const selectableDimensions = useMemo(
    () => dimensions.filter((d) => !d.is_system),
    [dimensions]
  );

  // The system Activity Type dimension (if it exists)
  const atDimension = useMemo(
    () => dimensions.find((d) => d.is_system === "activity_type"),
    [dimensions]
  );

  const [formData, setFormData] = useState({
    activity_type_id: "",
    date: new Date().toISOString().split("T")[0],
    notes: "",
    dimension_value_ids: [] as string[],
  });

  // Track selection per dimension for cascading logic
  const selectedByDim = useMemo(() => {
    const map: Record<string, string> = {};
    for (const dim of dimensions) {
      const dimValues = allDimensionValues.filter(
        (dv) => dv.dimension_id === dim.id
      );
      const selected = formData.dimension_value_ids.find((id) =>
        dimValues.some((dv) => dv.id === id)
      );
      if (selected) {
        map[dim.id] = selected;
      }
    }
    return map;
  }, [dimensions, allDimensionValues, formData.dimension_value_ids]);

  // Filter activity types based on tag rules with selected dimension values
  const filteredActivityTypes = useMemo(() => {
    if (!atDimension) return activityTypes;

    const atDimValues = allDimensionValues.filter(
      (dv) => dv.dimension_id === atDimension.id
    );
    const filteredDvs = getFilteredValues(
      atDimValues,
      selectedByDim,
      atDimension.id,
      dimensionValueLinks
    );
    const allowedNames = new Set(filteredDvs.map((dv) => dv.name));

    // If no filtering applied (no selections), return all
    if (Object.keys(selectedByDim).length === 0) return activityTypes;

    return activityTypes.filter((at) => allowedNames.has(at.name));
  }, [activityTypes, atDimension, allDimensionValues, selectedByDim, dimensionValueLinks]);

  const createMutation = useMutation({
    mutationFn: activityApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      setShowCreate(false);
      setFormData({
        activity_type_id: "",
        date: new Date().toISOString().split("T")[0],
        notes: "",
        dimension_value_ids: [],
      });
      toast.success(`${v("activity")} created`);
    },
    onError: () => toast.error(`Failed to create ${v("activity").toLowerCase()}`),
  });

  return (
    <PageLayout className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">{vPlural("activity")}</h1>
        <Can permission="activity:create">
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New {v("activity")}
          </Button>
        </Can>
      </div>

      {showCreate && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Create {v("activity")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate(formData);
              }}
              className="space-y-3"
            >
              {/* Dimension selectors (non-system only) — cascading */}
              {selectableDimensions.map((dim) => {
                const dimValues = allDimensionValues.filter(
                  (dv) => dv.dimension_id === dim.id
                );
                const filtered = getFilteredValues(
                  dimValues,
                  selectedByDim,
                  dim.id,
                  dimensionValueLinks
                );
                const currentSelection =
                  formData.dimension_value_ids.find((id) =>
                    dimValues.some((dv) => dv.id === id)
                  ) || "";
                return (
                  <div key={dim.id}>
                    <label className="text-sm font-medium">{vDim(dim)}</label>
                    <select
                      className="w-full mt-1 border rounded-md p-2 text-sm"
                      value={currentSelection}
                      onChange={(e) => {
                        const newId = e.target.value;
                        const otherIds = formData.dimension_value_ids.filter(
                          (id) => !dimValues.some((dv) => dv.id === id)
                        );
                        setFormData({
                          ...formData,
                          dimension_value_ids: newId
                            ? [...otherIds, newId]
                            : otherIds,
                        });
                      }}
                    >
                      <option value="">Select {vDim(dim)}...</option>
                      {filtered.map((dv) => (
                        <option key={dv.id} value={dv.id}>
                          {dv.name}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}

              {/* Activity Type — filtered by tag rules */}
              <div>
                <label className="text-sm font-medium">{v("activity_type")}</label>
                <select
                  className="w-full mt-1 border rounded-md p-2 text-sm"
                  value={formData.activity_type_id}
                  onChange={(e) =>
                    setFormData({ ...formData, activity_type_id: e.target.value })
                  }
                  required
                >
                  <option value="">Select...</option>
                  {filteredActivityTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Date</label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) =>
                    setFormData({ ...formData, date: e.target.value })
                  }
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium">Notes</label>
                <Input
                  placeholder="Optional notes..."
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={createMutation.isPending}>
                  Create
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="text-gray-500">Loading...</p>
      ) : activities.length === 0 ? (
        <p className="text-gray-500">No {vPlural("activity").toLowerCase()} yet.</p>
      ) : (
        <div className="space-y-2">
          {activities.map((a) => (
            <Link key={a.id} href={`/activities/${a.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="py-3 px-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">{a.type_name}</p>
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {a.tags
                          .filter((tag) => tag.dimension_key !== "activity_type")
                          .map((tag) => (
                            <Badge key={tag.value_id} variant="secondary" className="text-xs">
                              {tag.value_name}
                            </Badge>
                          ))}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{a.date}</p>
                      {a.category_name && (
                        <p className="text-xs text-gray-500">{a.category_name}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </PageLayout>
  );
}
