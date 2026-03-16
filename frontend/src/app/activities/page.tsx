"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  activityApi,
  activityTypeApi,
  dimensionApi,
  facilitatorApi,
} from "@/services/api";
import { ActivityTypeAccess, Dimension, DimensionValue } from "@/types";
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

export default function ActivitiesPage() {
  const [showCreate, setShowCreate] = useState(false);
  const queryClient = useQueryClient();
  const { v, vPlural } = useVocabulary();

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ["activities"],
    queryFn: activityApi.list,
  });

  const { data: activityTypes = [] } = useQuery({
    queryKey: ["activity-types"],
    queryFn: activityTypeApi.list,
  });

  const { data: dimensions = [] } = useQuery<Dimension[]>({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
  });

  const { data: facilitators = [] } = useQuery({
    queryKey: ["facilitators"],
    queryFn: facilitatorApi.list,
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

  // Load all activity type access (for cascading filters)
  const { data: allAccess = [] } = useQuery<ActivityTypeAccess[]>({
    queryKey: ["activity-type-access"],
    queryFn: () => activityTypeApi.listAllAccess(),
  });

  // Non-system dimensions shown as selectable dropdowns
  const selectableDimensions = useMemo(
    () => dimensions.filter((d) => !d.is_system),
    [dimensions]
  );

  const [formData, setFormData] = useState({
    activity_type_id: "",
    date: new Date().toISOString().split("T")[0],
    notes: "",
    facilitator_ids: [] as string[],
    dimension_value_ids: [] as string[],
  });

  // Build access lookup: activity_type_id → Set<dimension_value_id>
  const accessByType = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const entry of allAccess) {
      map.set(entry.activity_type_id, new Set(entry.dimension_value_ids));
    }
    return map;
  }, [allAccess]);

  // Filter activity types based on selected dimension values
  const filteredActivityTypes = useMemo(() => {
    const selectedIds = formData.dimension_value_ids;
    if (selectedIds.length === 0) return activityTypes;

    return activityTypes.filter((at) => {
      const accessSet = accessByType.get(at.id);
      if (!accessSet) return false; // No access defined → not shown when filters active
      return selectedIds.every((dvId) => accessSet.has(dvId));
    });
  }, [activityTypes, formData.dimension_value_ids, accessByType]);

  // Filter dimension values: only show values that appear in access of at
  // least one currently-valid activity type (considering OTHER dimension selections)
  const getFilteredDimValues = (targetDimId: string): DimensionValue[] => {
    const dimValues = allDimensionValues.filter(
      (dv) => dv.dimension_id === targetDimId
    );

    // Get selections from OTHER dimensions
    const otherSelectedIds = formData.dimension_value_ids.filter(
      (id) => !dimValues.some((dv) => dv.id === id)
    );

    if (otherSelectedIds.length === 0) return dimValues;

    // A dimension value is valid if at least one activity type has access to
    // it AND to all other selected values
    return dimValues.filter((dv) =>
      activityTypes.some((at) => {
        const accessSet = accessByType.get(at.id);
        if (!accessSet) return false;
        if (!accessSet.has(dv.id)) return false;
        return otherSelectedIds.every((id) => accessSet.has(id));
      })
    );
  };

  const createMutation = useMutation({
    mutationFn: activityApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      setShowCreate(false);
      setFormData({
        activity_type_id: "",
        date: new Date().toISOString().split("T")[0],
        notes: "",
        facilitator_ids: [],
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
                const filtered = getFilteredDimValues(dim.id);
                const currentSelection =
                  formData.dimension_value_ids.find((id) =>
                    dimValues.some((dv) => dv.id === id)
                  ) || "";
                return (
                  <div key={dim.id}>
                    <label className="text-sm font-medium">{dim.name}</label>
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
                      <option value="">Select {dim.name}...</option>
                      {filtered.map((dv) => (
                        <option key={dv.id} value={dv.id}>
                          {dv.name}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}

              {/* Activity Type — filtered by access */}
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
                <label className="text-sm font-medium">{vPlural("facilitator")}</label>
                <div className="mt-1 space-y-1 max-h-32 overflow-y-auto border rounded-md p-2">
                  {facilitators.map((f) => (
                    <label key={f.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={formData.facilitator_ids.includes(f.id)}
                        onChange={(e) => {
                          const ids = e.target.checked
                            ? [...formData.facilitator_ids, f.id]
                            : formData.facilitator_ids.filter((id) => id !== f.id);
                          setFormData({ ...formData, facilitator_ids: ids });
                        }}
                      />
                      {f.name}
                    </label>
                  ))}
                </div>
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
                        {a.tags.map((tag) => (
                          <Badge key={tag.value_id} variant="secondary" className="text-xs">
                            {tag.value_name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{a.date}</p>
                      {a.facilitators.length > 0 && (
                        <p className="text-xs text-gray-500">
                          {a.facilitators.map((f) => f.name).join(", ")}
                        </p>
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
