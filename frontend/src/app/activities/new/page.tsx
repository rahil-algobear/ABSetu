"use client";

import { Suspense, useState, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  activityApi,
  activityTypeApi,
  activityFormApi,
  dimensionApi,
  dimensionValueLinkApi,
  entityApi,
  entityTypeApi,
  metaFieldSchemaApi,
  userApi,
} from "@/services/api";
import {
  ActivityForm,
  ActivityFormElement,
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

function NewActivityPageContent() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeKey = searchParams.get("type");
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

  const { data: formConfig } = useQuery<ActivityForm>({
    queryKey: ["activity-form", selectedTypeId],
    queryFn: () => activityFormApi.get(selectedTypeId),
    enabled: !!selectedTypeId,
  });

  // Build field definition lookup from meta schemas (includes system fields)
  const allActivityFields = useMemo((): MetaFieldDefinition[] => {
    return collectActivityFields(allMetaSchemas, selectedTypeId || null, formData.dimension_value_ids);
  }, [selectedTypeId, formData.dimension_value_ids, allMetaSchemas]);

  const fieldDefMap = useMemo(() => {
    const map: Record<string, MetaFieldDefinition> = {};
    for (const f of allActivityFields) {
      map[f.key] = f;
    }
    return map;
  }, [allActivityFields]);

  // All meta fields for DynamicMetaForm (no system field distinction)
  const customMetaFields = useMemo(() => {
    return allActivityFields;
  }, [allActivityFields]);

  const formElements: ActivityFormElement[] = useMemo(() => {
    if (!formConfig?.elements?.length) return [];
    return [...formConfig.elements]
      .filter((el) => {
        if (el.type === "field") {
          const def = fieldDefMap[el.ref_key || ""];
          if (!def) return true; // unknown field, show anyway
          if (def.visible === false) return false;
          // "edit only" fields: still show them (as disabled), don't filter out
          return true;
        }
        // Structural elements (dimensions, participant_lists): hide if not applicable to create stage
        if (el.stage && el.stage !== "both" && el.stage !== "create") return false;
        return true;
      })
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [formConfig, fieldDefMap]);

  // Field keys that are not editable on the create stage (edit-only fields)
  const createDisabledKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const f of allActivityFields) {
      if (f.stage && f.stage !== "both" && f.stage !== "create") {
        keys.add(f.key);
      }
    }
    return keys;
  }, [allActivityFields]);

  const createEntityElements: ActivityFormElement[] = useMemo(() => {
    return formElements.filter((el) => el.type === "participant_list");
  }, [formElements]);

  const createEntitySourceIds = useMemo(() => {
    return createEntityElements
      .filter((el) => el.entity_type_id && el.entity_type_id !== "user")
      .map((el) => el.entity_type_id!);
  }, [createEntityElements]);

  const hasCreateUserSection = createEntityElements.some((el) => el.entity_type_id === "user");

  const { data: createEntitiesByType = {} } = useQuery({
    queryKey: ["entities-for-create", createEntitySourceIds.join(",")],
    queryFn: async () => {
      const result: Record<string, { id: string; name: string }[]> = {};
      for (const typeId of createEntitySourceIds) {
        const entities = await entityApi.list(typeId);
        result[typeId] = entities.map((e) => ({ id: e.id, name: e.name }));
      }
      return result;
    },
    enabled: createEntitySourceIds.length > 0,
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

  // Dimension form element IDs (only dimensions in the form, in order)
  const formDimensions = useMemo(() => {
    return formElements
      .filter((el) => el.type === "dimension" && el.dimension_id)
      .map((el) => ({ id: el.dimension_id! }));
  }, [formElements]);

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
      for (const el of createEntityElements) {
        const sectionKey = el.entity_type_id || el.type;
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

  // Collect field keys in the layout to avoid duplicating them
  // Use all form config elements (not just filtered formElements) to avoid duplicates
  const layoutCustomFieldKeys = useMemo(() => {
    const elements = formConfig?.elements || [];
    return new Set(
      elements
        .filter((el) => el.type === "field" && el.ref_key)
        .map((el) => el.ref_key!)
    );
  }, [formConfig]);

  // Custom meta fields NOT in the layout (auto-appended)
  // Show all visible fields — edit-only ones will render as disabled via createDisabledKeys
  const autoAppendFields = useMemo(() => {
    return customMetaFields.filter(
      (f) => !layoutCustomFieldKeys.has(f.key) && f.visible !== false
    );
  }, [customMetaFields, layoutCustomFieldKeys]);

  const renderElement = (el: ActivityFormElement) => {
    switch (el.type) {
      case "field": {
        const key = el.ref_key;
        if (!key) return null;
        const def = fieldDefMap[key];

        // Title field with "generated" mode: skip rendering
        if (key === "title") {
          const titleConfig = el.config || { mode: "free_text" };
          const titleMode = (titleConfig.mode as string) || "free_text";
          if (titleMode === "generated") return null;
        }

        // All fields render through DynamicMetaForm
        if (def) {
          return (
            <div key={`field-${key}`}>
              <DynamicMetaForm
                fields={[def]}
                values={metaValues}
                onChange={setMetaValues}
                disabledKeys={createDisabledKeys}
              />
            </div>
          );
        }
        return null;
      }

      case "dimension": {
        const dimId = el.dimension_id;
        const dim = dimensions.find((d) => d.id === dimId);
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

      case "participant_list": {
        const etId = el.entity_type_id;
        const isUserSource = etId === "user";
        const sectionKey = etId || el.type;
        const options = isUserSource
          ? createUsers.map((u) => ({ id: u.id, name: `${u.first_name} ${u.last_name}` }))
          : (createEntitiesByType[etId || ""] || []);
        const participantType = isUserSource ? "user" : "entity";
        const sectionState = participantState[sectionKey] || [];
        const captureStatus = el.config?.capture_status as boolean || false;
        const statuses = (el.config?.statuses as string[]) || ["present", "absent"];
        const defaultStatus = (el.config?.default_status as string) || statuses[0];
        const etLabel = isUserSource
          ? "Users (staff)"
          : entityTypes.find((t) => t.id === etId)?.name || "Participants";

        return (
          <div key={`participant-${sectionKey}`}>
            <h3 className="text-sm font-semibold mb-2">
              {etLabel}
              {el.required && <span className="text-red-500 ml-0.5">*</span>}
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

      default:
        return null;
    }
  };

  const hasFormConfig = formElements.length > 0;

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

              // Validate required meta fields
              const visibleFields = [
                ...formElements
                  .filter((el) => el.type === "field" && el.ref_key && fieldDefMap[el.ref_key])
                  .map((el) => fieldDefMap[el.ref_key!]),
                ...autoAppendFields,
              ];
              for (const field of visibleFields) {
                if (field.required && !createDisabledKeys.has(field.key)) {
                  const val = metaValues[field.key];
                  if (val === undefined || val === null || val === "") {
                    toast.error(`${field.label} is required`);
                    return;
                  }
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
            {hasFormConfig
              ? (
                <>
                  {formElements.map(renderElement)}
                  {autoAppendFields.length > 0 && (
                    <DynamicMetaForm
                      fields={autoAppendFields}
                      values={metaValues}
                      onChange={setMetaValues}
                      disabledKeys={createDisabledKeys}
                    />
                  )}
                </>
              )
              : (
                <p className="text-sm text-gray-500">
                  The form for this activity type has not been configured yet. Please ask your admin to set it up in the Form Builder under Admin settings.
                </p>
              )
            }

            <div className="flex gap-2">
              {hasFormConfig && (
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

export default function NewActivityPage() {
  return (
    <Suspense fallback={<PageLayout><PageContent><p className="text-gray-500">Loading...</p></PageContent></PageLayout>}>
      <NewActivityPageContent />
    </Suspense>
  );
}
