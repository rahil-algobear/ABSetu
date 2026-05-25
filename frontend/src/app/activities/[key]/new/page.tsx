"use client";

import { useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  activityApi,
  activityTypeApi,
  dimensionApi,
  dimensionValueLinkApi,
  entityApi,
  entityTypeApi,
  listConfigApi,
  metaFieldSchemaApi,
  userApi,
} from "@/services/api";
import {
  Dimension,
  DimensionValue,
  DimensionValueLink,
  EntityType,
  MetaFieldDefinition,
  MetaFieldSchemaItem,
} from "@/types";
import { collectActivityFields } from "@/utils/meta-fields";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DynamicMetaForm } from "@/components/DynamicMetaForm";
import { SearchSelectParticipants } from "@/components/SearchSelectParticipants";
import { PageLayout } from "@/components/ui/page-layout";
import { PageContent } from "@/components/ui/page-content";
import { PageHeader } from "@/components/ui/page-header";
import { usePermissions } from "@/components/Auth/Permissions";
import { useDimensionAutoSelect } from "@/hooks/useDimensionAutoSelect";

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

export default function NewActivityPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { key: typeKey } = useParams<{ key: string }>();
  const { dimensionValueIds: userDimensionValueIds } = usePermissions();

  const { data: activityTypes = [] } = useQuery({
    queryKey: ["activity-types"],
    queryFn: activityTypeApi.list,
  });

  const activityType = activityTypes.find((c) => c.key === typeKey);
  const selectedTypeId = activityType?.id || "";
  const typeName = activityType?.name || "Activity";

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
        dimensions.map((d) => dimensionApi.listAccessibleValues(d.id))
      );
      return results.flat();
    },
    enabled: dimensions.length > 0,
  });

  const { data: dimensionValueLinks = [] } = useQuery<DimensionValueLink[]>({
    queryKey: ["dimension-value-links-all"],
    queryFn: () => dimensionValueLinkApi.list(),
  });

  const { data: allMetaSchemas = [] } = useQuery<MetaFieldSchemaItem[]>({
    queryKey: ["meta-field-schemas-all"],
    queryFn: metaFieldSchemaApi.getAll,
  });

  const [formData, setFormData] = useState({
    dimension_value_ids: [] as string[],
  });
  const [metaValues, setMetaValues] = useState<Record<string, unknown>>({});
  const [participantState, setParticipantState] = useState<
    Record<string, { participant_id: string; participant_type: string; status?: string; meta?: Record<string, unknown> }[]>
  >({});

  // All field definitions from meta schemas — the sole source of truth
  const allFields = useMemo((): MetaFieldDefinition[] => {
    return collectActivityFields(allMetaSchemas, selectedTypeId || null, formData.dimension_value_ids);
  }, [selectedTypeId, formData.dimension_value_ids, allMetaSchemas]);

  // Split fields by type for rendering
  const formFields = useMemo(() => {
    return allFields.filter((f) => f.visible !== false);
  }, [allFields]);

  // Fields that are not editable on the create stage (edit-only fields)
  const createDisabledKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const f of allFields) {
      if (f.stage && f.stage !== "both" && f.stage !== "create") {
        keys.add(f.key);
      }
    }
    return keys;
  }, [allFields]);

  // Participant list fields for entity queries
  const participantFields = useMemo(() => {
    return formFields.filter((f) => (f.type === "entity_list" || f.type === "user_list")
      && !createDisabledKeys.has(f.key));
  }, [formFields, createDisabledKeys]);

  const entitySourceIds = useMemo(() => {
    return participantFields
      .filter((f) => f.type === "entity_list" && f.entity_type_id)
      .map((f) => f.entity_type_id!);
  }, [participantFields]);

  const hasCreateUserSection = participantFields.some((f) => f.type === "user_list");

  const { data: createEntitiesByType = {} } = useQuery({
    queryKey: ["entities-for-create", entitySourceIds.join(",")],
    queryFn: async () => {
      const result: Record<string, { id: string; name: string }[]> = {};
      for (const typeId of entitySourceIds) {
        const [entities, columns] = await Promise.all([
          entityApi.list(typeId),
          listConfigApi.get(`entity:${typeId}`),
        ]);
        const firstCol = columns.find((c) => c.visible && c.key.startsWith("meta:"));
        const metaKey = firstCol?.key.replace(/^meta:/, "");
        result[typeId] = entities.map((e) => ({
          id: e.id,
          name: metaKey ? String((e.meta || {})[metaKey] || "") : "",
        }));
      }
      return result;
    },
    enabled: entitySourceIds.length > 0,
  });

  const { data: createUsers = [] } = useQuery({
    queryKey: ["users"],
    queryFn: userApi.list,
    enabled: hasCreateUserSection,
  });

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

  // Dimension fields in the form (for auto-select)
  const formDimensions = useMemo(() => {
    return formFields
      .filter((f) => f.type === "dimension" && f.dimension_id)
      .map((f) => ({ id: f.dimension_id! }));
  }, [formFields]);

  const handleAutoSelect = useCallback(
    (dvIds: string[]) => {
      setFormData((prev) => ({ ...prev, dimension_value_ids: dvIds }));
    },
    [],
  );

  useDimensionAutoSelect({
    dimensions: formDimensions,
    allDimensionValues,
    dimensionValueLinks,
    userDimensionValueIds,
    currentSelections: formData.dimension_value_ids,
    onAutoSelect: handleAutoSelect,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Parameters<typeof activityApi.create>[0]) => {
      const activity = await activityApi.create(payload);
      const allRecords: { participant_type: string; participant_id: string; section_key: string; status?: string; meta?: Record<string, unknown> }[] = [];
      for (const field of participantFields) {
        const sectionKey = field.entity_type_id || field.key;
        const sectionState = participantState[sectionKey] || [];
        for (const p of sectionState) {
          allRecords.push({
            participant_type: p.participant_type,
            participant_id: p.participant_id,
            section_key: sectionKey,
            status: p.status,
            meta: p.meta,
          });
        }
      }
      if (allRecords.length > 0) {
        await activityApi.saveParticipants(activity.id, allRecords);
      }
      return activity;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      toast.success(`${typeName} created`);
      router.push(`/activities/${typeKey}`);
    },
    onError: () => toast.error(`Failed to create ${typeName.toLowerCase()}`),
  });

  const renderField = (field: MetaFieldDefinition) => {
    const isDisabled = createDisabledKeys.has(field.key);

    switch (field.type) {
      case "dimension": {
        const dimId = field.dimension_id;
        const dim = dimensions.find((d) => d.id === dimId);
        if (!dim) return null;
        // Hide dimension fields that are edit-only on create stage
        if (field.stage && field.stage !== "both" && field.stage !== "create") return null;
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
          <div key={`dimension-${field.key}`}>
            <label className="text-sm font-medium">
              {field.label}
              {field.required && <span className="text-red-500 ml-0.5">*</span>}
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
              required={field.required}
            >
              <option value="">Select {field.label}...</option>
              {filtered.map((dv) => (
                <option key={dv.id} value={dv.id}>
                  {dv.name}
                </option>
              ))}
            </select>
          </div>
        );
      }

      case "entity_list":
      case "user_list": {
        if (isDisabled) return null;
        const isUserSource = field.type === "user_list";
        const etId = field.entity_type_id;
        const sectionKey = isUserSource ? "user" : (etId || field.key);
        const options = isUserSource
          ? createUsers.map((u) => ({ id: u.id, name: `${u.first_name} ${u.last_name}` }))
          : (createEntitiesByType[etId || ""] || []);
        const participantType = isUserSource ? "user" : "entity";
        const sectionState = participantState[sectionKey] || [];
        const captureStatus = field.config?.capture_status as boolean || false;
        const statuses = (field.config?.statuses as string[]) || ["present", "absent"];
        const defaultStatus = (field.config?.default_status as string) || statuses[0];
        const etLabel = isUserSource
          ? "Users (staff)"
          : entityTypes.find((t) => t.id === etId)?.name || field.label;

        return (
          <div key={`participant-${sectionKey}`}>
            <h3 className="text-sm font-semibold mb-2">
              {etLabel}
              {field.required && <span className="text-red-500 ml-0.5">*</span>}
            </h3>
            <SearchSelectParticipants
              sectionKey={sectionKey}
              options={options}
              participantType={participantType}
              selected={sectionState}
              onChange={(records) =>
                setParticipantState({ ...participantState, [sectionKey]: records })
              }
              captureStatus={captureStatus}
              statuses={statuses}
              defaultStatus={defaultStatus}
              metaFields={[]}
              entityTypeId={isUserSource ? null : (etId || null)}
              entityTypeName={etLabel}
            />
          </div>
        );
      }

      default: {
        // Standard meta field types (text, number, date, select, etc.)
        // Title field with "generated" mode: skip rendering
        if (field.key === "title") {
          const titleConfig = field.config || { mode: "free_text" };
          if ((titleConfig.mode as string) === "generated") return null;
        }

        return (
          <div key={`field-${field.key}`}>
            <DynamicMetaForm
              fields={[field]}
              values={metaValues}
              onChange={setMetaValues}
              disabledKeys={createDisabledKeys}
            />
          </div>
        );
      }
    }
  };

  const hasFields = formFields.length > 0;

  return (
    <PageLayout>
      <PageHeader title={`New ${typeName}`} />

      <PageContent>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Create {typeName}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();

              // Validate required meta fields (skip disabled/edit-only and structural types)
              for (const field of formFields) {
                if (!field.required || createDisabledKeys.has(field.key)) continue;
                if (field.type === "dimension" || field.type === "entity_list" || field.type === "user_list") continue;
                const val = metaValues[field.key];
                if (val === undefined || val === null || val === "") {
                  toast.error(`${field.label} is required`);
                  return;
                }
              }

              const payload = {
                dimension_value_ids: formData.dimension_value_ids,
                activity_type_id: selectedTypeId || undefined,
                meta: metaValues,
              };
              createMutation.mutate(payload);
            }}
            className="space-y-3"
          >
            {hasFields
              ? formFields.map(renderField)
              : (
                <p className="text-sm text-gray-500">
                  No fields have been configured for this activity type. Please ask your admin to set them up in Form Fields under Admin settings.
                </p>
              )
            }

            <div className="flex gap-2">
              {hasFields && (
                <Button type="submit" disabled={createMutation.isPending}>
                  Create
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(`/activities/${typeKey}`)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      </PageContent>
    </PageLayout>
  );
}
