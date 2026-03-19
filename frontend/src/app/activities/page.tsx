"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  activityApi,
  activityTypeApi,
  activityFormApi,
  dimensionApi,
  dimensionValueLinkApi,
  entityTypeApi,
  metaFieldSchemaApi,
} from "@/services/api";
import {
  ActivityForm,
  ActivityFormElement,
  Dimension,
  DimensionValue,
  DimensionValueLink,
  EntityType,
  MetaFieldDefinition,
  MetaFieldSchemas,
} from "@/types";
import { Can } from "@/components/Auth/Permissions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DynamicMetaForm } from "@/components/DynamicMetaForm";
import { PageLayout } from "@/components/ui/page-layout";
import { Plus } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

/**
 * Given a set of dimension value links and the currently selected dimension value IDs,
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
  const searchParams = useSearchParams();
  const typeKey = searchParams.get("type");

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ["activities", selectedTypeId],
    queryFn: () => activityApi.list(selectedTypeId || undefined),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["activity-types"],
    queryFn: activityTypeApi.list,
  });

  const { data: dimensions = [] } = useQuery<Dimension[]>({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
  });

  const { data: entityTypes = [] } = useQuery<EntityType[]>({
    queryKey: ["entity-types"],
    queryFn: entityTypeApi.list,
  });

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

  const { data: dimensionValueLinks = [] } = useQuery<DimensionValueLink[]>({
    queryKey: ["dimension-value-links-all"],
    queryFn: () => dimensionValueLinkApi.list(),
  });

  const { data: allMetaSchemas = {} } = useQuery<MetaFieldSchemas>({
    queryKey: ["meta-field-schemas-all"],
    queryFn: metaFieldSchemaApi.getAll,
  });

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    notes: "",
    dimension_value_ids: [] as string[],
  });
  const [metaValues, setMetaValues] = useState<Record<string, unknown>>({});

  // Determine activity type from URL param
  const activityType = categories.find((c) => c.key === typeKey);
  const selectedTypeId = activityType?.id || "";
  const typeName = activityType?.name || "Activity";

  // Load form builder config for the activity type
  const { data: formConfig } = useQuery<ActivityForm>({
    queryKey: ["activity-form", selectedTypeId],
    queryFn: () => activityFormApi.get(selectedTypeId),
    enabled: !!selectedTypeId,
  });

  // Sorted visible elements from form config
  const formElements: ActivityFormElement[] = useMemo(() => {
    if (!formConfig?.elements?.length) return [];
    return [...formConfig.elements]
      .filter((el) => el.visible)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [formConfig]);

  // Derive meta fields: activity type + dimension values + type×dimension_value combos
  const activityMetaFields = useMemo((): MetaFieldDefinition[] => {
    const fields: MetaFieldDefinition[] = [];
    if (selectedTypeId) {
      fields.push(...(allMetaSchemas[`activity:category:${selectedTypeId}`] || []));
    }
    for (const dvId of formData.dimension_value_ids) {
      // All types × dimension value
      fields.push(...(allMetaSchemas[`activity:dimension_value:${dvId}`] || []));
      // Specific category × dimension value
      if (selectedTypeId) {
        fields.push(...(allMetaSchemas[`activity:category:${selectedTypeId}:dimension_value:${dvId}`] || []));
      }
    }
    return fields;
  }, [selectedTypeId, formData.dimension_value_ids, allMetaSchemas]);

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

  const createMutation = useMutation({
    mutationFn: activityApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      setShowCreate(false);
      setFormData({
        date: new Date().toISOString().split("T")[0],
        notes: "",
        dimension_value_ids: [],
      });
      setMetaValues({});
      toast.success(`${typeName} created`);
    },
    onError: () => toast.error(`Failed to create ${typeName.toLowerCase()}`),
  });

  // Render a single form element based on its type
  const renderElement = (el: ActivityFormElement) => {
    switch (el.type) {
      case "dimension": {
        const dim = dimensions.find((d) => d.id === el.ref_id);
        if (!dim) return null;
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
          <div key={`dimension-${dim.id}`}>
            <label className="text-sm font-medium">
              {dim.name}
              {el.required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
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
              required={el.required}
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
      }

      case "entity_type":
        // Entity types are rendered on the activity detail page (participants)
        // On create, we just show a note
        return null;

      case "activity_meta":
        if (activityMetaFields.length === 0) return null;
        return (
          <div key="activity_meta">
            <DynamicMetaForm
              fields={activityMetaFields}
              values={metaValues}
              onChange={setMetaValues}
            />
          </div>
        );

      default:
        return null;
    }
  };

  // Use form builder elements if available
  const hasFormConfig = formElements.length > 0;

  // Get the first dimension value name to use as activity title (e.g. intervention name)
  const getActivityTitle = (a: typeof activities[0]) => {
    // Use the first dimension value as the title (typically the intervention)
    if (a.dimensions.length > 0) return a.dimensions[0].value_name;
    return typeName;
  };

  return (
    <PageLayout className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">{typeName}s</h1>
        <Can permission="activity:create">
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New {typeName}
          </Button>
        </Can>
      </div>

      {showCreate && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Create {typeName}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const payload = {
                  ...formData,
                  activity_type_id: selectedTypeId || undefined,
                  ...(activityMetaFields.length > 0 ? { meta: metaValues } : {}),
                };
                createMutation.mutate(payload);
              }}
              className="space-y-3"
            >
              {hasFormConfig
                ? formElements.map(renderElement)
                : (
                  <p className="text-sm text-gray-500">
                    The form for this activity type has not been configured yet. Please ask your admin to set it up in the Form Builder under Admin settings.
                  </p>
                )
              }

              {hasFormConfig && (
                <>
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
                </>
              )}

              <div className="flex gap-2">
                {hasFormConfig && (
                  <Button type="submit" disabled={createMutation.isPending}>
                    Create
                  </Button>
                )}
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
        <p className="text-gray-500">No {typeName.toLowerCase()}s yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {activities.map((a) => (
            <Link key={a.id} href={`/activities/${a.id}`} className="block">
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="py-3 px-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">{getActivityTitle(a)}</p>
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {a.dimensions.slice(1).map((dim) => (
                          <Badge key={dim.value_id} variant="secondary" className="text-xs">
                            {dim.value_name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{a.date}</p>
                      {a.activity_type_name && (
                        <p className="text-xs text-gray-500">{a.activity_type_name}</p>
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
