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
  MetaFieldSchemas,
  MetaFieldType,
  Dimension,
  DimensionValue,
  ActivityType,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
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
};

type SectionKind = "entity" | "dimension" | "other" | "activity" | "participant";

interface ScopeGroup {
  scopeKey: string;
  scopeLabel: string;
  fields: MetaFieldDefinition[];
  activityTypeId: string;
  dimensionValueId: string;
  dimensionId: string;
  entityId: string;
}

export default function MetaFieldsPage() {
  const queryClient = useQueryClient();

  const [activeSection, setActiveSection] = useState<SectionKind>("entity");
  const [activeKey, setActiveKey] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingScopeKey, setEditingScopeKey] = useState<string>("");
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

  const { data: allSchemas = {} as MetaFieldSchemas } = useQuery<MetaFieldSchemas>({
    queryKey: ["meta-field-schemas"],
    queryFn: metaFieldSchemaApi.getAll,
  });

  // Schema key for entity/dimension/other tabs only
  const schemaKey = useMemo(() => {
    if (activeSection === "activity" || activeSection === "participant") return "";
    if (!activeKey) return "";
    switch (activeSection) {
      case "entity": return `entity:${activeKey}`;
      case "dimension": return `dimension:${activeKey}`;
      case "other": return activeKey;
      default: return "";
    }
  }, [activeSection, activeKey]);

  const fields = schemaKey ? (allSchemas[schemaKey] || []) : [];

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

  // --- Flat table groups for Activity tab ---
  const activityGroups = useMemo((): ScopeGroup[] => {
    const groups: ScopeGroup[] = [];
    for (const [key, fieldList] of Object.entries(allSchemas)) {
      if (!fieldList?.length) continue;
      if (key !== "activity" && !key.startsWith("activity:")) continue;

      // Parse scope key
      const parts = key.split(":");
      let atId = "";
      let dvId = "";
      for (let i = 1; i < parts.length; i += 2) {
        if (parts[i] === "activity_type") atId = parts[i + 1];
        if (parts[i] === "dimension_value") dvId = parts[i + 1];
      }
      const dimId = dvId
        ? allDimensionValues.find((d) => d.id === dvId)?.dimension_id || ""
        : "";

      // Apply view filters
      if (activityFilterTypeId && atId !== activityFilterTypeId) continue;
      if (activityFilterDimId && dimId !== activityFilterDimId) continue;
      if (activityFilterDvId && dvId !== activityFilterDvId) continue;

      // Build label
      const labels: string[] = [];
      if (atId) labels.push(activityTypes.find((a) => a.id === atId)?.name || atId);
      if (dvId) {
        const dv = allDimensionValues.find((d) => d.id === dvId);
        const dim = dv ? dimensions.find((d) => d.id === dv.dimension_id) : null;
        labels.push(dim ? `${dim.name}: ${dv!.name}` : dv?.name || dvId);
      }

      groups.push({
        scopeKey: key,
        scopeLabel: labels.length > 0 ? labels.join(" + ") : "All activities",
        fields: fieldList,
        activityTypeId: atId,
        dimensionValueId: dvId,
        dimensionId: dimId,
        entityId: "",
      });
    }
    groups.sort((a, b) => {
      if (a.scopeKey === "activity") return -1;
      if (b.scopeKey === "activity") return 1;
      return a.scopeLabel.localeCompare(b.scopeLabel);
    });
    return groups;
  }, [allSchemas, activityFilterTypeId, activityFilterDimId, activityFilterDvId, activityTypes, allDimensionValues, dimensions]);

  // --- Flat table groups for Participant tab ---
  const participantGroups = useMemo((): ScopeGroup[] => {
    if (!participantEntityId) return [];
    const groups: ScopeGroup[] = [];
    const prefix = `participant:entity:${participantEntityId}`;

    for (const [key, fieldList] of Object.entries(allSchemas)) {
      if (!fieldList?.length) continue;
      if (key !== prefix && !key.startsWith(prefix + ":")) continue;

      const parts = key.split(":");
      let atId = "";
      let dvId = "";
      for (let i = 3; i < parts.length; i += 2) {
        if (parts[i] === "activity_type") atId = parts[i + 1];
        if (parts[i] === "dimension_value") dvId = parts[i + 1];
      }
      const dimId = dvId
        ? allDimensionValues.find((d) => d.id === dvId)?.dimension_id || ""
        : "";

      if (participantFilterTypeId && atId !== participantFilterTypeId) continue;
      if (participantFilterDimId && dimId !== participantFilterDimId) continue;
      if (participantFilterDvId && dvId !== participantFilterDvId) continue;

      const labels: string[] = [];
      if (atId) labels.push(activityTypes.find((a) => a.id === atId)?.name || atId);
      if (dvId) {
        const dv = allDimensionValues.find((d) => d.id === dvId);
        const dim = dv ? dimensions.find((d) => d.id === dv.dimension_id) : null;
        labels.push(dim ? `${dim.name}: ${dv!.name}` : dv?.name || dvId);
      }

      groups.push({
        scopeKey: key,
        scopeLabel: labels.length > 0 ? labels.join(" + ") : "All",
        fields: fieldList,
        activityTypeId: atId,
        dimensionValueId: dvId,
        dimensionId: dimId,
        entityId: participantEntityId,
      });
    }
    groups.sort((a, b) => {
      if (!a.activityTypeId && !a.dimensionValueId) return -1;
      if (!b.activityTypeId && !b.dimensionValueId) return 1;
      return a.scopeLabel.localeCompare(b.scopeLabel);
    });
    return groups;
  }, [allSchemas, participantEntityId, participantFilterTypeId, participantFilterDimId, participantFilterDvId, activityTypes, allDimensionValues, dimensions]);

  // Participant entity pill field counts
  const participantEntityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [key, fieldList] of Object.entries(allSchemas)) {
      if (!fieldList?.length || !key.startsWith("participant:entity:")) continue;
      const entityId = key.split(":")[2];
      counts[entityId] = (counts[entityId] || 0) + fieldList.length;
    }
    return counts;
  }, [allSchemas]);

  // Build MetaFieldScope from IDs
  const buildScope = (
    section: SectionKind,
    opts: { entityId?: string; activityTypeId?: string; dvId?: string },
  ): MetaFieldScope => {
    if (section === "activity") {
      const scope: MetaFieldScope = { type: "activity" };
      if (opts.activityTypeId) scope.activity_type_id = opts.activityTypeId;
      if (opts.dvId) scope.dimension_value_id = opts.dvId;
      return scope;
    }
    const scope: MetaFieldScope = { type: "participant", entity_type_id: opts.entityId || "" };
    if (opts.activityTypeId) scope.activity_type_id = opts.activityTypeId;
    if (opts.dvId) scope.dimension_value_id = opts.dvId;
    return scope;
  };

  // Build scope key from modal state
  const buildScopeKeyFromModal = (): string => {
    if (activeSection === "activity") {
      if (modalActivityTypeId && modalDvId)
        return `activity:activity_type:${modalActivityTypeId}:dimension_value:${modalDvId}`;
      if (modalActivityTypeId) return `activity:activity_type:${modalActivityTypeId}`;
      if (modalDvId) return `activity:dimension_value:${modalDvId}`;
      return "activity";
    }
    if (activeSection === "participant") {
      let key = `participant:entity:${modalEntityId}`;
      if (modalActivityTypeId) key += `:activity_type:${modalActivityTypeId}`;
      if (modalDvId) key += `:dimension_value:${modalDvId}`;
      return key;
    }
    return "";
  };

  // Parse scope key to extract IDs
  const parseScopeKey = (key: string) => {
    const parts = key.split(":");
    let activityTypeId = "";
    let dimensionValueId = "";
    let entityId = "";
    if (parts[0] === "activity") {
      for (let i = 1; i < parts.length; i += 2) {
        if (parts[i] === "activity_type") activityTypeId = parts[i + 1];
        if (parts[i] === "dimension_value") dimensionValueId = parts[i + 1];
      }
    } else if (parts[0] === "participant" && parts[1] === "entity") {
      entityId = parts[2] || "";
      for (let i = 3; i < parts.length; i += 2) {
        if (parts[i] === "activity_type") activityTypeId = parts[i + 1];
        if (parts[i] === "dimension_value") dimensionValueId = parts[i + 1];
      }
    }
    const dimensionId = dimensionValueId
      ? allDimensionValues.find((d) => d.id === dimensionValueId)?.dimension_id || ""
      : "";
    return { activityTypeId, dimensionValueId, dimensionId, entityId };
  };

  // Current scope for entity/dimension/other tabs
  const currentScope = useMemo((): MetaFieldScope | null => {
    switch (activeSection) {
      case "entity":
        return activeKey ? { type: "entity", entity_type_id: activeKey } : null;
      case "dimension":
        return activeKey ? { type: "dimension", dimension_id: activeKey } : null;
      case "other":
        return activeKey ? { type: activeKey } : null;
      default:
        return null;
    }
  }, [activeSection, activeKey]);

  const updateMutation = useMutation({
    mutationFn: ({ scope, newFields }: { scope: MetaFieldScope; newFields: MetaFieldDefinition[] }) => {
      return metaFieldSchemaApi.update(scope, newFields);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meta-field-schemas"] });
      toast.success("Form fields updated");
    },
    onError: () => toast.error("Failed to update"),
  });

  const saveFields = (scope: MetaFieldScope, newFields: MetaFieldDefinition[]) => {
    updateMutation.mutate({ scope, newFields });
  };

  const openAdd = () => {
    setEditingIndex(null);
    setEditingScopeKey("");
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

  const openEdit = (index: number, scopeKey?: string) => {
    const sk = scopeKey || schemaKey;
    const targetFields = allSchemas[sk] || [];
    const f = targetFields[index];
    if (!f) return;
    setEditingIndex(index);
    setEditingScopeKey(sk);
    setFieldForm({ ...f });
    setOptionsText(f.options?.join("\n") || "");

    if (activeSection === "activity" || activeSection === "participant") {
      const parsed = parseScopeKey(sk);
      setModalActivityTypeId(parsed.activityTypeId);
      setModalDvId(parsed.dimensionValueId);
      setModalDimId(parsed.dimensionId);
      if (activeSection === "participant") {
        setModalEntityId(parsed.entityId);
      }
    }

    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingIndex(null);
    setEditingScopeKey("");
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
      const targetScopeKey = editingIndex !== null ? editingScopeKey : buildScopeKeyFromModal();
      const existingFields = allSchemas[targetScopeKey] || [];
      const updated = editingIndex !== null
        ? existingFields.map((f, i) => (i === editingIndex ? field : f))
        : [...existingFields, field];
      const parsed = parseScopeKey(targetScopeKey);
      const scope = buildScope(activeSection, {
        entityId: parsed.entityId,
        activityTypeId: parsed.activityTypeId,
        dvId: parsed.dimensionValueId,
      });
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

  const handleDelete = (index: number, scopeKey?: string) => {
    const sk = scopeKey || schemaKey;
    const targetFields = allSchemas[sk] || [];
    if (!confirm(`Delete field "${targetFields[index]?.label}"?`)) return;
    const updated = targetFields.filter((_, i) => i !== index);

    if (activeSection === "activity" || activeSection === "participant") {
      const parsed = parseScopeKey(sk);
      const scope = buildScope(activeSection, {
        entityId: parsed.entityId,
        activityTypeId: parsed.activityTypeId,
        dvId: parsed.dimensionValueId,
      });
      saveFields(scope, updated);
    } else {
      if (!currentScope) return;
      saveFields(currentScope, updated);
    }
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
  const totalFlatFields = flatGroups.reduce((sum, g) => sum + g.fields.length, 0);
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
                {(allSchemas[`entity:${et.id}`]?.length || 0) > 0 && (
                  <span className="ml-1 text-xs text-gray-400">
                    ({allSchemas[`entity:${et.id}`]!.length})
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
                {(allSchemas[`dimension:${d.id}`]?.length || 0) > 0 && (
                  <span className="ml-1 text-xs text-gray-400">
                    ({allSchemas[`dimension:${d.id}`]!.length})
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
                {(allSchemas[item.key]?.length || 0) > 0 && (
                  <span className="ml-1 text-xs text-gray-400">
                    ({allSchemas[item.key]!.length})
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

      {/* Fields table for entity/dimension/other (single-scope, unchanged) */}
      {!isActivityOrParticipant && schemaKey && (
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
                    <TableCell className="font-medium">{field.label}</TableCell>
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
                        <button onClick={() => handleDelete(index)} className="text-gray-400 hover:text-red-500">
                          <Trash2 className="h-4 w-4" />
                        </button>
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
                  group.fields.map((field, index) => (
                    <TableRow key={`${group.scopeKey}-${field.key}`} className={gi > 0 && index === 0 ? "border-t-4 border-t-gray-100" : ""}>
                      <TableCell className="text-sm text-gray-500 align-top">
                        {index === 0 && (
                          <span className="font-medium text-gray-600">{group.scopeLabel}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{field.label}</TableCell>
                      <TableCell>
                        {FIELD_TYPES.find((ft) => ft.value === field.type)?.label || field.type}
                      </TableCell>
                      <TableCell>{field.required ? "Yes" : "No"}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openEdit(index, group.scopeKey)}
                            className="text-gray-400 hover:text-purple-600"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(index, group.scopeKey)}
                            className="text-gray-400 hover:text-red-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
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
            <p className="text-xs text-gray-400 font-mono">Key: {fieldForm.key}</p>
          )}
          <div>
            <Label htmlFor="field-type">Type</Label>
            <select
              id="field-type"
              className="w-full border rounded-md p-2 text-sm"
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
            ) : (
              <Input
                id="field-default"
                type={fieldForm.type === "number" ? "number" : fieldForm.type === "date" ? "date" : "text"}
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
                placeholder={fieldForm.type === "date" ? "" : "Leave blank for no default"}
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
