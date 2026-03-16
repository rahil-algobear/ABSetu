"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  activityApi,
  activityTypeApi,
  dimensionApi,
  facilitatorApi,
} from "@/services/api";
import { Dimension, DimensionValue } from "@/types";
import { Can } from "@/components/Auth/Permissions";
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

  // Load dimension values for each dimension
  const dimensionValuesQueries = dimensions.map((d) => ({
    dimension: d,
    queryKey: ["dimension-values", d.id],
  }));

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

  const [formData, setFormData] = useState({
    activity_type_id: "",
    date: new Date().toISOString().split("T")[0],
    notes: "",
    facilitator_ids: [] as string[],
    dimension_value_ids: [] as string[],
  });

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
      toast.success("Activity created");
    },
    onError: () => toast.error("Failed to create activity"),
  });

  return (
    <PageLayout className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Activities</h1>
        <Can permission="activity:create">
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Activity
          </Button>
        </Can>
      </div>

      {showCreate && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Create Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate(formData);
              }}
              className="space-y-3"
            >
              <div>
                <label className="text-sm font-medium">Activity Type</label>
                <select
                  className="w-full mt-1 border rounded-md p-2 text-sm"
                  value={formData.activity_type_id}
                  onChange={(e) =>
                    setFormData({ ...formData, activity_type_id: e.target.value })
                  }
                  required
                >
                  <option value="">Select...</option>
                  {activityTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dimension selectors */}
              {dimensions.map((dim) => {
                const dimValues = allDimensionValues.filter(
                  (dv) => dv.dimension_id === dim.id
                );
                return (
                  <div key={dim.id}>
                    <label className="text-sm font-medium">{dim.name}</label>
                    <select
                      className="w-full mt-1 border rounded-md p-2 text-sm"
                      value={
                        formData.dimension_value_ids.find((id) =>
                          dimValues.some((dv) => dv.id === id)
                        ) || ""
                      }
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
                      {dimValues.map((dv) => (
                        <option key={dv.id} value={dv.id}>
                          {dv.name}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}

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
                <label className="text-sm font-medium">Facilitators</label>
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
        <p className="text-gray-500">No activities yet.</p>
      ) : (
        <div className="space-y-2">
          {activities.map((a) => (
            <Link key={a.id} href={`/activities/${a.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="py-3 px-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">{a.type_name}</p>
                      <div className="flex gap-1 mt-0.5">
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
