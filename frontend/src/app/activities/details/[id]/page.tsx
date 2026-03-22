"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  activityApi,
  activityFormApi,
  dimensionApi,
  entityApi,
  entityTypeApi,
  metaFieldSchemaApi,
  userApi,
} from "@/services/api";
import {
  ActivityForm,
  ActivityFormElement,
  ActivityParticipant,
  MetaFieldDefinition,
  MetaFieldSchemaItem,
} from "@/types";
import { collectActivityFields, collectParticipantFields } from "@/utils/meta-fields";
import { Can } from "@/components/Auth/Permissions";

import { DynamicMetaForm, MetaFieldDisplay } from "@/components/DynamicMetaForm";
import { SearchSelectParticipants } from "@/components/SearchSelectParticipants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageLayout } from "@/components/ui/page-layout";
import { PageContent } from "@/components/ui/page-content";
import { PageHeader } from "@/components/ui/page-header";
import { Trash2, Pencil, Calendar, FileText, Users, Type } from "lucide-react";
import toast from "react-hot-toast";
import { formatDateTime } from "@/utils/date";
import { DateTimeInput } from "@/components/ui/date-time-input";

export default function ActivityDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const queryClient = useQueryClient();

  const [editingSections, setEditingSections] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailFormData, setDetailFormData] = useState({
    title: "",
    start_date: "",
    end_date: "",
    notes: "",
  });
  const [detailMetaValues, setDetailMetaValues] = useState<Record<string, unknown>>({});
  const [participantState, setParticipantState] = useState<
    Record<string, { participant_id: string; participant_type: string; status?: string; meta?: Record<string, unknown> }[]>
  >({});

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

  // Activity type ID comes directly from the activity
  const activityTypeId = activity?.activity_type_id || "";

  // Load form builder config
  const { data: formConfig } = useQuery<ActivityForm>({
    queryKey: ["activity-form", activityTypeId],
    queryFn: () => activityFormApi.get(activityTypeId),
    enabled: !!activityTypeId,
  });

  // Get entity_type elements from form config (these are participant sections)
  const entityTypeElements: ActivityFormElement[] = useMemo(() => {
    if (!formConfig?.elements?.length) return [];
    return formConfig.elements
      .filter((el) => el.type === "entity_type" && el.visible)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [formConfig]);

  // Visible non-participant elements (default + activity_meta + dimension) for the detail/edit view
  const detailElements: ActivityFormElement[] = useMemo(() => {
    if (!formConfig?.elements?.length) return [];
    return formConfig.elements
      .filter((el) => el.visible && (el.type === "default" || el.type === "activity_meta" || el.type === "dimension"))
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [formConfig]);

  // Entity type source IDs from form elements
  const entitySourceIds = useMemo(() => {
    return entityTypeElements
      .filter((el) => el.ref_id && el.ref_id !== "user")
      .map((el) => el.ref_id!);
  }, [entityTypeElements]);

  const hasUserSection = entityTypeElements.some((el) => el.ref_id === "user");

  // Load entities for each entity type
  const { data: entitiesByType = {} } = useQuery({
    queryKey: ["entities-for-sections", entitySourceIds.join(",")],
    queryFn: async () => {
      const result: Record<string, { id: string; name: string }[]> = {};
      for (const typeId of entitySourceIds) {
        const entities = await entityApi.list(typeId);
        result[typeId] = entities.map((e) => ({ id: e.id, name: e.name }));
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

  // Get participation meta fields for an entity type element
  const getParticipationMetaFields = (el: ActivityFormElement): MetaFieldDefinition[] => {
    if (!el.ref_id) return [];
    const dvIds = (activity?.dimensions || []).map((d) => d.value_id);
    return collectParticipantFields(allMetaSchemas, el.ref_id, activityTypeId || null, dvIds);
  };

  // Use ref_id as section_key for participant records
  const getSectionKey = (el: ActivityFormElement): string => {
    return el.ref_id || el.type;
  };

  const saveMutation = useMutation({
    mutationFn: (records: { participant_type: string; participant_id: string; section_key: string; status?: string; meta?: Record<string, unknown> }[]) =>
      activityApi.saveParticipants(id, records),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["participants", id] });
      setEditingSections(false);
      toast.success("Participants saved");
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "Failed to save participants");
    },
  });

  const updateDetailsMutation = useMutation({
    mutationFn: (data: { start_date?: string; end_date?: string; notes?: string; meta?: Record<string, unknown> }) =>
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
      router.push("/activities");
    },
    onError: () => toast.error("Failed to delete activity"),
  });

  const openDetailEditing = () => {
    if (!activity) return;
    setDetailFormData({
      title: activity.title || "",
      start_date: activity.start_date,
      end_date: activity.end_date || "",
      notes: activity.notes || "",
    });
    setDetailMetaValues(activity.meta || {});
    setEditingDetails(true);
  };

  const handleDetailSave = () => {
    const payload: Record<string, unknown> = {
      title: detailFormData.title || undefined,
      start_date: detailFormData.start_date,
      end_date: detailFormData.end_date || undefined,
      notes: detailFormData.notes || undefined,
    };
    if (activityTypeFields.length > 0) {
      payload.meta = detailMetaValues;
    }
    updateDetailsMutation.mutate(payload as Parameters<typeof updateDetailsMutation.mutate>[0]);
  };

  const handleDelete = () => {
    if (confirm("Delete this activity? This cannot be undone.")) {
      deleteMutation.mutate();
    }
  };

  const openEditing = () => {
    const state: typeof participantState = {};
    for (const el of entityTypeElements) {
      const sectionKey = getSectionKey(el);
      const sectionParticipants = participants.filter((p) => p.section_key === sectionKey);
      state[sectionKey] = sectionParticipants.map((p) => ({
        participant_id: p.participant_id,
        participant_type: p.participant_type,
        status: p.status || undefined,
        meta: p.meta || undefined,
      }));
    }
    setParticipantState(state);
    setEditingSections(true);
  };

  const handleSave = () => {
    // Validate required sections have at least one participant
    for (const el of entityTypeElements) {
      if (el.required) {
        const sectionKey = getSectionKey(el);
        const sectionState = participantState[sectionKey] || [];
        if (sectionState.length === 0) {
          toast.error(`${getElementLabel(el)} is required — add at least one participant`);
          return;
        }
      }
    }

    // Validate required meta fields for each participant
    for (const el of entityTypeElements) {
      const sectionKey = getSectionKey(el);
      const sectionState = participantState[sectionKey] || [];
      const metaFields = getParticipationMetaFields(el);
      const requiredFields = metaFields.filter((f) => f.required);
      if (requiredFields.length > 0) {
        for (const p of sectionState) {
          const meta = p.meta || {};
          for (const f of requiredFields) {
            if (!meta[f.key]) {
              toast.error(`"${f.label}" is required for all participants`);
              return;
            }
          }
        }
      }
    }

    const records: { participant_type: string; participant_id: string; section_key: string; status?: string; meta?: Record<string, unknown> }[] = [];
    for (const el of entityTypeElements) {
      const sectionKey = getSectionKey(el);
      const sectionState = participantState[sectionKey] || [];
      for (const p of sectionState) {
        records.push({
          participant_type: p.participant_type,
          participant_id: p.participant_id,
          section_key: sectionKey,
          status: p.status,
          meta: p.meta,
        });
      }
    }
    saveMutation.mutate(records);
  };

  // Group existing participants by section_key
  const participantsBySection = useMemo(() => {
    const map: Record<string, ActivityParticipant[]> = {};
    for (const p of participants) {
      if (!map[p.section_key]) map[p.section_key] = [];
      map[p.section_key].push(p);
    }
    return map;
  }, [participants]);

  // Get label for an entity type element
  const getElementLabel = (el: ActivityFormElement): string => {
    if (el.ref_id === "user") return "Users (staff)";
    const et = entityTypes.find((t) => t.id === el.ref_id);
    return et?.name || "Participants";
  };

  // Activity meta fields: base + activity type + dimension values + type×dimension_value combos
  const activityTypeFields = useMemo((): MetaFieldDefinition[] => {
    const dvIds = (activity?.dimensions || []).map((d) => d.value_id);
    return collectActivityFields(allMetaSchemas, activityTypeId || null, dvIds);
  }, [activityTypeId, activity, allMetaSchemas]);

  if (isLoading) return <PageLayout><PageContent><p>Loading...</p></PageContent></PageLayout>;
  if (!activity) return <PageLayout><PageContent><p>Not found</p></PageContent></PageLayout>;

  const activityTitle = activity.title || (activity.dimensions.length > 0 ? activity.dimensions[0].value_name : "Activity");

  return (
    <PageLayout>
      {/* Header */}
      <PageHeader
        title={activityTitle}
        description={activity.activity_type_name || undefined}
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

      <PageContent className="space-y-4">
      {/* Details Card */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Details</CardTitle>
          {!editingDetails && (
            <Can permission="activity:create">
              <Button size="sm" variant="outline" onClick={openDetailEditing}>
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Edit
              </Button>
            </Can>
          )}
        </CardHeader>
        <CardContent>
          {editingDetails ? (
            <form onSubmit={(e) => { e.preventDefault(); handleDetailSave(); }} className="space-y-3">
              {detailElements.map((el) => {
                if (el.type === "default" && el.ref_id === "title") {
                  const titleConfig = el.config || { mode: "free_text" };
                  const titleMode = (titleConfig.mode as string) || "free_text";
                  // Generated titles are resolved server-side — nothing to edit
                  if (titleMode === "generated") return null;
                  return (
                    <div key="edit-title">
                      <label className="text-sm font-medium">
                        Title{el.required && <span className="text-red-500 ml-0.5">*</span>}
                      </label>
                      <Input
                        placeholder="Activity title..."
                        value={detailFormData.title}
                        onChange={(e) => setDetailFormData({ ...detailFormData, title: e.target.value })}
                        required={el.required}
                        className="mt-1"
                      />
                    </div>
                  );
                }
                if (el.type === "default" && el.ref_id === "start_date") {
                  return (
                    <div key="edit-start_date">
                      <label className="text-sm font-medium">
                        Start Date{el.required && <span className="text-red-500 ml-0.5">*</span>}
                      </label>
                      <DateTimeInput
                        value={detailFormData.start_date}
                        onChange={(value) => setDetailFormData({ ...detailFormData, start_date: value })}
                        required={el.required}
                        className="mt-1"
                      />
                    </div>
                  );
                }
                if (el.type === "default" && el.ref_id === "end_date") {
                  return (
                    <div key="edit-end_date">
                      <label className="text-sm font-medium">
                        End Date{el.required && <span className="text-red-500 ml-0.5">*</span>}
                      </label>
                      <DateTimeInput
                        value={detailFormData.end_date}
                        onChange={(value) => setDetailFormData({ ...detailFormData, end_date: value })}
                        min={detailFormData.start_date}
                        required={el.required}
                        className="mt-1"
                      />
                    </div>
                  );
                }
                if (el.type === "default" && el.ref_id === "notes") {
                  return (
                    <div key="edit-notes">
                      <label className="text-sm font-medium">
                        Notes{el.required && <span className="text-red-500 ml-0.5">*</span>}
                      </label>
                      <Input
                        placeholder="Notes..."
                        value={detailFormData.notes}
                        onChange={(e) => setDetailFormData({ ...detailFormData, notes: e.target.value })}
                        required={el.required}
                      />
                    </div>
                  );
                }
                if (el.type === "activity_meta") {
                  return (
                    <div key="edit-activity_meta">
                      <DynamicMetaForm
                        fields={activityTypeFields}
                        values={detailMetaValues}
                        onChange={setDetailMetaValues}
                      />
                    </div>
                  );
                }
                return null;
              })}
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
            <div className="space-y-3">
              {detailElements.map((el) => {
                // Title element
                if (el.type === "default" && el.ref_id === "title") {
                  return (
                    <div key="title" className="flex items-center gap-2">
                      <Type className="h-4 w-4 text-gray-400 shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500">Title</p>
                        {activity.title ? (
                          <p className="text-sm font-medium">{activity.title}</p>
                        ) : (
                          <p className="text-sm text-gray-300 italic">Not set</p>
                        )}
                      </div>
                    </div>
                  );
                }

                // Dimension elements
                if (el.type === "dimension") {
                  // Map form element ref_id (dimension UUID) to the dimension's key
                  const dimDef = dimensions.find((d) => d.id === el.ref_id);
                  const dimInfo = dimDef
                    ? activity.dimensions.find((d) => d.dimension_key === dimDef.key)
                    : undefined;
                  return (
                    <div key={`dim-${el.ref_id}`}>
                      <p className="text-xs text-gray-500">{dimInfo?.dimension_name || dimDef?.name || el.ref_id}</p>
                      {dimInfo ? (
                        <p className="text-sm font-medium">{dimInfo.value_name}</p>
                      ) : (
                        <p className="text-sm text-gray-300 italic">Not set</p>
                      )}
                    </div>
                  );
                }

                // Start Date
                if (el.type === "default" && el.ref_id === "start_date") {
                  return (
                    <div key="start_date" className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500">Start Date</p>
                        <p className="text-sm font-medium">
                          {formatDateTime(activity.start_date)}
                        </p>
                      </div>
                    </div>
                  );
                }

                // End Date
                if (el.type === "default" && el.ref_id === "end_date") {
                  if (!activity.end_date) return null;
                  return (
                    <div key="end_date" className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500">End Date</p>
                        <p className="text-sm font-medium">
                          {formatDateTime(activity.end_date)}
                        </p>
                      </div>
                    </div>
                  );
                }

                // Notes
                if (el.type === "default" && el.ref_id === "notes") {
                  return (
                    <div key="notes" className="flex items-start gap-2">
                      <FileText className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-500">Notes</p>
                        {activity.notes ? (
                          <p className="text-sm">{activity.notes}</p>
                        ) : (
                          <p className="text-sm text-gray-300 italic">Not set</p>
                        )}
                      </div>
                    </div>
                  );
                }

                // Activity meta fields
                if (el.type === "activity_meta" && activityTypeFields.length > 0) {
                  return (
                    <div key="activity_meta">
                      <hr className="border-gray-100 mb-3" />
                      <MetaFieldDisplay
                        fields={activityTypeFields}
                        values={activity.meta}
                        showEmpty
                      />
                    </div>
                  );
                }

                return null;
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Participant sections from form builder */}
      {entityTypeElements.length > 0 ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-500" />
              Participants
            </CardTitle>
            <Can permission="activity:create">
              {!editingSections && (
                <Button size="sm" variant="outline" onClick={openEditing}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Edit
                </Button>
              )}
            </Can>
          </CardHeader>
          <CardContent className="space-y-4">
            {editingSections ? (
              <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
                {entityTypeElements.map((el) => {
                  const sectionKey = getSectionKey(el);
                  const isUserSource = el.ref_id === "user";
                  const options = isUserSource
                    ? users.map((u) => ({ id: u.id, name: `${u.first_name} ${u.last_name}` }))
                    : (entitiesByType[el.ref_id || ""] || []);
                  const sectionState = participantState[sectionKey] || [];
                  const participantType = isUserSource ? "user" : "entity";
                  const metaFields = getParticipationMetaFields(el);

                  // Check element config for status capture
                  const captureStatus = el.config?.capture_status as boolean || false;
                  const statuses = (el.config?.statuses as string[]) || ["present", "absent"];
                  const defaultStatus = (el.config?.default_status as string) || statuses[0];

                  const useSearchSelect = el.display_type === "search_select";

                  return (
                    <div key={sectionKey}>
                      <h3 className="text-sm font-semibold mb-2">
                        {getElementLabel(el)}
                        {el.required && <span className="text-red-500 ml-0.5">*</span>}
                      </h3>
                      {useSearchSelect ? (
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
                          metaFields={metaFields}
                          entityTypeId={isUserSource ? null : (el.ref_id || null)}
                          entityTypeName={getElementLabel(el)}
                        />
                      ) : (
                      <div className="space-y-1 max-h-64 overflow-y-auto border rounded-md p-2">
                        {options.map((opt) => {
                          const existing = sectionState.find((s) => s.participant_id === opt.id);
                          const isSelected = !!existing;

                          return (
                            <div key={opt.id} className="border-b last:border-0 pb-2 mb-2 last:pb-0 last:mb-0">
                              <div className="flex items-center justify-between gap-2 text-sm">
                                <label className="flex items-center gap-2 flex-1">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      const newState = [...sectionState];
                                      if (e.target.checked) {
                                        newState.push({
                                          participant_id: opt.id,
                                          participant_type: participantType,
                                          status: captureStatus ? defaultStatus : undefined,
                                          meta: {},
                                        });
                                      } else {
                                        const idx = newState.findIndex((s) => s.participant_id === opt.id);
                                        if (idx >= 0) newState.splice(idx, 1);
                                      }
                                      setParticipantState({ ...participantState, [sectionKey]: newState });
                                    }}
                                  />
                                  {opt.name}
                                </label>
                                {captureStatus && isSelected && (
                                  <select
                                    className="border rounded px-2 py-0.5 text-xs"
                                    value={existing?.status || ""}
                                    onChange={(e) => {
                                      const newState = sectionState.map((s) =>
                                        s.participant_id === opt.id
                                          ? { ...s, status: e.target.value }
                                          : s
                                      );
                                      setParticipantState({ ...participantState, [sectionKey]: newState });
                                    }}
                                  >
                                    {statuses.map((st) => (
                                      <option key={st} value={st}>{st}</option>
                                    ))}
                                  </select>
                                )}
                              </div>

                              {/* Participation meta fields per participant */}
                              {isSelected && metaFields.length > 0 && (
                                <div className="ml-6 mt-2">
                                  <DynamicMetaForm
                                    fields={metaFields}
                                    values={existing?.meta || {}}
                                    onChange={(newMeta) => {
                                      const newState = sectionState.map((s) =>
                                        s.participant_id === opt.id
                                          ? { ...s, meta: newMeta }
                                          : s
                                      );
                                      setParticipantState({ ...participantState, [sectionKey]: newState });
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      )}
                    </div>
                  );
                })}
                <div className="flex gap-2 pt-2">
                  <Button type="submit" disabled={saveMutation.isPending}>
                    Save
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setEditingSections(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              entityTypeElements.map((el) => {
                const sectionKey = getSectionKey(el);
                const sectionParticipants = participantsBySection[sectionKey] || [];
                const metaFields = getParticipationMetaFields(el);
                const captureStatus = el.config?.capture_status as boolean || false;
                const hasStatus = captureStatus || sectionParticipants.some((p) => p.status);
                const useTable = hasStatus || metaFields.length > 0;

                return (
                  <div key={sectionKey}>
                    <h3 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
                      {getElementLabel(el)}
                      {el.required && <span className="text-red-500 ml-0.5">*</span>}
                      <Badge variant="secondary" className="text-xs font-normal ml-1">
                        {sectionParticipants.length}
                      </Badge>
                    </h3>
                    {sectionParticipants.length === 0 ? (
                      <p className="text-gray-400 text-xs italic py-2">No participants added yet</p>
                    ) : useTable ? (
                      <div className="border rounded-md overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium">Name</th>
                              {hasStatus && (
                                <th className="text-left px-3 py-2 font-medium">Status</th>
                              )}
                              {metaFields.map((f) => (
                                <th key={f.key} className="text-left px-3 py-2 font-medium">{f.label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sectionParticipants.map((p) => (
                              <tr key={p.id} className="border-b last:border-0">
                                <td className="px-3 py-2">{p.participant_name || p.participant_id}</td>
                                {hasStatus && (
                                  <td className="px-3 py-2">
                                    {p.status && (
                                      <Badge variant={p.status === "present" ? "default" : "secondary"}>
                                        {p.status}
                                      </Badge>
                                    )}
                                  </td>
                                )}
                                {metaFields.map((f) => {
                                  const val = p.meta?.[f.key];
                                  return (
                                    <td key={f.key} className="px-3 py-2 text-gray-700">
                                      {val === undefined || val === null || val === ""
                                        ? "—"
                                        : f.type === "boolean"
                                          ? (val ? "Yes" : "No")
                                          : Array.isArray(val)
                                            ? val.join(", ")
                                            : String(val)}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {sectionParticipants.map((p) => (
                          <Badge key={p.id} variant="outline" className="text-sm font-normal py-1 px-2">
                            {p.participant_name || p.participant_id}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      ) : (
        /* No form config — show flat participant list */
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-500" />
              Participants
            </CardTitle>
          </CardHeader>
          <CardContent>
            {participants.length === 0 ? (
              <p className="text-gray-400 text-sm italic">No participants recorded</p>
            ) : (
              <div className="space-y-1">
                {participants.map((p) => (
                  <div
                    key={p.id}
                    className="flex justify-between items-center p-2 border rounded text-sm"
                  >
                    <span>{p.participant_name || p.participant_id}</span>
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
      </PageContent>
    </PageLayout>
  );
}
