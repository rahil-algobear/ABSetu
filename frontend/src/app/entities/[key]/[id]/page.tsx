"use client";

import { useState, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams, usePathname } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  entityApi,
  enrollmentApi,
  activityApi,
  activityTypeApi,
  metaFieldSchemaApi,
} from "@/services/api";
import {
  Activity,
  ActivityType,
  Enrollment,
  MetaFieldSchemaItem,
} from "@/types";
import { collectEnrollmentFields, getFieldsForScope } from "@/utils/meta-fields";

import { Can, usePermissions } from "@/components/Auth/Permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLayout } from "@/components/ui/page-layout";
import { PageContent } from "@/components/ui/page-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MetaFieldDisplay } from "@/components/DynamicMetaForm";
import { EntityFields, type EntityFieldsHandle } from "@/components/EntityFields";
import { EnrollmentForm } from "@/components/EnrollmentForm";
import { ActivityList } from "@/components/ActivityList";
import { Dialog } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { Plus, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { formatDate, formatDateTime } from "@/utils/date";

export default function EntityDetailPage() {
  const { id } = useParams<{ key: string; id: string }>();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = usePermissions();
  const canViewActivities = can("activity:view");
  const tabParam = searchParams.get("tab");
  const activeTab =
    tabParam === "activities" && canViewActivities ? "activities" : "details";

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "details") {
      params.delete("tab");
    } else {
      params.set("tab", value);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };


  const [showCreate, setShowCreate] = useState(false);
  const [enrollmentAction, setEnrollmentAction] = useState<
    { enrollment: Enrollment; initialIsActive?: boolean } | null
  >(null);
  const [enrollmentTab, setEnrollmentTab] = useState<"active" | "ended" | "all">("active");
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailMetaValues, setDetailMetaValues] = useState<Record<string, unknown>>({});
  const [detailFormError, setDetailFormError] = useState<string | null>(null);
  const entityFieldsRef = useRef<EntityFieldsHandle>(null);

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

  const typesWithActivities = useMemo(() => {
    const countByTypeId = new Map<string, number>();
    for (const a of activities) {
      if (!a.activity_type_id) continue;
      countByTypeId.set(
        a.activity_type_id,
        (countByTypeId.get(a.activity_type_id) ?? 0) + 1,
      );
    }
    return activityTypes
      .filter((t) => countByTypeId.has(t.id))
      .map((t) => ({
        id: t.id,
        key: t.key,
        name: t.name,
        count: countByTypeId.get(t.id) ?? 0,
      }));
  }, [activities, activityTypes]);

  const subTabParam = searchParams.get("type");
  const activeSubTabKey =
    typesWithActivities.find((t) => t.key === subTabParam)?.key ??
    typesWithActivities[0]?.key ??
    "";

  const handleSubTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("type", value);
    // Reset ActivityList URL state so each type starts fresh
    for (const k of Array.from(params.keys())) {
      if (
        k === "search" ||
        k === "sort_by" ||
        k === "sort_order" ||
        k === "page" ||
        k === "show" ||
        k.startsWith("filter_")
      ) {
        params.delete(k);
      }
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const filteredEnrollments = useMemo(
    () => enrollments.filter((e) => {
      if (enrollmentTab === "active") return e.is_active;
      if (enrollmentTab === "ended") return !e.is_active;
      return true;
    }),
    [enrollments, enrollmentTab],
  );

  const canEnroll = entity?.entity_type_can_enroll !== false;

  const updateDetailsMutation = useMutation({
    mutationFn: (meta: Record<string, unknown>) =>
      entityApi.update(id, { meta }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entity", id] });
      setEditingDetails(false);
      setDetailFormError(null);
      toast.success("Details updated");
    },
    onError: () => toast.error("Failed to update details"),
  });

  const deleteEnrollmentMutation = useMutation({
    mutationFn: (enrollmentId: string) => enrollmentApi.delete(enrollmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrollments-entity", id] });
      toast.success("Enrollment deleted");
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || "Failed to delete enrollment");
    },
  });

  const openEditDetails = () => {
    setDetailMetaValues(entity?.meta || {});
    setDetailFormError(null);
    setEditingDetails(true);
  };

  const cancelEditDetails = () => {
    setEditingDetails(false);
    setDetailFormError(null);
  };

  const handleSaveDetails = (e: React.FormEvent) => {
    e.preventDefault();
    setDetailFormError(null);
    const validationError = entityFieldsRef.current?.validate();
    if (validationError) {
      setDetailFormError(validationError);
      return;
    }
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

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        {canViewActivities && (
          <TabsList className="mb-2">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="activities">
              Activities{activities.length > 0 ? ` (${activities.length})` : ""}
            </TabsTrigger>
          </TabsList>
        )}
        <TabsContent value="details">
          <div
            className={`grid grid-cols-1 gap-4 ${
              canEnroll ? "md:grid-cols-3 lg:grid-cols-4" : "md:grid-cols-2"
            }`}
          >
      {metaFields.length > 0 && (
        <Card className="md:col-span-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Details</CardTitle>
              <Can permission="entity:edit">
                <Button size="sm" variant="outline" onClick={openEditDetails}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Edit
                </Button>
              </Can>
            </div>
          </CardHeader>
          <CardContent>
            <MetaFieldDisplay
              fields={metaFields}
              values={entity.meta}
              showEmpty
            />
          </CardContent>
        </Card>
      )}

      {canEnroll && (
        <Card className="md:col-span-2 lg:col-span-3">
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
            <Dialog
              open={showCreate}
              onClose={() => setShowCreate(false)}
              title="New Enrollment"
            >
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
            </Dialog>

            <Dialog
              open={!!enrollmentAction}
              onClose={() => setEnrollmentAction(null)}
              title="Edit Enrollment"
            >
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
            </Dialog>

            <>
                {enrollments.length === 0 ? (
                  <p className="text-gray-500 text-sm">No enrollments</p>
                ) : (
                  <>
                    <div className="flex gap-2 -mt-1 mb-4">
                      {(
                        [
                          { key: "active" as const, label: "Active", count: enrollments.filter((e) => e.is_active).length },
                          { key: "ended" as const, label: "Inactive", count: enrollments.filter((e) => !e.is_active).length },
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
                    {filteredEnrollments.length === 0 ? (
                      <p className="text-gray-500 text-sm">
                        {enrollmentTab === "active"
                          ? "No active enrollments."
                          : enrollmentTab === "ended"
                            ? "No inactive enrollments."
                            : "No enrollments."}
                      </p>
                    ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-2">
                      {filteredEnrollments
                        .map((e) => {
                      // Render every configured enrollment field in sort_order,
                      // pulling dimension values from e.dimensions and
                      // everything else from e.meta. Keeps card field order
                      // consistent with what the admin configured in the
                      // form-builder, instead of dimensions-first + meta-after.
                      const dimensionValueByDimId = new Map(
                        (e.dimensions || []).map((d) => [d.dimension_id, d]),
                      );
                      const allPairs = collectEnrollmentFields(
                        allSchemas,
                        entity.entity_type_id,
                        e.dimensions?.map((d) => d.value_id) || [],
                      )
                        .filter((f) => f.visible !== false)
                        .map((f) => {
                          if (f.type === "dimension") {
                            const dv = f.dimension_id
                              ? dimensionValueByDimId.get(f.dimension_id)
                              : undefined;
                            return {
                              label: f.label,
                              value: dv?.value_name || "—",
                            };
                          }
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
                      const isActive = e.is_active;
                      return (
                        <div
                          key={e.id}
                          className={`flex flex-col p-3 border rounded gap-2 ${
                            isActive ? "" : "opacity-60"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <Badge
                              variant={isActive ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {isActive ? "Active" : "Inactive"}
                            </Badge>
                            {e.editable && (
                              <Can permission="enrollment:manage">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-gray-400 hover:text-red-600 hover:bg-red-50"
                                  onClick={() => {
                                    if (
                                      confirm(
                                        "Delete this enrollment? This can't be undone.",
                                      )
                                    ) {
                                      deleteEnrollmentMutation.mutate(e.id);
                                    }
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </Can>
                            )}
                          </div>
                          <div className="space-y-1 text-sm">
                            {allPairs.map((p, i) => (
                              <div key={`${p.label}-${i}`}>
                                <span className="text-gray-500">{p.label}:</span>{" "}
                                <span className="font-medium text-gray-800">{p.value}</span>
                              </div>
                            ))}
                          </div>
                          {e.editable && (
                          <Can permission="enrollment:manage">
                            <div className="flex items-center gap-2">
                              {isActive ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                                  onClick={() =>
                                    setEnrollmentAction({
                                      enrollment: e,
                                      initialIsActive: false,
                                    })
                                  }
                                >
                                  Set Inactive
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1"
                                  onClick={() =>
                                    setEnrollmentAction({
                                      enrollment: e,
                                      initialIsActive: true,
                                    })
                                  }
                                >
                                  Set Active
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1"
                                onClick={() => setEnrollmentAction({ enrollment: e })}
                              >
                                Edit
                              </Button>
                            </div>
                          </Can>
                          )}
                        </div>
                      );
                    })}
                    </div>
                    )}
                  </>
                )}
              </>
          </CardContent>
        </Card>
      )}

          </div>
        </TabsContent>
        {canViewActivities && (
        <TabsContent value="activities">
          {typesWithActivities.length === 0 ? (
            <Card>
              <CardContent>
                <p className="text-gray-500 text-sm">No activities</p>
              </CardContent>
            </Card>
          ) : typesWithActivities.length === 1 ? (
            <ActivityList
              activityTypeKey={typesWithActivities[0].key}
              activityTypeId={typesWithActivities[0].id}
              activityTypeName={typesWithActivities[0].name}
              extraFilters={{ entity_id: id }}
            />
          ) : (
            <Tabs value={activeSubTabKey} onValueChange={handleSubTabChange}>
              <TabsList className="mb-2">
                {typesWithActivities.map((t) => (
                  <TabsTrigger key={t.key} value={t.key}>
                    {t.name} ({t.count})
                  </TabsTrigger>
                ))}
              </TabsList>
              {typesWithActivities.map((t) => (
                <TabsContent key={t.key} value={t.key}>
                  <ActivityList
                    activityTypeKey={t.key}
                    activityTypeId={t.id}
                    activityTypeName={t.name}
                    extraFilters={{ entity_id: id }}
                  />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </TabsContent>
        )}
      </Tabs>

      <Dialog
        open={editingDetails}
        onClose={cancelEditDetails}
        title="Edit Details"
        className="max-w-lg"
      >
        <form onSubmit={handleSaveDetails} className="space-y-3">
          {detailFormError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {detailFormError}
            </div>
          )}
          <EntityFields
            ref={entityFieldsRef}
            entityTypeId={entity.entity_type_id}
            allSchemas={allSchemas}
            metaValues={detailMetaValues}
            onMetaChange={setDetailMetaValues}
            mode="edit"
          />
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={updateDetailsMutation.isPending}>
              Save
            </Button>
            <Button type="button" variant="outline" onClick={cancelEditDetails}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>
      </PageContent>
    </PageLayout>
  );
}

