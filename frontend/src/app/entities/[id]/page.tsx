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
} from "@/types";

import { Can } from "@/components/Auth/Permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLayout } from "@/components/ui/page-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DynamicMetaForm, MetaFieldDisplay } from "@/components/DynamicMetaForm";
import { PageHeader } from "@/components/ui/page-header";
import { Plus, Pencil, X, ChevronRight } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import { formatDate } from "@/utils/date";

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
  const params = useParams();
  const id = params.id as string;
  const queryClient = useQueryClient();


  const [showCreate, setShowCreate] = useState(false);
  const [editingEnrollment, setEditingEnrollment] = useState<Enrollment | null>(null);

  const { data: entity, isLoading } = useQuery({
    queryKey: ["entity", id],
    queryFn: () => entityApi.get(id),
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ["enrollments-entity", id],
    queryFn: () => enrollmentApi.listByEntity(id),
    enabled: !!entity,
  });

  const { data: metaFields = [] } = useQuery<MetaFieldDefinition[]>({
    queryKey: ["meta-field-schemas", "entity"],
    queryFn: () => metaFieldSchemaApi.get("entity"),
  });

  const { data: enrollmentMetaFields = [] } = useQuery<MetaFieldDefinition[]>({
    queryKey: ["meta-field-schemas", "enrollment"],
    queryFn: () => metaFieldSchemaApi.get("enrollment"),
  });

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

  const canEnroll = entity?.entity_type_config?.can_enroll !== false;

  if (isLoading) return <PageLayout className="p-4"><p>Loading...</p></PageLayout>;
  if (!entity) return <PageLayout className="p-4"><p>Not found</p></PageLayout>;

  return (
    <PageLayout className="p-4">
      <PageHeader title={entity.name} />
      <div className="flex gap-1 items-center mb-2 -mt-2">
        {entity.case_number && (
          <span className="text-gray-500">{entity.case_number}</span>
        )}
        {entity.entity_type_name && (
          <Badge variant="secondary">{entity.entity_type_name}</Badge>
        )}
      </div>

      {entity.dimensions?.length > 0 && (
        <div className="flex gap-1 mb-4">
          {entity.dimensions.map((dim) => (
            <Badge key={dim.value_id} variant="secondary">
              {dim.dimension_name}: {dim.value_name}
            </Badge>
          ))}
        </div>
      )}

      {entity.meta && Object.keys(entity.meta).length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <MetaFieldDisplay
              fields={metaFields}
              values={entity.meta}
            />
          </CardContent>
        </Card>
      )}

      {canEnroll && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Enrollments</CardTitle>
              <Can permission="enrollment:manage">
                {!showCreate && !editingEnrollment && (
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
                metaFields={enrollmentMetaFields}
                onSuccess={() => {
                  setShowCreate(false);
                  queryClient.invalidateQueries({ queryKey: ["enrollments-entity", id] });
                }}
                onCancel={() => setShowCreate(false)}
              />
            )}

            {editingEnrollment && (
              <EnrollmentForm
                entityId={id}
                enrollment={editingEnrollment}
                metaFields={enrollmentMetaFields}
                onSuccess={() => {
                  setEditingEnrollment(null);
                  queryClient.invalidateQueries({ queryKey: ["enrollments-entity", id] });
                }}
                onCancel={() => setEditingEnrollment(null)}
              />
            )}

            {!showCreate && !editingEnrollment && (
              <>
                {enrollments.length === 0 ? (
                  <p className="text-gray-500 text-sm">No enrollments</p>
                ) : (
                  <div className="space-y-2">
                    {enrollments.map((e) => (
                      <div
                        key={e.id}
                        className="flex justify-between items-center p-2 border rounded"
                      >
                        <div>
                          <div className="flex gap-1 mb-0.5 flex-wrap">
                            {e.dimensions?.map((dim) => (
                              <Badge key={dim.value_id} variant="secondary" className="text-xs">
                                {dim.value_name}
                              </Badge>
                            ))}
                          </div>
                          <p className="text-xs text-gray-500">
                            {formatDate(e.admission_date)}
                            {e.release_date ? ` to ${formatDate(e.release_date)}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={e.release_date ? "secondary" : "default"}>
                            {e.release_date ? "Released" : "Active"}
                          </Badge>
                          <Can permission="enrollment:manage">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingEnrollment(e)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </Can>
                        </div>
                      </div>
                    ))}
                  </div>
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
                    href={`/activities/${a.id}`}
                    className="flex items-center justify-between p-2 border rounded hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {a.title || (a.dimensions?.length > 0 ? a.dimensions[0].value_name : a.activity_type_name || "Activity")}
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
    </PageLayout>
  );
}

// --- Enrollment Create / Edit Form ---

function EnrollmentForm({
  entityId,
  enrollment,
  metaFields,
  onSuccess,
  onCancel,
}: {
  entityId: string;
  enrollment?: Enrollment;
  metaFields: MetaFieldDefinition[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const isEdit = !!enrollment;

  const { data: dimensions = [] } = useQuery<Dimension[]>({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
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

  const selectableDimensions = useMemo(
    () => dimensions.filter((d) => !d.is_system),
    [dimensions]
  );

  // Initialize form data from enrollment if editing
  const [admissionDate, setAdmissionDate] = useState(
    enrollment?.admission_date || new Date().toISOString().split("T")[0]
  );
  const [releaseDate, setReleaseDate] = useState(enrollment?.release_date || "");
  const [dimensionValueIds, setDimensionValueIds] = useState<string[]>(
    () => enrollment?.dimensions?.map((t) => t.value_id) || []
  );
  const [metaValues, setMetaValues] = useState<Record<string, unknown>>(
    () => enrollment?.meta || {}
  );

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
    if (isEdit && enrollment) {
      updateMutation.mutate({
        id: enrollment.id,
        updates: {
          admission_date: admissionDate,
          release_date: releaseDate || null,
          meta: metaFields.length > 0 ? metaValues : undefined,
        },
        tagIds: dimensionValueIds,
      });
    } else {
      const payload: Parameters<typeof enrollmentApi.create>[0] = {
        entity_id: entityId,
        admission_date: admissionDate,
        dimension_value_ids: dimensionValueIds,
      };
      if (releaseDate) payload.release_date = releaseDate;
      if (metaFields.length > 0) payload.meta = metaValues;
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

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
            dimensionValueIds.find((dvId) =>
              dimValues.some((dv) => dv.id === dvId)
            ) || "";
          return (
            <div key={dim.id}>
              <label className="text-sm font-medium">{dim.name}</label>
              <select
                className="w-full mt-1 border rounded-md p-2 text-sm"
                value={currentSelection}
                onChange={(e) => {
                  const newId = e.target.value;
                  const otherIds = dimensionValueIds.filter(
                    (dvId) => !dimValues.some((dv) => dv.id === dvId)
                  );
                  setDimensionValueIds(
                    newId ? [...otherIds, newId] : otherIds
                  );
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

        <div>
          <label className="text-sm font-medium">Admission Date</label>
          <Input
            type="date"
            value={admissionDate}
            onChange={(e) => setAdmissionDate(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="text-sm font-medium">Release Date</label>
          <Input
            type="date"
            value={releaseDate}
            onChange={(e) => setReleaseDate(e.target.value)}
          />
        </div>

        <DynamicMetaForm
          fields={metaFields}
          values={metaValues}
          onChange={setMetaValues}
        />

        <div className="flex gap-2">
          <Button type="submit" disabled={isPending}>
            {isEdit ? "Save" : "Create"}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
