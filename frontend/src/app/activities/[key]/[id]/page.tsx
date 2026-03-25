"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
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
import { Can } from "@/components/Auth/Permissions";

import { DynamicMetaForm } from "@/components/DynamicMetaForm";
import { SearchSelectParticipants } from "@/components/SearchSelectParticipants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageLayout } from "@/components/ui/page-layout";
import { PageContent } from "@/components/ui/page-content";
import { PageHeader } from "@/components/ui/page-header";
import { Trash2, Pencil, Users } from "lucide-react";
import toast from "react-hot-toast";

export default function ActivityDetailPage() {
  const { key: typeKey, id } = useParams<{ key: string; id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [editingSections, setEditingSections] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
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
      && (!f.stage || f.stage === "both" || f.stage === "record")
    );
  }, [allFields]);

  // Field keys not editable on the edit/record stage (create-only fields)
  const editDisabledKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const f of allFields) {
      if (f.stage && f.stage !== "both" && f.stage !== "record") {
        keys.add(f.key);
      }
    }
    return keys;
  }, [allFields]);

  // Entity type source IDs for loading entity options
  const entitySourceIds = useMemo(() => {
    return participantListFields
      .filter((f) => f.type === "entity_list" && f.entity_type_id)
      .map((f) => f.entity_type_id!);
  }, [participantListFields]);

  const hasUserSection = participantListFields.some((f) => f.type === "user_list");

  const { data: entitiesByType = {} } = useQuery({
    queryKey: ["entities-for-sections", entitySourceIds.join(",")],
    queryFn: async () => {
      const result: Record<string, { id: string; name: string }[]> = {};
      for (const typeId of entitySourceIds) {
        const [entities, columns] = await Promise.all([
          entityApi.list(typeId),
          listConfigApi.get(`entity:${typeId}`),
        ]);
        // Use first visible column to derive display name
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
    setDetailMetaValues(activity.meta || {});
    setEditingDetails(true);
  };

  const handleDetailSave = () => {
    updateDetailsMutation.mutate({ meta: detailMetaValues });
  };

  const handleDelete = () => {
    if (confirm("Delete this activity? This cannot be undone.")) {
      deleteMutation.mutate();
    }
  };

  const openEditing = () => {
    const state: typeof participantState = {};
    for (const field of participantListFields) {
      const sectionKey = getSectionKey(field);
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
    // Validate required sections
    for (const field of participantListFields) {
      if (field.required) {
        const sectionKey = getSectionKey(field);
        const sectionState = participantState[sectionKey] || [];
        if (sectionState.length === 0) {
          toast.error(`${getFieldLabel(field)} is required — add at least one participant`);
          return;
        }
      }
    }

    // Validate required meta fields per participant
    for (const field of participantListFields) {
      const sectionKey = getSectionKey(field);
      const sectionState = participantState[sectionKey] || [];
      const metaFields = getParticipationMetaFields(field);
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
    for (const field of participantListFields) {
      const sectionKey = getSectionKey(field);
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

  const participantsBySection = useMemo(() => {
    const map: Record<string, ActivityParticipant[]> = {};
    for (const p of participants) {
      if (!map[p.section_key]) map[p.section_key] = [];
      map[p.section_key].push(p);
    }
    return map;
  }, [participants]);

  const getFieldLabel = (field: MetaFieldDefinition): string => {
    if (field.type === "user_list") return "Users (staff)";
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

  if (isLoading) return <PageLayout><PageContent><p>Loading...</p></PageContent></PageLayout>;
  if (!activity) return <PageLayout><PageContent><p>Not found</p></PageContent></PageLayout>;

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
              {detailFields.map((field) => {
                if (field.type === "dimension") {
                  const dimId = field.dimension_id;
                  const dimInfo = activity.dimensions.find(
                    (d) => dimensions.find((dim) => dim.id === dimId)?.key === d.dimension_key
                  );
                  const dimObj = dimensions.find((d) => d.id === dimId);
                  return (
                    <div key={`edit-dim-${field.key}`} className="flex items-center gap-2">
                      <div>
                        <p className="text-xs text-gray-500">{dimObj?.name || field.label}</p>
                        <p className="text-sm font-medium">{dimInfo?.value_name || "—"}</p>
                      </div>
                    </div>
                  );
                }

                // Title with generated mode: skip
                if (field.key === "title") {
                  const titleConfig = field.config || { mode: "free_text" };
                  if ((titleConfig.mode as string) === "generated") return null;
                }

                return (
                  <div key={`edit-field-${field.key}`}>
                    <DynamicMetaForm
                      fields={[field]}
                      values={detailMetaValues}
                      onChange={setDetailMetaValues}
                      disabledKeys={editDisabledKeys}
                    />
                  </div>
                );
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
              {detailFields.map((field) => {
                if (field.type === "dimension") {
                  const dimDef = dimensions.find((d) => d.id === field.dimension_id);
                  const dimInfo = dimDef
                    ? activity.dimensions.find((d) => d.dimension_key === dimDef.key)
                    : undefined;
                  return (
                    <div key={`dim-${field.key}`}>
                      <p className="text-xs text-gray-500">{dimInfo?.dimension_name || dimDef?.name || field.label}</p>
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
                return (
                  <div key={`view-field-${field.key}`}>
                    <p className="text-xs text-gray-500">{field.label}</p>
                    <p className={`text-sm ${isEmpty ? "text-gray-300 italic" : "font-medium"}`}>
                      {isEmpty
                        ? "Not set"
                        : field.type === "boolean"
                          ? val ? "Yes" : "No"
                          : field.type === "date" && typeof val === "string"
                            ? formatDate(val)
                            : field.type === "datetime" && typeof val === "string"
                              ? formatDateTime(val)
                              : Array.isArray(val)
                                ? val.join(", ")
                                : String(val)}
                    </p>
                  </div>
                );
              })}
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
          )}
        </CardContent>
      </Card>

      {/* Participant sections */}
      {participantListFields.length > 0 ? (
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
                {participantListFields.map((field) => {
                  const sectionKey = getSectionKey(field);
                  const isUserSource = field.type === "user_list";
                  const options = isUserSource
                    ? users.map((u) => ({ id: u.id, name: `${u.first_name} ${u.last_name}` }))
                    : (entitiesByType[field.entity_type_id || ""] || []);
                  const sectionState = participantState[sectionKey] || [];
                  const participantType = isUserSource ? "user" : "entity";
                  const metaFields = getParticipationMetaFields(field);

                  const captureStatus = field.config?.capture_status as boolean || false;
                  const statuses = (field.config?.statuses as string[]) || ["present", "absent"];
                  const defaultStatus = (field.config?.default_status as string) || statuses[0];

                  const useSearchSelect = field.display_type === "search_select";

                  return (
                    <div key={sectionKey}>
                      <h3 className="text-sm font-semibold mb-2">
                        {getFieldLabel(field)}
                        {field.required && <span className="text-red-500 ml-0.5">*</span>}
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
                          entityTypeId={isUserSource ? null : (field.entity_type_id || null)}
                          entityTypeName={getFieldLabel(field)}
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
              participantListFields.map((field) => {
                const sectionKey = getSectionKey(field);
                const sectionParticipants = participantsBySection[sectionKey] || [];
                const metaFields = getParticipationMetaFields(field);
                const captureStatus = field.config?.capture_status as boolean || false;
                const hasStatus = captureStatus || sectionParticipants.some((p) => p.status);
                const useTable = hasStatus || metaFields.length > 0;

                return (
                  <div key={sectionKey}>
                    <h3 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
                      {getFieldLabel(field)}
                      {field.required && <span className="text-red-500 ml-0.5">*</span>}
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
                                <td className="px-3 py-2">{getParticipantName(p)}</td>
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
                            {getParticipantName(p)}
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
        /* No participant fields — show flat participant list */
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
      </PageContent>
    </PageLayout>
  );
}
