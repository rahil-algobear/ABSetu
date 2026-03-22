"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  metaFieldSchemaApi,
  dimensionApi,
  entityTypeApi,
  activityTypeApi,
  MetaFieldScope,
} from "@/services/api";
import {
  MetaFieldDefinition,
  MetaFieldSchemaItem,
  MetaFieldType,
  MetaFieldStage,
  MetaFieldDisplayType,
  Dimension,
  DimensionValue,
  ActivityType,
} from "@/types";
import { findSchema } from "@/utils/meta-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { DateTimeInput } from "@/components/ui/date-time-input";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/page-table";
import { PageHeader } from "@/components/ui/page-header";
import { PageContent } from "@/components/ui/page-content";
import { Plus, Pencil, Trash2, GripVertical } from "lucide-react";
import toast from "react-hot-toast";


const FIELD_TYPES: { value: MetaFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & Time" },
  { value: "select", label: "Dropdown" },
  { value: "multiselect", label: "Multi-select" },
  { value: "boolean", label: "Yes/No" },
];

const emptyField: MetaFieldDefinition = {
  key: "",
  label: "",
  type: "text",
  required: false,
  options: [],
  visible: true,
  stage: "both",
};

type SectionKind = "entity" | "dimension" | "other" | "activity" | "participant";

interface ScopeGroup {
  schema: MetaFieldSchemaItem;
  scopeLabel: string;
}

export default function MetaFieldsPage() {
  const queryClient = useQueryClient();

  const [activeSection, setActiveSection] = useState<SectionKind>("entity");
  const [activeKey, setActiveKey] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingSchema, setEditingSchema] = useState<MetaFieldSchemaItem | null>(null);
  const [fieldForm, setFieldForm] = useState<MetaFieldDefinition>({ ...emptyField });
  const [optionsText, setOptionsText] = useState("");

  // Activity tab view filters
  const [activityFilterTypeId, setActivityFilterTypeId] = useState<string>("");
  const [activityFilterDimId, setActivityFilterDimId] = useState<string>("");
  const [activityFilterDvId, setActivityFilterDvId] = useState<string>("");

  // Participant tab
  const [participantEntityId, setParticipantEntityId] = useState<string>("");
  const [participantFilterTypeId, setParticipantFilterTypeId] = useState<string>("");
  const [participantFilterDimId, setParticipantFilterDimId] = useState<string>("");
  const [participantFilterDvId, setParticipantFilterDvId] = useState<string>("");

  // Modal scope state (for activity/participant add/edit)
  const [modalActivityTypeId, setModalActivityTypeId] = useState<string>("");
  const [modalDimId, setModalDimId] = useState<string>("");
  const [modalDvId, setModalDvId] = useState<string>("");
  const [modalEntityId, setModalEntityId] = useState<string>("");

  const { data: dimensions = [] } = useQuery<Dimension[]>({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
  });

  const { data: entityTypesList = [] } = useQuery({
    queryKey: ["entity-types"],
    queryFn: entityTypeApi.list,
  });

  const { data: activityTypes = [] } = useQuery<ActivityType[]>({
    queryKey: ["activity-types"],
    queryFn: activityTypeApi.list,
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

  const { data: allSchemas = [] } = useQuery<MetaFieldSchemaItem[]>({
    queryKey: ["meta-field-schemas"],
    queryFn: metaFieldSchemaApi.getAll,
  });

  // Current scope for entity/dimension/other tabs
  const currentScope = useMemo((): MetaFieldScope | null => {
    if (activeSection === "activity" || activeSection === "participant") return null;
    if (!activeKey) return null;
    switch (activeSection) {
      case "entity": return { type: "entity", entity_type_id: activeKey };
      case "dimension": return { type: "dimension", dimension_id: activeKey };
      case "other": return { type: activeKey };
      default: return null;
    }
  }, [activeSection, activeKey]);

  // Fields for entity/dimension/other tabs
  const fields = useMemo(() => {
    if (!currentScope) return [];
    return findSchema(allSchemas, currentScope)?.fields || [];
  }, [allSchemas, currentScope]);

  // Auto-select first ID when section changes
  const selectSection = (section: SectionKind) => {
    setActiveSection(section);
    switch (section) {
      case "entity":
        setActiveKey(entityTypesList[0]?.id || "");
        break;
      case "dimension":
        setActiveKey(dimensions[0]?.id || "");
        break;
      case "other":
        setActiveKey("enrollment");
        break;
      case "activity":
        setActivityFilterTypeId("");
        setActivityFilterDimId("");
        setActivityFilterDvId("");
        break;
      case "participant":
        setParticipantEntityId(entityTypesList[0]?.id || "user");
        setParticipantFilterTypeId("");
        setParticipantFilterDimId("");
        setParticipantFilterDvId("");
        break;
    }
  };

  // Set initial ID on first load
  useMemo(() => {
    if (!activeKey && entityTypesList.length > 0) {
      setActiveKey(entityTypesList[0].id);
    }
  }, [entityTypesList]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build a display label from activity type + dimension value IDs
  const buildScopeLabel = (atId: string, dvId: string, fallback: string): string => {
    const labels: string[] = [];
    if (atId) labels.push(activityTypes.find((a) => a.id === atId)?.name || atId);
    if (dvId) {
      const dv = allDimensionValues.find((d) => d.id === dvId);
      const dim = dv ? dimensions.find((d) => d.id === dv.dimension_id) : null;
      labels.push(dim ? `${dim.name}: ${dv!.name}` : dv?.name || dvId);
    }
    return labels.length > 0 ? labels.join(" + ") : fallback;
  };

  // --- Flat table groups for Activity tab ---
  const activityGroups = useMemo((): ScopeGroup[] => {
    const groups: ScopeGroup[] = [];
    for (const item of allSchemas) {
      if (!item.fields?.length || item.scope.type !== "activity") continue;

      const atId = item.scope.activity_type_id || "";
      const dvId = item.scope.dimension_value_id || "";
      const dimId = dvId
        ? allDimensionValues.find((d) => d.id === dvId)?.dimension_id || ""
        : "";

      // Apply view filters
      if (activityFilterTypeId && atId !== activityFilterTypeId) continue;
      if (activityFilterDimId && dimId !== activityFilterDimId) continue;
      if (activityFilterDvId && dvId !== activityFilterDvId) continue;

      groups.push({ schema: item, scopeLabel: buildScopeLabel(atId, dvId, "All activities") });
    }
    groups.sort((a, b) => {
      const aBase = !a.schema.scope.activity_type_id && !a.schema.scope.dimension_value_id;
      const bBase = !b.schema.scope.activity_type_id && !b.schema.scope.dimension_value_id;
      if (aBase && !bBase) return -1;
      if (!aBase && bBase) return 1;
      return a.scopeLabel.localeCompare(b.scopeLabel);
    });
    return groups;
  }, [allSchemas, activityFilterTypeId, activityFilterDimId, activityFilterDvId, activityTypes, allDimensionValues, dimensions]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Flat table groups for Participant tab ---
  const participantGroups = useMemo((): ScopeGroup[] => {
    if (!participantEntityId) return [];
    const groups: ScopeGroup[] = [];

    for (const item of allSchemas) {
      if (!item.fields?.length || item.scope.type !== "participant") continue;
      if ((item.scope.entity_type_id || "") !== participantEntityId) continue;

      const atId = item.scope.activity_type_id || "";
      const dvId = item.scope.dimension_value_id || "";
      const dimId = dvId
        ? allDimensionValues.find((d) => d.id === dvId)?.dimension_id || ""
        : "";

      if (participantFilterTypeId && atId !== participantFilterTypeId) continue;
      if (participantFilterDimId && dimId !== participantFilterDimId) continue;
      if (participantFilterDvId && dvId !== participantFilterDvId) continue;

      groups.push({ schema: item, scopeLabel: buildScopeLabel(atId, dvId, "All") });
    }
    groups.sort((a, b) => {
      const aBase = !a.schema.scope.activity_type_id && !a.schema.scope.dimension_value_id;
      const bBase = !b.schema.scope.activity_type_id && !b.schema.scope.dimension_value_id;
      if (aBase && !bBase) return -1;
      if (!aBase && bBase) return 1;
      return a.scopeLabel.localeCompare(b.scopeLabel);
    });
    return groups;
  }, [allSchemas, participantEntityId, participantFilterTypeId, participantFilterDimId, participantFilterDvId, activityTypes, allDimensionValues, dimensions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Participant entity pill field counts
  const participantEntityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of allSchemas) {
      if (!item.fields?.length || item.scope.type !== "participant") continue;
      const entityId = item.scope.entity_type_id || "";
      counts[entityId] = (counts[entityId] || 0) + item.fields.length;
    }
    return counts;
  }, [allSchemas]);

  // Build MetaFieldScope from modal state for activity/participant
  const buildScopeFromModal = (): MetaFieldScope => {
    if (activeSection === "activity") {
      const scope: MetaFieldScope = { type: "activity" };
      if (modalActivityTypeId) scope.activity_type_id = modalActivityTypeId;
      if (modalDvId) scope.dimension_value_id = modalDvId;
      return scope;
    }
    const scope: MetaFieldScope = { type: "participant", entity_type_id: modalEntityId };
    if (modalActivityTypeId) scope.activity_type_id = modalActivityTypeId;
    if (modalDvId) scope.dimension_value_id = modalDvId;
    return scope;
  };

  // Find the schema item matching a given scope
  const findMatchingSchema = (scope: MetaFieldScope): MetaFieldSchemaItem | undefined => {
    return findSchema(allSchemas, scope);
  };

  // Count fields for a given scope
  const countFieldsForScope = (scope: Partial<MetaFieldScope> & { type: string }): number => {
    return findSchema(allSchemas, scope)?.fields?.length || 0;
  };

  const updateMutation = useMutation({
    mutationFn: ({ scope, newFields }: { scope: MetaFieldScope; newFields: MetaFieldDefinition[] }) => {
      return metaFieldSchemaApi.update(scope, newFields);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meta-field-schemas"] });
      queryClient.invalidateQueries({ queryKey: ["entity-filters"] });
      queryClient.invalidateQueries({ queryKey: ["activity-filters"] });
      toast.success("Form fields updated");
    },
    onError: () => toast.error("Failed to update"),
  });

  const saveFields = (scope: MetaFieldScope, newFields: MetaFieldDefinition[]) => {
    updateMutation.mutate({ scope, newFields });
  };

  const openAdd = () => {
    setEditingIndex(null);
    setEditingSchema(null);
    setFieldForm({ ...emptyField });
    setOptionsText("");
    if (activeSection === "activity") {
      setModalActivityTypeId("");
      setModalDimId("");
      setModalDvId("");
    } else if (activeSection === "participant") {
      setModalEntityId(participantEntityId);
      setModalActivityTypeId("");
      setModalDimId("");
      setModalDvId("");
    }
    setModalOpen(true);
  };

  const openEdit = (index: number, schema?: MetaFieldSchemaItem) => {
    const target = schema || (currentScope ? findMatchingSchema(currentScope) : undefined);
    const f = target?.fields[index];
    if (!f) return;
    setEditingIndex(index);
    setEditingSchema(target!);
    setFieldForm({ ...f });
    setOptionsText(f.options?.join("\n") || "");

    if (activeSection === "activity" || activeSection === "participant") {
      setModalActivityTypeId(target!.scope.activity_type_id || "");
      setModalDvId(target!.scope.dimension_value_id || "");
      const dvId = target!.scope.dimension_value_id || "";
      setModalDimId(dvId ? allDimensionValues.find((d) => d.id === dvId)?.dimension_id || "" : "");
      if (activeSection === "participant") {
        setModalEntityId(target!.scope.entity_type_id || "");
      }
    }

    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingIndex(null);
    setEditingSchema(null);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const key = editingIndex !== null
      ? fieldForm.key
      : fieldForm.label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const options =
      fieldForm.type === "select" || fieldForm.type === "multiselect"
        ? optionsText.split("\n").map((o) => o.trim()).filter(Boolean)
        : undefined;

    const defaultVal = fieldForm.default != null && fieldForm.default !== "" &&
      !(Array.isArray(fieldForm.default) && fieldForm.default.length === 0)
      ? fieldForm.default
      : undefined;
    const field: MetaFieldDefinition = { ...fieldForm, key, options, default: defaultVal };

    if (activeSection === "activity" || activeSection === "participant") {
      const scope = editingIndex !== null && editingSchema
        ? editingSchema.scope
        : buildScopeFromModal();
      const existingFields = findMatchingSchema(scope)?.fields || [];
      const updated = editingIndex !== null
        ? existingFields.map((f, i) => (i === editingIndex ? field : f))
        : [...existingFields, field];
      saveFields(scope, updated);
    } else {
      if (!currentScope) return;
      const updated = editingIndex !== null
        ? fields.map((f, i) => (i === editingIndex ? field : f))
        : [...fields, field];
      saveFields(currentScope, updated);
    }
    closeModal();
  };

  const handleDelete = (index: number, schema?: MetaFieldSchemaItem) => {
    const target = schema || (currentScope ? findMatchingSchema(currentScope) : undefined);
    if (!target) return;
    if (target.fields[index]?.system) { toast.error("System fields cannot be deleted"); return; }
    if (!confirm(`Delete field "${target.fields[index]?.label}"?`)) return;
    const updated = target.fields.filter((_, i) => i !== index);
    saveFields(target.scope, updated);
  };

  const showOptions = fieldForm.type === "select" || fieldForm.type === "multiselect";

  // Selected label for entity/dimension/other header
  const selectedLabel = useMemo(() => {
    switch (activeSection) {
      case "entity": return entityTypesList.find((et) => et.id === activeKey)?.name || activeKey;
      case "dimension": return dimensions.find((d) => d.id === activeKey)?.name || activeKey;
      case "other": return "Enrollments";
      default: return "";
    }
  }, [activeSection, activeKey, entityTypesList, dimensions]);

  // Section pills
  const sections: { key: SectionKind; label: string }[] = [
    { key: "entity", label: "Entity types" },
    { key: "dimension", label: "Dimensions" },
    { key: "other", label: "Other" },
    { key: "activity", label: "Activity fields" },
    { key: "participant", label: "Participant fields" },
  ];

  // Entity type options for participant (includes "user")
  const participantEntityOptions = [
    { id: "user", name: "Users (staff)" },
    ...entityTypesList,
  ];

  const isActivityOrParticipant = activeSection === "activity" || activeSection === "participant";
  const flatGroups = activeSection === "activity" ? activityGroups : participantGroups;
  const totalFlatFields = flatGroups.reduce((sum, g) => sum + g.schema.fields.length, 0);
  const hasFilters = activeSection === "activity"
    ? !!(activityFilterTypeId || activityFilterDimId || activityFilterDvId)
    : !!(participantFilterTypeId || participantFilterDimId || participantFilterDvId);

  return (
    <>
      <PageHeader
        title="Form Fields"
        description="Define form fields for entities, dimensions, activities, and participants. Fields appear in create/edit forms and are stored as metadata."
      />
      <PageContent>
      {/* Section selector */}
      <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => selectSection(s.key)}
            className={`px-3 py-1.5 text-sm rounded-full whitespace-nowrap transition-colors ${
              activeSection === s.key
                ? "bg-purple-100 text-purple-700 font-medium"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Sub-selector based on active section */}
      <div className="mb-4">
        {activeSection === "entity" && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {entityTypesList.map((et) => (
              <button
                key={et.id}
                onClick={() => setActiveKey(et.id)}
                className={`px-3 py-1 text-sm rounded-md whitespace-nowrap transition-colors ${
                  activeKey === et.id
                    ? "bg-purple-50 text-purple-700 border border-purple-200 font-medium"
                    : "bg-white text-gray-600 border border-gray-200 hover:border-gray-300"
                }`}
              >
                {et.name}
                {countFieldsForScope({ type: "entity", entity_type_id: et.id }) > 0 && (
                  <span className="ml-1 text-xs text-gray-400">
                    ({countFieldsForScope({ type: "entity", entity_type_id: et.id })})
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {activeSection === "dimension" && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {dimensions.map((d) => (
              <button
                key={d.id}
                onClick={() => setActiveKey(d.id)}
                className={`px-3 py-1 text-sm rounded-md whitespace-nowrap transition-colors ${
                  activeKey === d.id
                    ? "bg-purple-50 text-purple-700 border border-purple-200 font-medium"
                    : "bg-white text-gray-600 border border-gray-200 hover:border-gray-300"
                }`}
              >
                {d.name}
                {countFieldsForScope({ type: "dimension", dimension_id: d.id }) > 0 && (
                  <span className="ml-1 text-xs text-gray-400">
                    ({countFieldsForScope({ type: "dimension", dimension_id: d.id })})
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {activeSection === "other" && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[
              { key: "enrollment", label: "Enrollments" },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setActiveKey(item.key)}
                className={`px-3 py-1 text-sm rounded-md whitespace-nowrap transition-colors ${
                  activeKey === item.key
                    ? "bg-purple-50 text-purple-700 border border-purple-200 font-medium"
                    : "bg-white text-gray-600 border border-gray-200 hover:border-gray-300"
                }`}
              >
                {item.label}
                {countFieldsForScope({ type: item.key }) > 0 && (
                  <span className="ml-1 text-xs text-gray-400">
                    ({countFieldsForScope({ type: item.key })})
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Activity tab: view filter dropdowns */}
        {activeSection === "activity" && (
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Filter by Activity Type</label>
              <select
                className="border rounded-md px-3 py-1.5 text-sm"
                value={activityFilterTypeId}
                onChange={(e) => setActivityFilterTypeId(e.target.value)}
              >
                <option value="">All</option>
                {activityTypes.map((at) => (
                  <option key={at.id} value={at.id}>{at.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Filter by Dimension</label>
              <select
                className="border rounded-md px-3 py-1.5 text-sm"
                value={activityFilterDimId}
                onChange={(e) => {
                  setActivityFilterDimId(e.target.value);
                  setActivityFilterDvId("");
                }}
              >
                <option value="">All</option>
                {dimensions.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            {activityFilterDimId && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">Value</label>
                <select
                  className="border rounded-md px-3 py-1.5 text-sm"
                  value={activityFilterDvId}
                  onChange={(e) => setActivityFilterDvId(e.target.value)}
                >
                  <option value="">All</option>
                  {allDimensionValues
                    .filter((dv) => dv.dimension_id === activityFilterDimId)
                    .map((dv) => (
                      <option key={dv.id} value={dv.id}>{dv.name}</option>
                    ))}
                </select>
              </div>
            )}

            {hasFilters && (
              <button
                onClick={() => { setActivityFilterTypeId(""); setActivityFilterDimId(""); setActivityFilterDvId(""); }}
                className="text-xs text-purple-600 hover:text-purple-800 pb-2"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Participant tab: entity pills + view filter dropdowns */}
        {activeSection === "participant" && (
          <div className="space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {participantEntityOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    setParticipantEntityId(opt.id);
                    setParticipantFilterTypeId("");
                    setParticipantFilterDimId("");
                    setParticipantFilterDvId("");
                  }}
                  className={`px-3 py-1 text-sm rounded-md whitespace-nowrap transition-colors ${
                    participantEntityId === opt.id
                      ? "bg-purple-50 text-purple-700 border border-purple-200 font-medium"
                      : "bg-white text-gray-600 border border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {opt.name}
                  {(participantEntityCounts[opt.id] || 0) > 0 && (
                    <span className="ml-1 text-xs text-gray-400">
                      ({participantEntityCounts[opt.id]})
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Filter by Activity Type</label>
                <select
                  className="border rounded-md px-3 py-1.5 text-sm"
                  value={participantFilterTypeId}
                  onChange={(e) => setParticipantFilterTypeId(e.target.value)}
                >
                  <option value="">All</option>
                  {activityTypes.map((at) => (
                    <option key={at.id} value={at.id}>{at.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Filter by Dimension</label>
                <select
                  className="border rounded-md px-3 py-1.5 text-sm"
                  value={participantFilterDimId}
                  onChange={(e) => {
                    setParticipantFilterDimId(e.target.value);
                    setParticipantFilterDvId("");
                  }}
                >
                  <option value="">All</option>
                  {dimensions.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              {participantFilterDimId && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Value</label>
                  <select
                    className="border rounded-md px-3 py-1.5 text-sm"
                    value={participantFilterDvId}
                    onChange={(e) => setParticipantFilterDvId(e.target.value)}
                  >
                    <option value="">All</option>
                    {allDimensionValues
                      .filter((dv) => dv.dimension_id === participantFilterDimId)
                      .map((dv) => (
                        <option key={dv.id} value={dv.id}>{dv.name}</option>
                      ))}
                  </select>
                </div>
              )}

              {(participantFilterTypeId || participantFilterDimId || participantFilterDvId) && (
                <button
                  onClick={() => { setParticipantFilterTypeId(""); setParticipantFilterDimId(""); setParticipantFilterDvId(""); }}
                  className="text-xs text-purple-600 hover:text-purple-800 pb-2"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Fields table for entity/dimension/other (single-scope) */}
      {!isActivityOrParticipant && currentScope && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">
              Fields for {selectedLabel}
            </p>
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4 mr-1" />
              Add Field
            </Button>
          </div>

          {fields.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No form fields defined yet.
            </p>
          ) : (
            <div className="bg-white shadow-sm border rounded-lg overflow-hidden">
            <Table stickyRows={1} className="max-h-[calc(100vh-400px)] lg:max-h-[calc(100vh-300px)]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">{""}</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead>Options</TableHead>
                  <TableHead className="w-20 text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((field, index) => (
                  <TableRow key={field.key}>
                    <TableCell>
                      <GripVertical className="h-4 w-4 text-gray-300" />
                    </TableCell>
                    <TableCell className="font-medium">
                      {field.label}
                      {field.system && (
                        <span className="ml-1.5 text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                          System
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {FIELD_TYPES.find((ft) => ft.value === field.type)?.label || field.type}
                    </TableCell>
                    <TableCell>{field.required ? "Yes" : "No"}</TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {field.default != null && field.default !== ""
                        ? field.type === "boolean"
                          ? (field.default ? "Yes" : "No")
                          : Array.isArray(field.default)
                            ? field.default.join(", ")
                            : String(field.default)
                        : "\u2014"}
                    </TableCell>
                    <TableCell>
                      {field.options?.length ? field.options.join(", ") : "\u2014"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => openEdit(index)} className="text-gray-400 hover:text-purple-600">
                          <Pencil className="h-4 w-4" />
                        </button>
                        {!field.system && (
                          <button onClick={() => handleDelete(index)} className="text-gray-400 hover:text-red-500">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </>
      )}

      {/* Grouped flat table for activity/participant */}
      {isActivityOrParticipant && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">
              {totalFlatFields} field{totalFlatFields !== 1 ? "s" : ""}
              {hasFilters ? " (filtered)" : ""}
            </p>
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4 mr-1" />
              Add Field
            </Button>
          </div>

          {flatGroups.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm">
                {hasFilters
                  ? "No fields match the current filters."
                  : "No form fields defined yet."}
              </p>
              {hasFilters && (
                <button
                  onClick={() => {
                    if (activeSection === "activity") {
                      setActivityFilterTypeId("");
                      setActivityFilterDimId("");
                      setActivityFilterDvId("");
                    } else {
                      setParticipantFilterTypeId("");
                      setParticipantFilterDimId("");
                      setParticipantFilterDvId("");
                    }
                  }}
                  className="text-sm text-purple-600 hover:text-purple-800 mt-2"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white shadow-sm border rounded-lg overflow-hidden">
            <Table stickyRows={1} className="max-h-[calc(100vh-400px)] lg:max-h-[calc(100vh-300px)]">
              <TableHeader>
                <TableRow>
                  <TableHead>Scope</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead className="w-20 text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flatGroups.map((group, gi) => (
                  group.schema.fields.map((field, index) => (
                    <TableRow key={`${gi}-${field.key}`} className={gi > 0 && index === 0 ? "border-t-4 border-t-gray-100" : ""}>
                      <TableCell className="text-sm text-gray-500 align-top">
                        {index === 0 && (
                          <span className="font-medium text-gray-600">{group.scopeLabel}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {field.label}
                        {field.system && (
                          <span className="ml-1.5 text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                            System
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {FIELD_TYPES.find((ft) => ft.value === field.type)?.label || field.type}
                      </TableCell>
                      <TableCell>{field.required ? "Yes" : "No"}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openEdit(index, group.schema)}
                            className="text-gray-400 hover:text-purple-600"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {!field.system && (
                            <button
                              onClick={() => handleDelete(index, group.schema)}
                              className="text-gray-400 hover:text-red-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </>
      )}

      {/* Add/Edit field modal */}
      <Dialog
        open={modalOpen}
        onClose={closeModal}
        title={editingIndex !== null ? "Edit Field" : "Add Form Field"}
      >
        <form onSubmit={handleSave} className="space-y-3">
          {/* Scope selection for activity/participant */}
          {isActivityOrParticipant && (
            <div className="space-y-3 pb-3 mb-3 border-b">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Scope</p>

              {activeSection === "participant" && (
                <div>
                  <Label htmlFor="modal-entity">Entity Type</Label>
                  <select
                    id="modal-entity"
                    className="w-full border rounded-md p-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-50"
                    value={modalEntityId}
                    onChange={(e) => setModalEntityId(e.target.value)}
                    disabled={editingIndex !== null}
                  >
                    {participantEntityOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <Label htmlFor="modal-activity-type">
                  Activity Type <span className="text-gray-400 text-xs font-normal">(optional)</span>
                </Label>
                <select
                  id="modal-activity-type"
                  className="w-full border rounded-md p-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-50"
                  value={modalActivityTypeId}
                  onChange={(e) => setModalActivityTypeId(e.target.value)}
                  disabled={editingIndex !== null}
                >
                  <option value="">All</option>
                  {activityTypes.map((at) => (
                    <option key={at.id} value={at.id}>{at.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="modal-dimension">
                  Dimension <span className="text-gray-400 text-xs font-normal">(optional)</span>
                </Label>
                <select
                  id="modal-dimension"
                  className="w-full border rounded-md p-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-50"
                  value={modalDimId}
                  onChange={(e) => {
                    setModalDimId(e.target.value);
                    setModalDvId("");
                  }}
                  disabled={editingIndex !== null}
                >
                  <option value="">None</option>
                  {dimensions.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              {modalDimId && (
                <div>
                  <Label htmlFor="modal-dv">Value</Label>
                  <select
                    id="modal-dv"
                    className="w-full border rounded-md p-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-50"
                    value={modalDvId}
                    onChange={(e) => setModalDvId(e.target.value)}
                    disabled={editingIndex !== null}
                    required
                  >
                    <option value="">Select...</option>
                    {allDimensionValues
                      .filter((dv) => dv.dimension_id === modalDimId)
                      .map((dv) => (
                        <option key={dv.id} value={dv.id}>{dv.name}</option>
                      ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Field definition */}
          <div>
            <Label htmlFor="field-label">Label</Label>
            <Input
              id="field-label"
              value={fieldForm.label}
              onChange={(e) => setFieldForm({ ...fieldForm, label: e.target.value })}
              placeholder="e.g. Nationality"
              required
            />
          </div>
          {editingIndex !== null && (
            <p className="text-xs text-gray-400 font-mono">
              Key: {fieldForm.key}
              {fieldForm.system && <span className="ml-2 text-blue-500">(system field)</span>}
            </p>
          )}
          <div>
            <Label htmlFor="field-type">Type</Label>
            <select
              id="field-type"
              disabled={fieldForm.system}
              className={`w-full border rounded-md p-2 text-sm ${fieldForm.system ? 'opacity-60 cursor-not-allowed bg-gray-50' : ''}`}
              value={fieldForm.type}
              onChange={(e) => setFieldForm({ ...fieldForm, type: e.target.value as MetaFieldType })}
            >
              {FIELD_TYPES.map((ft) => (
                <option key={ft.value} value={ft.value}>{ft.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={fieldForm.required || false}
              onCheckedChange={(checked) => setFieldForm({ ...fieldForm, required: checked })}
            />
            <Label>Required</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={fieldForm.visible !== false}
              onCheckedChange={(checked) => setFieldForm({ ...fieldForm, visible: checked })}
              disabled={fieldForm.system}
            />
            <Label>Visible on forms</Label>
          </div>
          {fieldForm.visible !== false && (
            <div>
              <Label htmlFor="field-stage">Show on</Label>
              <select
                id="field-stage"
                className="w-full border rounded-md p-2 text-sm"
                value={fieldForm.stage || "both"}
                onChange={(e) => setFieldForm({ ...fieldForm, stage: e.target.value as MetaFieldStage })}
              >
                <option value="both">Both create and edit</option>
                <option value="create">Create only</option>
                <option value="record">Edit only</option>
              </select>
            </div>
          )}
          {(fieldForm.type === "text" || fieldForm.type === "select" || fieldForm.type === "multiselect") && (
            <div>
              <Label htmlFor="field-display-type">
                Display as <span className="text-gray-400 text-xs font-normal">(optional)</span>
              </Label>
              <select
                id="field-display-type"
                className="w-full border rounded-md p-2 text-sm"
                value={fieldForm.display_type || ""}
                onChange={(e) => setFieldForm({ ...fieldForm, display_type: (e.target.value || undefined) as MetaFieldDisplayType | undefined })}
              >
                <option value="">Auto</option>
                <option value="input">Text input</option>
                <option value="textarea">Textarea</option>
                <option value="dropdown">Dropdown</option>
                <option value="radio">Radio buttons</option>
                <option value="checklist">Checklist</option>
              </select>
            </div>
          )}
          {showOptions && (
            <div>
              <Label htmlFor="field-options">
                Options <span className="text-gray-400 text-xs font-normal">(one per line)</span>
              </Label>
              <textarea
                id="field-options"
                className="w-full border rounded-md p-2 text-sm min-h-[80px]"
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder={"Option 1\nOption 2\nOption 3"}
              />
            </div>
          )}
          <div>
            <Label htmlFor="field-default">
              Default value <span className="text-gray-400 text-xs font-normal">(optional)</span>
            </Label>
            {fieldForm.type === "boolean" ? (
              <div className="flex items-center gap-2 mt-1">
                <Switch
                  checked={fieldForm.default === true}
                  onCheckedChange={(checked) => setFieldForm({ ...fieldForm, default: checked })}
                />
                <span className="text-sm text-gray-600">{fieldForm.default === true ? "Yes" : "No"}</span>
              </div>
            ) : fieldForm.type === "select" ? (
              <select
                id="field-default"
                className="w-full border rounded-md p-2 text-sm"
                value={(fieldForm.default as string) || ""}
                onChange={(e) => setFieldForm({ ...fieldForm, default: e.target.value || undefined })}
              >
                <option value="">None</option>
                {optionsText.split("\n").map((o) => o.trim()).filter(Boolean).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : fieldForm.type === "multiselect" ? (
              <div className="space-y-1 mt-1">
                {optionsText.split("\n").map((o) => o.trim()).filter(Boolean).map((opt) => {
                  const selected = Array.isArray(fieldForm.default) ? fieldForm.default : [];
                  return (
                    <label key={opt} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selected.includes(opt)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...selected, opt]
                            : selected.filter((s) => s !== opt);
                          setFieldForm({ ...fieldForm, default: next.length ? next : undefined });
                        }}
                      />
                      {opt}
                    </label>
                  );
                })}
                {!optionsText.trim() && (
                  <p className="text-xs text-gray-400">Add options above first</p>
                )}
              </div>
            ) : fieldForm.type === "date" || fieldForm.type === "datetime" ? (
              <DateTimeInput
                value={fieldForm.default != null ? String(fieldForm.default) : ""}
                onChange={(val) => {
                  setFieldForm({ ...fieldForm, default: val || undefined });
                }}
                allowTime={fieldForm.type === "datetime"}
              />
            ) : (
              <Input
                id="field-default"
                type={fieldForm.type === "number" ? "number" : "text"}
                value={fieldForm.default != null ? String(fieldForm.default) : ""}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) {
                    setFieldForm({ ...fieldForm, default: undefined });
                  } else if (fieldForm.type === "number") {
                    setFieldForm({ ...fieldForm, default: Number(val) });
                  } else {
                    setFieldForm({ ...fieldForm, default: val });
                  }
                }}
                placeholder="Leave blank for no default"
              />
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
            <Button type="submit">{editingIndex !== null ? "Save" : "Add"}</Button>
          </div>
        </form>
      </Dialog>
      </PageContent>
    </>
  );
}
