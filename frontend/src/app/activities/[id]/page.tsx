"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  activityApi,
  activityCategoryApi,
  activityTypeApi,
  entityApi,
  entityTypeApi,
  userApi,
} from "@/services/api";
import { ActivityParticipant } from "@/types";
import { Can } from "@/components/Auth/Permissions";
import { useVocabulary } from "@/hooks/useVocabulary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageLayout } from "@/components/ui/page-layout";
import toast from "react-hot-toast";

interface SectionConfig {
  key: string;
  label: string;
  participant_source: string; // "entity_type:{id}" or "user"
  selection_mode: string; // "multi_select" | "enrolled_checklist" | "single_select"
  capture_status?: boolean;
  statuses?: string[];
  default_status?: string;
}

export default function ActivityDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const queryClient = useQueryClient();
  const { v } = useVocabulary();
  const [editingSections, setEditingSections] = useState(false);
  const [participantState, setParticipantState] = useState<
    Record<string, { participant_id: string; participant_type: string; status?: string }[]>
  >({});

  const { data: activity, isLoading } = useQuery({
    queryKey: ["activity", id],
    queryFn: () => activityApi.get(id),
  });

  const { data: participants = [] } = useQuery({
    queryKey: ["participants", id],
    queryFn: () => activityApi.getParticipants(id),
  });

  const { data: activityTypes = [] } = useQuery({
    queryKey: ["activity-types"],
    queryFn: () => activityTypeApi.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["activity-categories"],
    queryFn: activityCategoryApi.list,
  });

  const { data: entityTypes = [] } = useQuery({
    queryKey: ["entity-types"],
    queryFn: entityTypeApi.list,
  });

  // Resolve the activity's category sections config
  const sections: SectionConfig[] = useMemo(() => {
    if (!activity) return [];
    const at = activityTypes.find((t) => t.id === activity.activity_type_id);
    if (!at?.category_id) return [];
    const cat = categories.find((c) => c.id === at.category_id);
    return (cat?.sections as SectionConfig[]) || [];
  }, [activity, activityTypes, categories]);

  // Load entities/users for each section's participant source
  const entitySourceIds = useMemo(() => {
    return sections
      .filter((s) => s.participant_source.startsWith("entity_type:"))
      .map((s) => s.participant_source.split(":")[1]);
  }, [sections]);

  const hasUserSection = sections.some((s) => s.participant_source === "user");

  // Map entity type IDs from participant_source (already UUIDs)
  const entityTypeIdMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const id of entitySourceIds) {
      map[id] = id;
    }
    return map;
  }, [entitySourceIds]);

  // Load entities for each entity type
  const { data: entitiesByType = {} } = useQuery({
    queryKey: ["entities-for-sections", Object.values(entityTypeIdMap).join(",")],
    queryFn: async () => {
      const result: Record<string, { id: string; name: string }[]> = {};
      for (const [key, typeId] of Object.entries(entityTypeIdMap)) {
        const entities = await entityApi.list(typeId);
        result[key] = entities.map((e) => ({ id: e.id, name: e.name }));
      }
      return result;
    },
    enabled: Object.keys(entityTypeIdMap).length > 0,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: userApi.list,
    enabled: hasUserSection,
  });

  const saveMutation = useMutation({
    mutationFn: (records: { participant_type: string; participant_id: string; section_key: string; status?: string }[]) =>
      activityApi.saveParticipants(id, records),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["participants", id] });
      setEditingSections(false);
      toast.success("Participants saved");
    },
    onError: () => toast.error("Failed to save participants"),
  });

  const openEditing = () => {
    // Initialize state from existing participants
    const state: typeof participantState = {};
    for (const section of sections) {
      const sectionParticipants = participants.filter((p) => p.section_key === section.key);
      state[section.key] = sectionParticipants.map((p) => ({
        participant_id: p.participant_id,
        participant_type: p.participant_type,
        status: p.status || undefined,
      }));
    }
    setParticipantState(state);
    setEditingSections(true);
  };

  const handleSave = () => {
    const records: { participant_type: string; participant_id: string; section_key: string; status?: string }[] = [];
    for (const section of sections) {
      const sectionState = participantState[section.key] || [];
      for (const p of sectionState) {
        records.push({
          participant_type: p.participant_type,
          participant_id: p.participant_id,
          section_key: section.key,
          status: p.status,
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

  if (isLoading) return <PageLayout className="p-4"><p>Loading...</p></PageLayout>;
  if (!activity) return <PageLayout className="p-4"><p>Not found</p></PageLayout>;

  return (
    <PageLayout className="p-4">
      <h1 className="text-2xl font-bold mb-1">{activity.type_name}</h1>
      <div className="flex gap-1 mb-1 flex-wrap">
        {activity.tags
          .filter((tag) => tag.dimension_key !== "activity_type")
          .map((tag) => (
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

      {/* Participant sections */}
      {sections.length > 0 ? (
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
                {sections.map((section) => {
                  const sourceKey = section.participant_source.startsWith("entity_type:")
                    ? section.participant_source.split(":")[1]
                    : null;
                  const isUserSource = section.participant_source === "user";
                  const options = isUserSource
                    ? users.map((u) => ({ id: u.id, name: `${u.first_name} ${u.last_name}` }))
                    : (entitiesByType[sourceKey || ""] || []);
                  const sectionState = participantState[section.key] || [];
                  const participantType = isUserSource ? "user" : "entity";

                  return (
                    <div key={section.key}>
                      <h3 className="text-sm font-semibold mb-2">{section.label}</h3>
                      <div className="space-y-1 max-h-48 overflow-y-auto border rounded-md p-2">
                        {options.map((opt) => {
                          const existing = sectionState.find((s) => s.participant_id === opt.id);
                          const isSelected = !!existing;

                          return (
                            <div key={opt.id} className="flex items-center justify-between gap-2 text-sm py-1">
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
                                        status: section.default_status || undefined,
                                      });
                                    } else {
                                      const idx = newState.findIndex((s) => s.participant_id === opt.id);
                                      if (idx >= 0) newState.splice(idx, 1);
                                    }
                                    setParticipantState({ ...participantState, [section.key]: newState });
                                  }}
                                />
                                {opt.name}
                              </label>
                              {section.capture_status && isSelected && section.statuses && (
                                <select
                                  className="border rounded px-2 py-0.5 text-xs"
                                  value={existing?.status || ""}
                                  onChange={(e) => {
                                    const newState = sectionState.map((s) =>
                                      s.participant_id === opt.id
                                        ? { ...s, status: e.target.value }
                                        : s
                                    );
                                    setParticipantState({ ...participantState, [section.key]: newState });
                                  }}
                                >
                                  {section.statuses.map((st) => (
                                    <option key={st} value={st}>{st}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          );
                        })}
                      </div>
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
              sections.map((section) => {
                const sectionParticipants = participantsBySection[section.key] || [];
                return (
                  <div key={section.key}>
                    <h3 className="text-sm font-semibold mb-1">{section.label}</h3>
                    {sectionParticipants.length === 0 ? (
                      <p className="text-gray-500 text-xs">None recorded</p>
                    ) : (
                      <div className="space-y-1">
                        {sectionParticipants.map((p) => (
                          <div
                            key={p.id}
                            className="flex justify-between items-center p-2 border rounded text-sm"
                          >
                            <span>{p.participant_name || p.participant_id}</span>
                            {p.status && (
                              <Badge
                                variant={p.status === "present" ? "default" : "secondary"}
                              >
                                {p.status}
                              </Badge>
                            )}
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
        /* No sections config — show flat participant list */
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
