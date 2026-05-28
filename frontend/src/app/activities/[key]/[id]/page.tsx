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
import { ParticipantPicker } from "@/components/ParticipantPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageLayout } from "@/components/ui/page-layout";
import { PageContent } from "@/components/ui/page-content";
import { PageHeader } from "@/components/ui/page-header";
import { Search, Trash2, Pencil, Users, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import toast from "react-hot-toast";

export default function ActivityDetailPage() {
  const { key: typeKey, id } = useParams<{ key: string; id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Phase 3.1: one section at a time. The section_key being edited, or null.
  const [editingSection, setEditingSection] = useState<string | null>(null);
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
      && (!f.stage || f.stage === "both" || f.stage === "edit")
    );
  }, [allFields]);

  // Field keys not editable on the edit stage (create-only fields)
  const editDisabledKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const f of allFields) {
      if (f.stage && f.stage !== "both" && f.stage !== "edit") {
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

  const saveSectionMutation = useMutation({
    mutationFn: (args: {
      sectionKey: string;
      records: { participant_type: string; participant_id: string; status?: string; meta?: Record<string, unknown> }[];
    }) => activityApi.replaceSectionParticipants(id, args.sectionKey, args.records),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["participants", id] });
      setEditingSection(null);
      toast.success("Saved");
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "Failed to save");
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

  const openSectionEditing = (sectionKey: string) => {
    const sectionParticipants = participants.filter((p) => p.section_key === sectionKey);
    setParticipantState({
      ...participantState,
      [sectionKey]: sectionParticipants.map((p) => ({
        participant_id: p.participant_id,
        participant_type: p.participant_type,
        status: p.status || undefined,
        meta: p.meta || undefined,
      })),
    });
    setEditingSection(sectionKey);
  };

  const handleSectionSave = (field: MetaFieldDefinition) => {
    const sectionKey = getSectionKey(field);
    const sectionState = participantState[sectionKey] || [];

    if (field.required && sectionState.length === 0) {
      toast.error(
        `${getFieldLabel(field)} is required — add at least one participant`,
      );
      return;
    }

    const metaFields = getParticipationMetaFields(field);
    const requiredFields = metaFields.filter((f) => f.required);
    for (const p of sectionState) {
      const meta = p.meta || {};
      for (const f of requiredFields) {
        if (!meta[f.key]) {
          toast.error(`"${f.label}" is required for all participants`);
          return;
        }
      }
    }

    saveSectionMutation.mutate({
      sectionKey,
      records: sectionState.map((p) => ({
        participant_type: p.participant_type,
        participant_id: p.participant_id,
        status: p.status,
        meta: p.meta,
      })),
    });
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
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-500" />
              Participants
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {participantListFields.map((field) => {
                const sectionKey = getSectionKey(field);
                const sectionParticipants = participantsBySection[sectionKey] || [];
                const metaFields = getParticipationMetaFields(field);
                const captureStatus = field.config?.capture_status as boolean || false;
                const hasStatus = captureStatus || sectionParticipants.some((p) => p.status);
                const useTable = hasStatus || metaFields.length > 0;

                // Phase 3 picker — shown for every entity_list / user_list
                // section. Mode is derived per-section: Smart for
                // enrollable entity types on a dimensioned activity,
                // Basic for the rest.
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
                  <div key={sectionKey}>
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm font-semibold flex items-center gap-1.5">
                        {getFieldLabel(field)}
                        {field.required && <span className="text-red-500 ml-0.5">*</span>}
                        <Badge variant="secondary" className="text-xs font-normal ml-1">
                          {sectionParticipants.length}
                        </Badge>
                      </h3>
                      <div className="flex items-center gap-2">
                        {/* Picker hidden while any section is in edit mode
                            (v1). Shown for every entity_list / user_list
                            section — only Smart mode requires the entity
                            type + activity-dims combo. */}
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
                              alreadyAdded={alreadyAdded}
                              onAdded={() => {
                                queryClient.invalidateQueries({
                                  queryKey: ["participants", id],
                                });
                                queryClient.invalidateQueries({
                                  queryKey: ["entities-for-sections"],
                                });
                              }}
                            />
                          </Can>
                        )}
                        {/* Per-section Edit button — only when there's something
                            to edit, no other section is mid-edit, and this
                            section isn't currently editing. */}
                        {sectionParticipants.length > 0 &&
                          !anySectionEditing && (
                            <Can permission="activity:create">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openSectionEditing(sectionKey)}
                              >
                                <Pencil className="h-3.5 w-3.5 mr-1" />
                                Edit
                              </Button>
                            </Can>
                          )}
                      </div>
                    </div>
                    {isEditingThisSection ? (
                      <SectionEditMode
                        field={field}
                        sectionKey={sectionKey}
                        metaFields={metaFields}
                        rows={participantState[sectionKey] || []}
                        onRowsChange={(rows) =>
                          setParticipantState({ ...participantState, [sectionKey]: rows })
                        }
                        getNameFor={(participantId) => {
                          const p = sectionParticipants.find(
                            (x) => x.participant_id === participantId,
                          );
                          return p ? getParticipantName(p) : participantId;
                        }}
                        onSave={() => handleSectionSave(field)}
                        onCancel={() => setEditingSection(null)}
                        saving={saveSectionMutation.isPending}
                      />
                    ) : sectionParticipants.length === 0 ? (
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
              })}
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

interface SectionRow {
  participant_id: string;
  participant_type: string;
  status?: string;
  meta?: Record<string, unknown>;
}

/** Phase 3.1 per-section edit mode. Renders the existing rows (no
 *  add affordance — that's the picker's job) with editable status +
 *  meta cells + ✕ remove. Save calls the section-scoped endpoint. */
function SectionEditMode({
  field,
  metaFields,
  rows,
  onRowsChange,
  getNameFor,
  onSave,
  onCancel,
  saving,
}: {
  field: MetaFieldDefinition;
  sectionKey: string;
  metaFields: MetaFieldDefinition[];
  rows: SectionRow[];
  onRowsChange: (rows: SectionRow[]) => void;
  getNameFor: (participantId: string) => string;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [search, setSearch] = useState("");
  const captureStatus = (field.config?.capture_status as boolean) || false;
  const statuses = (field.config?.statuses as string[]) || ["present", "absent"];

  const normalize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const needle = normalize(search);
    return rows.filter((r) => normalize(getNameFor(r.participant_id)).includes(needle));
  }, [rows, search, getNameFor]);

  const updateRow = (participantId: string, patch: Partial<SectionRow>) => {
    onRowsChange(
      rows.map((r) =>
        r.participant_id === participantId ? { ...r, ...patch } : r,
      ),
    );
  };
  const removeRow = (participantId: string) => {
    onRowsChange(rows.filter((r) => r.participant_id !== participantId));
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      className="space-y-3"
    >
      {rows.length > 5 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-gray-400 text-xs italic py-2">
          No participants in this section. Cancel and use {`"+`} {field.label}{`"`} to add.
        </p>
      ) : filteredRows.length === 0 ? (
        <p className="text-gray-400 text-xs italic py-2">No matches.</p>
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="w-8" />
                <th className="text-left px-3 py-2 font-medium">Name</th>
                {captureStatus && (
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                )}
                {metaFields.map((f) => (
                  <th key={f.key} className="text-left px-3 py-2 font-medium">
                    {f.label}
                    {f.required && <span className="text-red-500 ml-0.5">*</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.participant_id} className="border-b last:border-0">
                  <td className="px-2 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(r.participant_id)}
                      className="text-gray-400 hover:text-red-500"
                      title="Remove"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </td>
                  <td className="px-3 py-2">{getNameFor(r.participant_id)}</td>
                  {captureStatus && (
                    <td className="px-3 py-2">
                      <select
                        className="border rounded px-2 py-1 text-xs"
                        value={r.status || ""}
                        onChange={(e) =>
                          updateRow(r.participant_id, { status: e.target.value })
                        }
                      >
                        <option value=""></option>
                        {statuses.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                  {metaFields.map((f) => (
                    <td key={f.key} className="px-3 py-2">
                      <DynamicMetaForm
                        fields={[f]}
                        values={r.meta || {}}
                        onChange={(newMeta) =>
                          updateRow(r.participant_id, { meta: newMeta })
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={saving}>
          Save
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
