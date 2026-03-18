"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  activityApi,
  activityFormApi,
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
  MetaFieldSchemas,
} from "@/types";
import { Can } from "@/components/Auth/Permissions";
import { useVocabulary } from "@/hooks/useVocabulary";
import { DynamicMetaForm, MetaFieldDisplay } from "@/components/DynamicMetaForm";
import { SearchSelectParticipants } from "@/components/SearchSelectParticipants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageLayout } from "@/components/ui/page-layout";
import { Trash2 } from "lucide-react";
import toast from "react-hot-toast";

export default function ActivityDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { v } = useVocabulary();
  const [editingSections, setEditingSections] = useState(false);
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

  const { data: allMetaSchemas = {} } = useQuery<MetaFieldSchemas>({
    queryKey: ["meta-field-schemas-all"],
    queryFn: metaFieldSchemaApi.getAll,
  });

  // Category ID comes directly from the activity
  const categoryId = activity?.category_id || "";

  // Load form builder config
  const { data: formConfig } = useQuery<ActivityForm>({
    queryKey: ["activity-form", categoryId],
    queryFn: () => activityFormApi.get(categoryId),
    enabled: !!categoryId,
  });

  // Get entity_type elements from form config (these are participant sections)
  const entityTypeElements: ActivityFormElement[] = useMemo(() => {
    if (!formConfig?.elements?.length) return [];
    return formConfig.elements
      .filter((el) => el.type === "entity_type" && el.visible)
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
    const fields: MetaFieldDefinition[] = [];

    // participant:entity:{ref_id} — all categories
    const baseKey = `participant:entity:${el.ref_id}`;
    fields.push(...(allMetaSchemas[baseKey] || []));

    // participant:entity:{ref_id}:category:{categoryId}
    if (categoryId) {
      const catKey = `${baseKey}:category:${categoryId}`;
      fields.push(...(allMetaSchemas[catKey] || []));
    }

    return fields;
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
    onError: () => toast.error("Failed to save participants"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => activityApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      toast.success(`${v("activity")} deleted`);
      router.push("/activities");
    },
    onError: () => toast.error(`Failed to delete ${v("activity").toLowerCase()}`),
  });

  const handleDelete = () => {
    if (confirm(`Delete this ${v("activity").toLowerCase()}? This cannot be undone.`)) {
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

  if (isLoading) return <PageLayout className="p-4"><p>Loading...</p></PageLayout>;
  if (!activity) return <PageLayout className="p-4"><p>Not found</p></PageLayout>;

  // Use first tag as activity title
  const activityTitle = activity.tags.length > 0 ? activity.tags[0].value_name : v("activity");

  // Activity meta fields from category
  const categoryFields = categoryId
    ? allMetaSchemas[`activity:category:${categoryId}`] || []
    : [];

  return (
    <PageLayout className="p-4">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold">{activityTitle}</h1>
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
      </div>
      <div className="flex gap-1 mb-1 flex-wrap">
        {activity.tags.slice(1).map((tag) => (
          <Badge key={tag.value_id} variant="secondary">
            {tag.dimension_name}: {tag.value_name}
          </Badge>
        ))}
      </div>
      <p className="text-gray-500 mb-4">{activity.date}</p>

      {activity.category_name && (
        <p className="text-sm text-gray-500 mb-2">Category: {activity.category_name}</p>
      )}

      {activity.notes && (
        <p className="text-sm text-gray-600 mb-4">{activity.notes}</p>
      )}

      {/* Activity meta display */}
      {activity.meta && Object.keys(activity.meta).length > 0 && categoryFields.length > 0 && (
        <Card className="mb-4">
          <CardContent className="py-3">
            <MetaFieldDisplay fields={categoryFields} values={activity.meta} />
          </CardContent>
        </Card>
      )}

      {/* Participant sections from form builder */}
      {entityTypeElements.length > 0 ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-lg">{v("participant")}s</CardTitle>
            <Can permission="activity:create">
              {!editingSections && (
                <Button size="sm" onClick={openEditing}>
                  Edit {v("participant")}s
                </Button>
              )}
            </Can>
          </CardHeader>
          <CardContent className="space-y-4">
            {editingSections ? (
              <>
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
                  <Button onClick={handleSave} disabled={saveMutation.isPending}>
                    Save
                  </Button>
                  <Button variant="outline" onClick={() => setEditingSections(false)}>
                    Cancel
                  </Button>
                </div>
              </>
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
                    <h3 className="text-sm font-semibold mb-1">
                      {getElementLabel(el)}
                      {el.required && <span className="text-red-500 ml-0.5">*</span>}
                    </h3>
                    {sectionParticipants.length === 0 ? (
                      <p className="text-gray-500 text-xs">None recorded</p>
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
                      <div className="space-y-1">
                        {sectionParticipants.map((p) => (
                          <div
                            key={p.id}
                            className="p-2 border rounded text-sm"
                          >
                            <span>{p.participant_name || p.participant_id}</span>
                          </div>
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
            <CardTitle className="text-lg">{v("participant")}s</CardTitle>
          </CardHeader>
          <CardContent>
            {participants.length === 0 ? (
              <p className="text-gray-500 text-sm">No participants recorded</p>
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
    </PageLayout>
  );
}
