"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  entityApi,
  enrollmentApi,
  activityApi,
  activityTypeApi,
  metaFieldSchemaApi,
  dimensionApi,
  dimensionValueLinkApi,
} from "@/services/api";
import {
  Activity,
  ActivityType,
  Dimension,
  DimensionValue,
  DimensionValueLink,
  Enrollment,
  MetaFieldDefinition,
  MetaFieldSchemaItem,
} from "@/types";
import { collectEnrollmentFields, getFieldsForScope } from "@/utils/meta-fields";

import { Can } from "@/components/Auth/Permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLayout } from "@/components/ui/page-layout";
import { PageContent } from "@/components/ui/page-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DynamicMetaForm, MetaFieldDisplay } from "@/components/DynamicMetaForm";
import { PageHeader } from "@/components/ui/page-header";
import { Plus, Pencil, X, ChevronRight } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import { formatDate, formatDateTime } from "@/utils/date";

/**
 * Cascading dimension filter — reused from activities page pattern.
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

  if (otherSelections.length === 0) return targetDimValues;

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

export default function EntityDetailPage() {
  const { id } = useParams<{ key: string; id: string }>();
  const queryClient = useQueryClient();


  const [showCreate, setShowCreate] = useState(false);
  const [enrollmentAction, setEnrollmentAction] = useState<
    { enrollment: Enrollment; initialIsActive?: boolean } | null
  >(null);
  const [enrollmentTab, setEnrollmentTab] = useState<"active" | "ended" | "all">("active");
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailMetaValues, setDetailMetaValues] = useState<Record<string, unknown>>({});

  const { data: entity, isLoading } = useQuery({
    queryKey: ["entity", id],
    queryFn: () => entityApi.get(id),
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ["enrollments-entity", id],
    queryFn: () => enrollmentApi.listByEntity(id),
    enabled: !!entity,
  });

  const { data: allSchemas = [] } = useQuery<MetaFieldSchemaItem[]>({
    queryKey: ["meta-field-schemas"],
    queryFn: metaFieldSchemaApi.getAll,
  });
  const metaFields = useMemo(
    () => entity
      ? getFieldsForScope(allSchemas, { type: "entity", entity_type_id: entity.entity_type_id })
      : [],
    [allSchemas, entity],
  );

  const { data: activities = [] } = useQuery<Activity[]>({
    queryKey: ["activities-entity", id],
    queryFn: () => activityApi.listByEntity(id),
    enabled: !!entity,
  });

  const { data: activityTypes = [] } = useQuery<ActivityType[]>({
    queryKey: ["activity-types"],
    queryFn: activityTypeApi.list,
    enabled: activities.length > 0,
  });

  const [activityTypeFilter, setActivityTypeFilter] = useState<string>("");

  const filteredActivities = useMemo(
    () => activityTypeFilter
      ? activities.filter((a) => a.activity_type_id === activityTypeFilter)
      : activities,
    [activities, activityTypeFilter]
  );

  const canEnroll = entity?.entity_type_can_enroll !== false;

  const editDisabledKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const f of metaFields) {
      if (f.stage === "create") keys.add(f.key);
    }
    return keys;
  }, [metaFields]);

  const updateDetailsMutation = useMutation({
    mutationFn: (meta: Record<string, unknown>) =>
      entityApi.update(id, { meta }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entity", id] });
      setEditingDetails(false);
      toast.success("Details updated");
    },
    onError: () => toast.error("Failed to update details"),
  });

  const openEditDetails = () => {
    setDetailMetaValues(entity?.meta || {});
    setEditingDetails(true);
  };

  const handleSaveDetails = (e: React.FormEvent) => {
    e.preventDefault();
    updateDetailsMutation.mutate(detailMetaValues);
  };

  if (isLoading) return <PageLayout><PageContent><p>Loading...</p></PageContent></PageLayout>;
  if (!entity) return <PageLayout><PageContent><p>Not found</p></PageContent></PageLayout>;

  const firstFieldValue = metaFields.length > 0 && entity.meta
    ? String(entity.meta[metaFields[0].key] ?? "")
    : "";
  const entityTitle = firstFieldValue || "Entity";

  return (
    <PageLayout>
      <PageHeader
        title={entityTitle}
        description={[entity.entity_type_name, entity.code].filter(Boolean).join(" - ")}
      />
      <PageContent>

      {entity.dimensions?.length > 0 && (
        <div className="flex gap-1 mb-4">
          {entity.dimensions.map((dim) => (
            <Badge key={dim.value_id} variant="secondary">
              {dim.dimension_name}: {dim.value_name}
            </Badge>
          ))}
        </div>
      )}

      {metaFields.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Details</CardTitle>
              {!editingDetails && (
                <Can permission="entity:edit">
                  <Button size="sm" variant="outline" onClick={openEditDetails}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Button>
                </Can>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {editingDetails ? (
              <form onSubmit={handleSaveDetails} className="space-y-3">
                <DynamicMetaForm
                  fields={metaFields.filter((f) => f.visible !== false)}
                  values={detailMetaValues}
                  onChange={setDetailMetaValues}
                  disabledKeys={editDisabledKeys}
                />
                <div className="flex gap-2 pt-2">
                  <Button type="submit" disabled={updateDetailsMutation.isPending}>
                    Save
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setEditingDetails(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <MetaFieldDisplay
                fields={metaFields}
                values={entity.meta}
                showEmpty
              />
            )}
          </CardContent>
        </Card>
      )}

      {canEnroll && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Enrollments</CardTitle>
              <Can permission="enrollment:manage">
                {!showCreate && !enrollmentAction && (
                  <Button size="sm" onClick={() => setShowCreate(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                )}
              </Can>
            </div>
          </CardHeader>
          <CardContent>
            {showCreate && (
              <EnrollmentForm
                entityId={id}
                entityTypeId={entity.entity_type_id}
                allSchemas={allSchemas}
                onSuccess={() => {
                  setShowCreate(false);
                  queryClient.invalidateQueries({ queryKey: ["enrollments-entity", id] });
                }}
                onCancel={() => setShowCreate(false)}
              />
            )}

            {enrollmentAction && (
              <EnrollmentForm
                entityId={id}
                entityTypeId={entity.entity_type_id}
                enrollment={enrollmentAction.enrollment}
                initialIsActive={enrollmentAction.initialIsActive}
                allSchemas={allSchemas}
                onSuccess={() => {
                  setEnrollmentAction(null);
                  queryClient.invalidateQueries({ queryKey: ["enrollments-entity", id] });
                }}
                onCancel={() => setEnrollmentAction(null)}
              />
            )}

            {!showCreate && !enrollmentAction && (
              <>
                {enrollments.length === 0 ? (
                  <p className="text-gray-500 text-sm">No enrollments</p>
                ) : (
                  <>
                    {enrollments.length > 3 && (
                      <div className="flex gap-2 mb-3">
                        {(
                          [
                            { key: "active" as const, label: "Active", count: enrollments.filter((e) => e.is_active).length },
                            { key: "ended" as const, label: "Ended", count: enrollments.filter((e) => !e.is_active).length },
                            { key: "all" as const, label: "All", count: enrollments.length },
                          ]
                        ).map((tab) => (
                          <button
                            key={tab.key}
                            onClick={() => setEnrollmentTab(tab.key)}
                            className={`px-3 py-1.5 text-sm rounded-full whitespace-nowrap transition-colors ${
                              enrollmentTab === tab.key
                                ? "bg-purple-100 text-purple-700 font-medium"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                          >
                            {tab.label}
                            <span className="ml-1 text-xs opacity-70">({tab.count})</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-2">
                      {enrollments
                        .filter((e) => {
                          if (enrollments.length <= 3) return true;
                          if (enrollmentTab === "active") return e.is_active;
                          if (enrollmentTab === "ended") return !e.is_active;
                          return true;
                        })
                        .map((e) => {
                      const dimensionPairs = (e.dimensions || []).map((dim) => ({
                        label: dim.dimension_name,
                        value: dim.value_name,
                      }));
                      const fieldPairs = collectEnrollmentFields(
                        allSchemas,
                        entity.entity_type_id,
                        e.dimensions?.map((d) => d.value_id) || [],
                      )
                        .filter((f) => f.type !== "dimension" && f.visible !== false)
                        .map((f) => {
                          const val = e.meta?.[f.key];
                          const isEmpty = val === undefined || val === null || val === "";
                          let formatted: string;
                          if (isEmpty) formatted = "—";
                          else if (f.type === "boolean") formatted = val ? "Yes" : "No";
                          else if (f.type === "date" && typeof val === "string")
                            formatted = formatDate(val);
                          else if (f.type === "datetime" && typeof val === "string")
                            formatted = formatDateTime(val);
                          else if (Array.isArray(val)) formatted = val.join(", ");
                          else formatted = String(val);
                          return { label: f.label, value: formatted };
                        });
                      const allPairs = [...dimensionPairs, ...fieldPairs];
                      const isActive = e.is_active;
                      return (
                        <div
                          key={e.id}
                          className={`flex flex-col p-3 border rounded gap-2 ${
                            isActive ? "" : "opacity-60"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0 space-y-1 text-sm">
                              <Badge
                                variant={isActive ? "default" : "secondary"}
                                className="mb-1 text-xs"
                              >
                                {isActive ? "Active" : "Ended"}
                              </Badge>
                              {allPairs.map((p, i) => (
                                <div key={`${p.label}-${i}`}>
                                  <span className="text-gray-500">{p.label}:</span>{" "}
                                  <span className="font-medium text-gray-800">{p.value}</span>
                                </div>
                              ))}
                            </div>
                            <Can permission="enrollment:manage">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEnrollmentAction({ enrollment: e })}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </Can>
                          </div>
                          <Can permission="enrollment:manage">
                            {isActive ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="self-start text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                                onClick={() =>
                                  setEnrollmentAction({
                                    enrollment: e,
                                    initialIsActive: false,
                                  })
                                }
                              >
                                End enrollment
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="self-start"
                                onClick={() =>
                                  setEnrollmentAction({
                                    enrollment: e,
                                    initialIsActive: true,
                                  })
                                }
                              >
                                Start again
                              </Button>
                            )}
                          </Can>
                        </div>
                      );
                    })}
                    </div>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Can permission="activity:view">
        <Card className="mt-4">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Activities</CardTitle>
              {activityTypes.length > 1 && activities.length > 0 && (
                <select
                  className="border rounded-md px-2 py-1 text-sm"
                  value={activityTypeFilter}
                  onChange={(e) => setActivityTypeFilter(e.target.value)}
                >
                  <option value="">All types</option>
                  {activityTypes.map((at) => (
                    <option key={at.id} value={at.id}>{at.name}</option>
                  ))}
                </select>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <p className="text-gray-500 text-sm">No activities</p>
            ) : filteredActivities.length === 0 ? (
              <p className="text-gray-500 text-sm">No activities for this type</p>
            ) : (
              <div className="space-y-2">
                {filteredActivities.map((a) => (
                  <Link
                    key={a.id}
                    href={`/activities/${activityTypes.find((at) => at.id === a.activity_type_id)?.key || "unknown"}/${a.id}`}
                    className="flex items-center justify-between p-2 border rounded hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {a.dimensions?.length > 0 ? a.dimensions[0].value_name : a.activity_type_name || "Activity"}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {formatDate(a.start_date)}
                        {a.end_date && a.end_date !== a.start_date && ` – ${formatDate(a.end_date)}`}
                      </div>
                      {a.dimensions?.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {(a.title ? a.dimensions : a.dimensions.slice(1)).map((dim) => (
                            <Badge key={dim.value_id} variant="secondary" className="text-xs">
                              {dim.value_name}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {a.notes && (
                        <p className="text-xs text-gray-500 mt-1 truncate max-w-[300px]">{a.notes}</p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-400 shrink-0 ml-2" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </Can>
      </PageContent>
    </PageLayout>
  );
}

// --- Enrollment Create / Edit Form ---

function EnrollmentForm({
  entityId,
  entityTypeId,
  enrollment,
  initialIsActive,
  allSchemas,
  onSuccess,
  onCancel,
}: {
  entityId: string;
  entityTypeId: string;
  enrollment?: Enrollment;
  initialIsActive?: boolean;
  allSchemas: MetaFieldSchemaItem[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const isEdit = !!enrollment;
  const [isActive, setIsActive] = useState<boolean>(
    initialIsActive ?? enrollment?.is_active ?? true,
  );

  const { data: dimensions = [] } = useQuery<Dimension[]>({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
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

  const [dimensionValueIds, setDimensionValueIds] = useState<string[]>(
    () => enrollment?.dimensions?.map((t) => t.value_id) || []
  );
  const [metaValues, setMetaValues] = useState<Record<string, unknown>>(
    () => enrollment?.meta || {}
  );

  // Admin-configured fields for this enrollment (re-runs as dimensions change
  // to surface dimension-value-scoped fields).
  const allFields = useMemo(
    () => collectEnrollmentFields(allSchemas, entityTypeId, dimensionValueIds),
    [allSchemas, entityTypeId, dimensionValueIds],
  );
  const formFields = useMemo(
    () => allFields.filter((f) => f.visible !== false),
    [allFields],
  );

  const createDisabledKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const f of allFields) {
      if (isEdit && f.stage === "create") keys.add(f.key);
      if (!isEdit && f.stage === "record") keys.add(f.key);
    }
    return keys;
  }, [allFields, isEdit]);

  const selectedByDim = useMemo(() => {
    const map: Record<string, string> = {};
    for (const dim of dimensions) {
      const dimValues = allDimensionValues.filter(
        (dv) => dv.dimension_id === dim.id
      );
      const selected = dimensionValueIds.find((id) =>
        dimValues.some((dv) => dv.id === id)
      );
      if (selected) {
        map[dim.id] = selected;
      }
    }
    return map;
  }, [dimensions, allDimensionValues, dimensionValueIds]);

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof enrollmentApi.create>[0]) =>
      enrollmentApi.create(data),
    onSuccess: () => {
      toast.success("Enrollment created");
      onSuccess();
    },
    onError: () => toast.error("Failed to create enrollment"),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; updates: Partial<Enrollment>; tagIds: string[] }) =>
      Promise.all([
        enrollmentApi.update(data.id, data.updates),
        enrollmentApi.updateDimensions(data.id, data.tagIds),
      ]),
    onSuccess: () => {
      toast.success("Enrollment updated");
      onSuccess();
    },
    onError: () => toast.error("Failed to update enrollment"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields (mirrors activity create page)
    for (const field of formFields) {
      if (!field.required || createDisabledKeys.has(field.key)) continue;
      if (field.type === "dimension") {
        const dimId = field.dimension_id;
        if (!dimId) continue;
        const hasValue = dimensionValueIds.some((dvId) =>
          allDimensionValues.find((dv) => dv.id === dvId)?.dimension_id === dimId,
        );
        if (!hasValue) {
          toast.error(`${field.label} is required`);
          return;
        }
        continue;
      }
      const val = metaValues[field.key];
      if (val === undefined || val === null || val === "") {
        toast.error(`${field.label} is required`);
        return;
      }
    }

    const meta = Object.keys(metaValues).length > 0 ? metaValues : undefined;
    if (isEdit && enrollment) {
      updateMutation.mutate({
        id: enrollment.id,
        updates: { meta, is_active: isActive },
        tagIds: dimensionValueIds,
      });
    } else {
      createMutation.mutate({
        entity_id: entityId,
        meta,
        dimension_value_ids: dimensionValueIds,
        is_active: isActive,
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const renderField = (field: MetaFieldDefinition) => {
    if (field.type === "dimension") {
      const dim = dimensions.find((d) => d.id === field.dimension_id);
      if (!dim) return null;
      const dimValues = allDimensionValues.filter(
        (dv) => dv.dimension_id === dim.id,
      );
      const filtered = getFilteredValues(
        dimValues,
        selectedByDim,
        dim.id,
        dimensionValueLinks,
      );
      const currentSelection =
        dimensionValueIds.find((dvId) =>
          dimValues.some((dv) => dv.id === dvId),
        ) || "";
      const isFieldDisabled = createDisabledKeys.has(field.key);
      return (
        <div key={`dim-${field.key}`}>
          <label className="text-sm font-medium">
            {field.label}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          <select
            className="w-full mt-1 border rounded-md p-2 text-sm disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
            value={currentSelection}
            onChange={(e) => {
              const newId = e.target.value;
              const otherIds = dimensionValueIds.filter(
                (dvId) => !dimValues.some((dv) => dv.id === dvId),
              );
              setDimensionValueIds(newId ? [...otherIds, newId] : otherIds);
            }}
            required={field.required}
            disabled={isFieldDisabled}
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
  };

  return (
    <div className="border rounded p-3 mb-3 bg-gray-50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-sm">
          {isEdit ? "Edit Enrollment" : "New Enrollment"}
        </h3>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        {formFields.length === 0 ? (
          <p className="text-sm text-gray-500">
            No fields have been configured for enrollments. Please ask your admin to set them up in Form Fields under Admin settings.
          </p>
        ) : (
          formFields.map(renderField)
        )}

        {formFields.length > 0 && (
          <div className="flex items-center gap-3 pt-2 border-t">
            <label className="text-sm font-medium">Status:</label>
            <div className="inline-flex rounded-md border overflow-hidden">
              <button
                type="button"
                onClick={() => setIsActive(true)}
                className={`px-3 py-1.5 text-sm transition-colors ${
                  isActive
                    ? "bg-purple-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setIsActive(false)}
                className={`px-3 py-1.5 text-sm transition-colors border-l ${
                  !isActive
                    ? "bg-gray-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                Ended
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {formFields.length > 0 && (
            <Button type="submit" disabled={isPending}>
              {isEdit ? "Save" : "Create"}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
