"use client";

import { useState, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams, usePathname } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  activityApi,
  dimensionApi,
  entityApi,
  entityTypeApi,
  listConfigApi,
  metaFieldSchemaApi,
  userApi,
} from "@/services/api";
import {
  ActivityParticipant,
  MetaFieldDefinition,
  MetaFieldSchemaItem,
} from "@/types";
import { collectActivityFields, collectParticipantFields } from "@/utils/meta-fields";
import { formatDate, formatDateTime } from "@/utils/date";
import { pluralize } from "@/utils/pluralize";
import { useFromLink } from "@/hooks/useFromLink";
import { Can } from "@/components/Auth/Permissions";

import {
  ActivityFields,
  type ActivityFieldsHandle,
} from "@/components/ActivityFields";
import { type FormValues } from "@/utils/field-visibility";
import { ParticipantPicker } from "@/components/ParticipantPicker";
import { ParticipantList } from "@/components/ParticipantList";
import { ParticipantSectionEditor } from "@/components/ParticipantSectionEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageLayout } from "@/components/ui/page-layout";
import { PageContent } from "@/components/ui/page-content";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog } from "@/components/ui/dialog";
import { Trash2, Pencil } from "lucide-react";
import toast from "react-hot-toast";

export default function ActivityDetailPage() {
  const { key: typeKey, id } = useParams<{ key: string; id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const tabParam = searchParams.get("tab");
  const activeTab = tabParam === "participants" ? "participants" : "details";

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

  // One section at a time. The section_key being edited, or null.
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailValues, setDetailValues] = useState<FormValues>({
    meta: {},
    dimensions: [],
  });
  const [detailFormError, setDetailFormError] = useState<string | null>(null);
  const activityFieldsRef = useRef<ActivityFieldsHandle>(null);

  const cancelEditDetails = () => {
    setEditingDetails(false);
    setDetailFormError(null);
  };

  const { data: activity, isLoading } = useQuery({
    queryKey: ["activity", id],
    queryFn: () => activityApi.get(id),
  });

  const { data: participants = [] } = useQuery({
    queryKey: ["participants", id],
    queryFn: () => activityApi.getParticipants(id),
  });

  const { data: entityTypes = [] } = useQuery({
    queryKey: ["entity-types"],
    queryFn: entityTypeApi.list,
  });

  const { data: dimensions = [] } = useQuery({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
  });

  const { data: allMetaSchemas = [] } = useQuery<MetaFieldSchemaItem[]>({
    queryKey: ["meta-field-schemas-all"],
    queryFn: metaFieldSchemaApi.getAll,
  });

  const activityTypeId = activity?.activity_type_id || "";

  // All field definitions — the sole source of truth
  const allFields = useMemo((): MetaFieldDefinition[] => {
    const dvIds = (activity?.dimensions || []).map((d) => d.value_id);
    return collectActivityFields(allMetaSchemas, activityTypeId || null, dvIds);
  }, [activityTypeId, activity, allMetaSchemas]);

  // Visible fields split by purpose
  const detailFields = useMemo(() => {
    return allFields.filter((f) =>
      f.visible !== false
      && f.type !== "entity_list" && f.type !== "user_list"
    );
  }, [allFields]);

  const participantListFields = useMemo(() => {
    return allFields.filter((f) =>
      f.visible !== false
      && (f.type === "entity_list" || f.type === "user_list")
      && (!f.stage || f.stage === "both" || f.stage === "edit")
    );
  }, [allFields]);

  const sections = useMemo(() => {
    return participantListFields.map((field) => ({
      key: field.type === "user_list" ? "user" : (field.entity_type_id || field.key),
      field,
    }));
  }, [participantListFields]);

  const sectionParam = searchParams.get("section");
  const activeSectionKey =
    sections.find((s) => s.key === sectionParam)?.key
    ?? sections[0]?.key
    ?? "";

  const handleSectionChange = (value: string) => {
    setEditingSection(null);
    const params = new URLSearchParams(searchParams.toString());
    if (value === sections[0]?.key) {
      params.delete("section");
    } else {
      params.set("section", value);
    }
    // Reset the list params so each section's search/sort/page starts fresh.
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
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  // Entity type source IDs for loading entity options
  const entitySourceIds = useMemo(() => {
    return participantListFields
      .filter((f) => f.type === "entity_list" && f.entity_type_id)
      .map((f) => f.entity_type_id!);
  }, [participantListFields]);

  const hasUserSection = participantListFields.some((f) => f.type === "user_list");

  // Just the IDs of entities that are actually participants in this
  // activity — by-ids fetch scales with participants-per-activity, not
  // total org size.
  const participantEntityIds = useMemo(
    () =>
      participants
        .filter((p) => p.participant_type === "entity")
        .map((p) => p.participant_id),
    [participants],
  );

  const { data: entitiesByType = {} } = useQuery({
    queryKey: ["entities-for-sections", participantEntityIds.join(",")],
    queryFn: async () => {
      const entities =
        participantEntityIds.length > 0
          ? await entityApi.listByIds(participantEntityIds)
          : [];

      // Group by entity_type_id, deriving the display name from each
      // type's first meta column (matches the old behaviour).
      const result: Record<string, { id: string; name: string }[]> = {};
      const columnsByType: Record<string, string | undefined> = {};
      await Promise.all(
        entitySourceIds.map(async (typeId) => {
          const columns = await listConfigApi.get(`entity:${typeId}`);
          const firstCol = columns.find((c) => c.visible && c.key.startsWith("meta:"));
          columnsByType[typeId] = firstCol?.key.replace(/^meta:/, "");
          result[typeId] = [];
        }),
      );
      for (const e of entities) {
        const metaKey = columnsByType[e.entity_type_id];
        const list = result[e.entity_type_id] || (result[e.entity_type_id] = []);
        list.push({
          id: e.id,
          name: metaKey ? String((e.meta || {})[metaKey] || "") : "",
        });
      }
      return result;
    },
    enabled: entitySourceIds.length > 0,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: userApi.list,
    enabled: hasUserSection,
  });

  // Get participation meta fields for an entity type
  const getParticipationMetaFields = (field: MetaFieldDefinition): MetaFieldDefinition[] => {
    if (!field.entity_type_id) return [];
    const dvIds = (activity?.dimensions || []).map((d) => d.value_id);
    return collectParticipantFields(allMetaSchemas, field.entity_type_id, activityTypeId || null, dvIds);
  };

  const getSectionKey = (field: MetaFieldDefinition): string => {
    if (field.type === "user_list") return "user";
    return field.entity_type_id || field.key;
  };

  const updateDetailsMutation = useMutation({
    mutationFn: (data: { meta?: Record<string, unknown> }) =>
      activityApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity", id] });
      setEditingDetails(false);
      toast.success("Details updated");
    },
    onError: () => toast.error("Failed to update details"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => activityApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      toast.success("Activity deleted");
      router.push(`/activities/${typeKey}`);
    },
    onError: () => toast.error("Failed to delete activity"),
  });

  const openDetailEditing = () => {
    if (!activity) return;
    setDetailValues({
      meta: activity.meta || {},
      // Activity dimensions are immutable post-create; we seed them so
      // ActivityFields can render them locked at their current value.
      dimensions: (activity.dimensions || []).map((d) => d.value_id),
    });
    setDetailFormError(null);
    setEditingDetails(true);
  };

  const handleDetailSave = () => {
    setDetailFormError(null);
    const validationError = activityFieldsRef.current?.validate();
    if (validationError) {
      setDetailFormError(validationError);
      return;
    }
    updateDetailsMutation.mutate({ meta: detailValues.meta });
  };

  const handleDelete = () => {
    if (confirm("Delete this activity? This cannot be undone.")) {
      deleteMutation.mutate();
    }
  };

  const participantsBySection = useMemo(() => {
    const map: Record<string, ActivityParticipant[]> = {};
    for (const p of participants) {
      if (!map[p.section_key]) map[p.section_key] = [];
      map[p.section_key].push(p);
    }
    return map;
  }, [participants]);

  const getFieldLabel = (field: MetaFieldDefinition): string => {
    if (field.type === "user_list") return "Users";
    if (field.entity_type_id) {
      const et = entityTypes.find((t) => t.id === field.entity_type_id);
      return et?.name || field.label;
    }
    return field.label;
  };

  const getParticipantName = (p: ActivityParticipant): string => {
    if (p.participant_type === "user") {
      const u = users.find((u) => u.id === p.participant_id);
      return u ? `${u.first_name} ${u.last_name}`.trim() : p.participant_id;
    }
    // Entity — look up from loaded entitiesByType
    for (const opts of Object.values(entitiesByType)) {
      const found = opts.find((o) => o.id === p.participant_id);
      if (found) return found.name;
    }
    return p.participant_id;
  };

  const backLink = useFromLink({
    fallbackHref: `/activities/${typeKey}`,
    fallbackLabel: pluralize(activity?.activity_type_name || "Activity"),
  });

  if (isLoading) return <PageLayout><PageContent><p>Loading...</p></PageContent></PageLayout>;
  if (!activity) return <PageLayout><PageContent><p>Not found</p></PageContent></PageLayout>;

  const renderDetailField = (field: MetaFieldDefinition) => {
    if (field.type === "dimension") {
      const dimDef = dimensions.find((d) => d.id === field.dimension_id);
      const dimInfo = dimDef
        ? activity.dimensions.find((d) => d.dimension_key === dimDef.key)
        : undefined;
      return (
        <div key={`dim-${field.key}`}>
          <p className="text-xs text-gray-500">
            {dimInfo?.dimension_name || dimDef?.name || field.label}
          </p>
          {dimInfo ? (
            <p className="text-sm font-medium">{dimInfo.value_name}</p>
          ) : (
            <p className="text-sm text-gray-300 italic">Not set</p>
          )}
        </div>
      );
    }

    const val = (activity.meta || {})[field.key];
    const isEmpty = val === undefined || val === null || val === "";
    const formatted =
      isEmpty
        ? "Not set"
        : field.type === "boolean"
          ? (val ? "Yes" : "No")
          : field.type === "date" && typeof val === "string"
            ? formatDate(val)
            : field.type === "datetime" && typeof val === "string"
              ? formatDateTime(val)
              : Array.isArray(val)
                ? val.join(", ")
                : String(val);
    return (
      <div key={`view-field-${field.key}`}>
        <p className="text-xs text-gray-500">{field.label}</p>
        <p className={`text-sm ${isEmpty ? "text-gray-300 italic" : "font-medium"}`}>
          {formatted}
        </p>
      </div>
    );
  };

  const renderSection = (field: MetaFieldDefinition) => {
    const sectionKey = getSectionKey(field);
    const sectionParticipants = participantsBySection[sectionKey] || [];
    const metaFields = getParticipationMetaFields(field);
    const captureStatus = field.config?.capture_status as boolean || false;
    const hasStatus = captureStatus || sectionParticipants.some((p) => p.status);

    const fieldEntityType = field.type === "entity_list"
      ? entityTypes.find((t) => t.id === field.entity_type_id)
      : null;
    const isUserSection = field.type === "user_list";
    const smartPickerEligible =
      !isUserSection
      && !!fieldEntityType?.can_enroll
      && activity.dimensions.length > 0;
    const alreadyAdded = sectionParticipants.map((p) => ({
      id: p.participant_id,
      name: getParticipantName(p),
    }));

    const isEditingThisSection = editingSection === sectionKey;
    const anySectionEditing = editingSection !== null;

    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            {getFieldLabel(field)}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
            <Badge variant="secondary" className="text-xs font-normal ml-1">
              {sectionParticipants.length}
            </Badge>
          </h3>
          <div className="flex items-center gap-2">
            {!anySectionEditing && (isUserSection || fieldEntityType) && (
              <Can permission="activity:create">
                <ParticipantPicker
                  activityId={activity.id}
                  activityDimensions={activity.dimensions.map((d) => ({
                    dimension_id: d.dimension_id,
                    dimension_name: d.dimension_name,
                    value_id: d.value_id,
                    value_name: d.value_name,
                  }))}
                  sectionKey={sectionKey}
                  entityTypeId={fieldEntityType?.id}
                  entityTypeName={getFieldLabel(field)}
                  participantKind={isUserSection ? "user" : "entity"}
                  smart={smartPickerEligible}
                  canEnroll={!!fieldEntityType?.can_enroll}
                  alreadyAdded={alreadyAdded}
                  onAdded={() => {
                    queryClient.invalidateQueries({ queryKey: ["participants", id] });
                    queryClient.invalidateQueries({
                      queryKey: ["participants-page", activity.id, sectionKey],
                    });
                    queryClient.invalidateQueries({ queryKey: ["entities-for-sections"] });
                  }}
                />
              </Can>
            )}
            {sectionParticipants.length > 0 && !anySectionEditing && (
              <Can permission="activity:create">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingSection(sectionKey)}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Edit
                </Button>
              </Can>
            )}
          </div>
        </div>
        {isEditingThisSection ? (
          <ParticipantSectionEditor
            activityId={activity.id}
            sectionKey={sectionKey}
            field={field}
            metaFields={metaFields}
            onClose={() => {
              setEditingSection(null);
              queryClient.invalidateQueries({ queryKey: ["participants", id] });
            }}
          />
        ) : (
          <ParticipantList
            activityId={activity.id}
            sectionKey={sectionKey}
            entityTypeKey={fieldEntityType?.key ?? null}
            metaFields={metaFields}
            hasStatus={hasStatus}
            sectionLabel={getFieldLabel(field)}
          />
        )}
      </div>
    );
  };

  const activityTitle = activity.dimensions.length > 0 ? activity.dimensions[0].value_name : "Activity";
  const typeName = activity.activity_type_name || "Activity";
  const activitySubtitle = activity.dimensions.length > 1
    ? `${typeName} - ${activity.dimensions.slice(1).map((d) => d.value_name).join(" · ")}`
    : typeName;

  return (
    <PageLayout>
      <PageHeader
        title={activityTitle}
        description={activitySubtitle}
        back={backLink}
        actions={
          <Can permission="activity:create">
            <Button
              size="sm"
              variant="outline"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="text-red-500 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </Can>
        }
      />

      <PageContent>
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-2">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="participants">
            Participants{participants.length > 0 ? ` (${participants.length})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Details</CardTitle>
              <Can permission="activity:create">
                <Button size="sm" variant="outline" onClick={openDetailEditing}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Edit
                </Button>
              </Can>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {detailFields.map((field) => renderDetailField(field))}
                {/* Show any meta values not in the schema */}
                {Object.entries(activity.meta || {})
                  .filter(([key]) => !detailFields.some((f) => f.key === key))
                  .map(([key, val]) => (
                    <div key={`extra-${key}`}>
                      <p className="text-xs text-gray-500 capitalize">{key.replace(/_/g, " ")}</p>
                      <p className="text-sm font-medium">{String(val)}</p>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="participants">
      {/* Participant sections */}
      {participantListFields.length > 0 ? (
        <Card>
          <CardContent className="space-y-4 pt-6">
            {sections.length === 1 ? (
              renderSection(sections[0].field)
            ) : (
              <Tabs value={activeSectionKey} onValueChange={handleSectionChange}>
                <TabsList className="mb-2">
                  {sections.map((s) => {
                    const count = (participantsBySection[s.key] || []).length;
                    return (
                      <TabsTrigger key={s.key} value={s.key}>
                        {getFieldLabel(s.field)}
                        {count > 0 ? ` (${count})` : ""}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
                {sections.map((s) => (
                  <TabsContent key={s.key} value={s.key}>
                    {renderSection(s.field)}
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </CardContent>
        </Card>
      ) : (
        /* No participant fields — show flat participant list */
        <Card>
          <CardContent className="pt-6">
            {participants.length === 0 ? (
              <p className="text-gray-400 text-sm italic">No participants recorded</p>
            ) : (
              <div className="space-y-1">
                {participants.map((p) => (
                  <div
                    key={p.id}
                    className="flex justify-between items-center p-2 border rounded text-sm"
                  >
                    <span>{getParticipantName(p)}</span>
                    {p.status && (
                      <Badge variant={p.status === "present" ? "default" : "secondary"}>
                        {p.status}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={editingDetails}
        onClose={cancelEditDetails}
        title="Edit Details"
        className="max-w-lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleDetailSave();
          }}
          className="space-y-3"
        >
          {detailFormError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {detailFormError}
            </div>
          )}
          <ActivityFields
            ref={activityFieldsRef}
            activityTypeId={activityTypeId || null}
            allSchemas={allMetaSchemas}
            values={detailValues}
            onChange={setDetailValues}
            mode="edit"
            includeParticipantSections={false}
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
