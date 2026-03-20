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

export default function MetaFieldsPage() {
  const queryClient = useQueryClient();

  const [activeSection, setActiveSection] = useState<SectionKind>("entity");
  const [activeKey, setActiveKey] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [fieldForm, setFieldForm] = useState<MetaFieldDefinition>({ ...emptyField });
  const [optionsText, setOptionsText] = useState("");

  // Activity section: activity type (required or "all") + optional dimension value filter
  const [activityTypeId, setActivityTypeId] = useState<string>(""); // "" = all
  const [activityDimId, setActivityDimId] = useState<string>(""); // which dimension to filter
  const [activityDvId, setActivityDvId] = useState<string>(""); // selected dimension value (optional)

  // Participant section state
  const [participantEntityId, setParticipantEntityId] = useState<string>("");
  const [participantTypeId, setParticipantTypeId] = useState<string>(""); // "" = all
  const [participantDimId, setParticipantDimId] = useState<string>("");
  const [participantDvId, setParticipantDvId] = useState<string>("");

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

  const nonSystemDimensions = dimensions;

  // Derive the schema key from section + activeKey
  const schemaKey = useMemo(() => {
    if (activeSection === "activity") {
      // Build: activity:activity_type:{typeId}[:dimension_value:{dvId}]
      // or: activity:dimension_value:{dvId} (all activity types)
      // or: activity (all activities, no filters)
      if (activityTypeId && activityDvId) {
        return `activity:activity_type:${activityTypeId}:dimension_value:${activityDvId}`;
      }
      if (activityTypeId) {
        return `activity:activity_type:${activityTypeId}`;
      }
      if (activityDvId) {
        return `activity:dimension_value:${activityDvId}`;
      }
      return "activity";
    }

    if (activeSection === "participant") {
      if (!participantEntityId) return "";
      let key = `participant:entity:${participantEntityId}`;
      if (participantTypeId) {
        key += `:activity_type:${participantTypeId}`;
      }
      if (participantDvId) {
        key += `:dimension_value:${participantDvId}`;
      }
      return key;
    }

    if (!activeKey) return "";
    switch (activeSection) {
      case "entity": return `entity:${activeKey}`;
      case "dimension": return `dimension:${activeKey}`;
      case "other": return activeKey;
      default: return "";
    }
  }, [activeSection, activeKey, activityTypeId, activityDvId, participantEntityId, participantTypeId, participantDvId]);

  // Auto-select first ID when section changes
  const selectSection = (section: SectionKind) => {
    setActiveSection(section);
    switch (section) {
      case "entity":
        setActiveKey(entityTypesList[0]?.id || "");
        break;
      case "dimension":
        setActiveKey(nonSystemDimensions[0]?.id || "");
        break;
      case "other":
        setActiveKey("enrollment");
        break;
      case "activity":
        setActivityTypeId("");
        setActivityDimId("");
        setActivityDvId("");
        break;
      case "participant":
        setParticipantEntityId(entityTypesList[0]?.id || "user");
        setParticipantTypeId("");
        setParticipantDimId("");
        setParticipantDvId("");
        break;
    }
  };

  // Set initial ID on first load
  useMemo(() => {
    if (!activeKey && entityTypesList.length > 0) {
      setActiveKey(entityTypesList[0].id);
    }
  }, [entityTypesList]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: allSchemas = {} as MetaFieldSchemas } = useQuery<MetaFieldSchemas>({
    queryKey: ["meta-field-schemas"],
    queryFn: metaFieldSchemaApi.getAll,
  });

  const fields = schemaKey ? (allSchemas[schemaKey] || []) : [];

  // Build structured scope for the API
  const currentScope = useMemo((): MetaFieldScope | null => {
    switch (activeSection) {
      case "entity":
        return activeKey ? { type: "entity", entity_type_id: activeKey } : null;
      case "dimension":
        return activeKey ? { type: "dimension", dimension_id: activeKey } : null;
      case "other":
        return activeKey ? { type: activeKey } : null;
      case "activity": {
        const scope: MetaFieldScope = { type: "activity" };
        if (activityTypeId) scope.activity_type_id = activityTypeId;
        if (activityDvId) scope.dimension_value_id = activityDvId;
        return scope;
      }
      case "participant": {
        if (!participantEntityId) return null;
        const scope: MetaFieldScope = { type: "participant", entity_type_id: participantEntityId };
        if (participantTypeId) scope.activity_type_id = participantTypeId;
        if (participantDvId) scope.dimension_value_id = participantDvId;
        return scope;
      }
      default:
        return null;
    }
  }, [activeSection, activeKey, activityTypeId, activityDvId, participantEntityId, participantTypeId, participantDvId]);

  const updateMutation = useMutation({
    mutationFn: (newFields: MetaFieldDefinition[]) => {
      if (!currentScope) throw new Error("No scope selected");
      return metaFieldSchemaApi.update(currentScope, newFields);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meta-field-schemas"] });
      toast.success("Form fields updated");
    },
    onError: () => toast.error("Failed to update"),
  });

  const openAdd = () => {
    setEditingIndex(null);
    setFieldForm({ ...emptyField });
    setOptionsText("");
    setModalOpen(true);
  };

  const openEdit = (index: number) => {
    const f = fields[index];
    setEditingIndex(index);
    setFieldForm({ ...f });
    setOptionsText(f.options?.join("\n") || "");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingIndex(null);
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

    let updated: MetaFieldDefinition[];
    if (editingIndex !== null) {
      updated = fields.map((f, i) => (i === editingIndex ? field : f));
    } else {
      updated = [...fields, field];
    }

    updateMutation.mutate(updated);
    closeModal();
  };

  const handleDelete = (index: number) => {
    if (!confirm(`Delete field "${fields[index].label}"?`)) return;
    const updated = fields.filter((_, i) => i !== index);
    updateMutation.mutate(updated);
  };

  const showOptions = fieldForm.type === "select" || fieldForm.type === "multiselect";

  // Build label for the currently selected schema
  const selectedLabel = useMemo(() => {
    const dvLabel = (dvId: string) => {
      const dv = allDimensionValues.find((d) => d.id === dvId);
      if (!dv) return "";
      const dim = dimensions.find((d) => d.id === dv.dimension_id);
      return `${dim ? dim.name : ""}: ${dv.name}`;
    };

    switch (activeSection) {
      case "entity": return entityTypesList.find((et) => et.id === activeKey)?.name || activeKey;
      case "dimension": {
        const dim = nonSystemDimensions.find((d) => d.id === activeKey);
        return dim ? dim.name : activeKey;
      }
      case "other": return "Enrollments";
      case "activity": {
        const typeName = activityTypes.find((c) => c.id === activityTypeId)?.name;
        const parts = ["Activity"];
        if (typeName) parts.push(typeName);
        else parts.push("All");
        if (activityDvId) parts.push(dvLabel(activityDvId));
        return parts.join(" \u2192 ");
      }
      case "participant": {
        const entityLabel = participantEntityId === "user"
          ? "Users"
          : entityTypesList.find((et) => et.id === participantEntityId)?.name || participantEntityId;
        const parts = [`Participant: ${entityLabel}`];
        if (participantTypeId) {
          const typeName = activityTypes.find((c) => c.id === participantTypeId)?.name;
          parts.push(typeName || "activity type");
        }
        if (participantDvId) parts.push(dvLabel(participantDvId));
        if (!participantTypeId && !participantDvId) parts.push("(all)");
        return parts.join(" \u2192 ");
      }
      default: return "";
    }
  }, [activeSection, activeKey, entityTypesList, nonSystemDimensions, dimensions, allDimensionValues, activityTypes, activityTypeId, activityDvId, participantEntityId, participantTypeId, participantDvId]);

  // Collect all configured scopes for activity/participant sections
  const scopeSummary = useMemo(() => {
    const dvLabel = (dvId: string) => {
      const dv = allDimensionValues.find((d) => d.id === dvId);
      if (!dv) return dvId;
      const dim = dimensions.find((d) => d.id === dv.dimension_id);
      return `${dim ? dim.name : ""}: ${dv.name}`;
    };

    const labelForKey = (key: string): string => {
      if (key === "activity") return "All activities";
      const parts = key.split(":");
      if (parts[0] === "activity") {
        const labels: string[] = [];
        for (let i = 1; i < parts.length; i += 2) {
          const sub = parts[i];
          const refId = parts[i + 1];
          if (sub === "activity_type") {
            labels.push(activityTypes.find((at) => at.id === refId)?.name || refId);
          } else if (sub === "dimension_value") {
            labels.push(dvLabel(refId));
          }
        }
        return labels.join(" + ") || key;
      }
      if (parts[0] === "participant" && parts[1] === "entity") {
        const entityId = parts[2];
        const entityLabel = entityId === "user"
          ? "Users (staff)"
          : entityTypesList.find((et) => et.id === entityId)?.name || entityId;
        const labels: string[] = [entityLabel];
        for (let i = 3; i < parts.length; i += 2) {
          const sub = parts[i];
          const refId = parts[i + 1];
          if (sub === "activity_type") {
            labels.push(activityTypes.find((at) => at.id === refId)?.name || refId);
          } else if (sub === "dimension_value") {
            labels.push(dvLabel(refId));
          }
        }
        return labels.join(" + ");
      }
      return key;
    };

    const activityScopes: { key: string; label: string; count: number }[] = [];
    const participantScopes: { key: string; label: string; count: number }[] = [];

    for (const [key, fieldList] of Object.entries(allSchemas)) {
      if (!fieldList?.length) continue;
      if (key === "activity" || key.startsWith("activity:")) {
        activityScopes.push({ key, label: labelForKey(key), count: fieldList.length });
      } else if (key.startsWith("participant:")) {
        participantScopes.push({ key, label: labelForKey(key), count: fieldList.length });
      }
    }

    return { activityScopes, participantScopes };
  }, [allSchemas, activityTypes, allDimensionValues, dimensions, entityTypesList]);

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

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Form Fields</h2>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Define form fields for entities, dimensions, activities, and participants.
        Fields appear in create/edit forms and are stored as metadata.
      </p>

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
            {nonSystemDimensions.map((d) => (
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

        {activeSection === "activity" && (
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Activity Type</label>
              <select
                className="border rounded-md px-3 py-1.5 text-sm"
                value={activityTypeId}
                onChange={(e) => setActivityTypeId(e.target.value)}
              >
                <option value="">All</option>
                {activityTypes.map((at) => (
                  <option key={at.id} value={at.id}>{at.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Dimension (optional)</label>
              <select
                className="border rounded-md px-3 py-1.5 text-sm"
                value={activityDimId}
                onChange={(e) => {
                  setActivityDimId(e.target.value);
                  setActivityDvId("");
                }}
              >
                <option value="">No filter</option>
                {dimensions.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            {activityDimId && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">Value</label>
                <select
                  className="border rounded-md px-3 py-1.5 text-sm"
                  value={activityDvId}
                  onChange={(e) => setActivityDvId(e.target.value)}
                >
                  <option value="">Select...</option>
                  {allDimensionValues
                    .filter((dv) => dv.dimension_id === activityDimId)
                    .map((dv) => (
                      <option key={dv.id} value={dv.id}>{dv.name}</option>
                    ))}
                </select>
              </div>
            )}
          </div>
        )}

        {activeSection === "participant" && (
          <div className="space-y-3">
            {/* Entity type selector */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Entity Type</label>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {participantEntityOptions.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setParticipantEntityId(opt.id);
                      setParticipantTypeId("");
                      setParticipantDvId("");
                    }}
                    className={`px-3 py-1 text-sm rounded-md whitespace-nowrap transition-colors ${
                      participantEntityId === opt.id
                        ? "bg-purple-50 text-purple-700 border border-purple-200 font-medium"
                        : "bg-white text-gray-600 border border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    {opt.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Scope selectors */}
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Activity Type</label>
                <select
                  className="border rounded-md px-3 py-1.5 text-sm"
                  value={participantTypeId}
                  onChange={(e) => setParticipantTypeId(e.target.value)}
                >
                  <option value="">All</option>
                  {activityTypes.map((at) => (
                    <option key={at.id} value={at.id}>{at.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Dimension (optional)</label>
                <select
                  className="border rounded-md px-3 py-1.5 text-sm"
                  value={participantDimId}
                  onChange={(e) => {
                    setParticipantDimId(e.target.value);
                    setParticipantDvId("");
                  }}
                >
                  <option value="">No filter</option>
                  {dimensions.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              {participantDimId && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Value</label>
                  <select
                    className="border rounded-md px-3 py-1.5 text-sm"
                    value={participantDvId}
                    onChange={(e) => setParticipantDvId(e.target.value)}
                  >
                    <option value="">Select...</option>
                    {allDimensionValues
                      .filter((dv) => dv.dimension_id === participantDimId)
                      .map((dv) => (
                        <option key={dv.id} value={dv.id}>{dv.name}</option>
                      ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Fields table */}
      {schemaKey && (
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">{""}</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead>Options</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
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
                      <div className="flex gap-1">
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
          )}
        </>
      )}

      {/* Scope summary for activity/participant */}
      {(activeSection === "activity" && scopeSummary.activityScopes.length > 0) && (
        <div className="mt-6 border-t pt-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">All configured activity field scopes</p>
          <div className="space-y-1">
            {scopeSummary.activityScopes.map((s) => (
              <button
                key={s.key}
                onClick={() => {
                  // Parse scope key to set the right filters
                  const parts = s.key.split(":");
                  let atId = "";
                  let dvId = "";
                  for (let i = 0; i < parts.length; i += 2) {
                    if (parts[i] === "activity_type") atId = parts[i + 1];
                    if (parts[i] === "dimension_value") dvId = parts[i + 1];
                  }
                  setActivityTypeId(atId);
                  if (dvId) {
                    const dv = allDimensionValues.find((d) => d.id === dvId);
                    setActivityDimId(dv?.dimension_id || "");
                    setActivityDvId(dvId);
                  } else {
                    setActivityDimId("");
                    setActivityDvId("");
                  }
                }}
                className={`flex items-center justify-between w-full px-3 py-1.5 text-sm rounded-md transition-colors ${
                  schemaKey === s.key
                    ? "bg-purple-50 text-purple-700 border border-purple-200"
                    : "text-gray-600 hover:bg-gray-50 border border-transparent"
                }`}
              >
                <span>{s.label}</span>
                <span className="text-xs text-gray-400">{s.count} field{s.count !== 1 ? "s" : ""}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {(activeSection === "participant" && scopeSummary.participantScopes.length > 0) && (
        <div className="mt-6 border-t pt-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">All configured participant field scopes</p>
          <div className="space-y-1">
            {scopeSummary.participantScopes.map((s) => (
              <button
                key={s.key}
                onClick={() => {
                  // Parse: participant:entity:{entityId}[:activity_type:{atId}][:dimension_value:{dvId}]
                  const parts = s.key.split(":");
                  const entityId = parts[2] || "";
                  let atId = "";
                  let dvId = "";
                  for (let i = 3; i < parts.length; i += 2) {
                    if (parts[i] === "activity_type") atId = parts[i + 1];
                    if (parts[i] === "dimension_value") dvId = parts[i + 1];
                  }
                  setParticipantEntityId(entityId);
                  setParticipantTypeId(atId);
                  if (dvId) {
                    const dv = allDimensionValues.find((d) => d.id === dvId);
                    setParticipantDimId(dv?.dimension_id || "");
                    setParticipantDvId(dvId);
                  } else {
                    setParticipantDimId("");
                    setParticipantDvId("");
                  }
                }}
                className={`flex items-center justify-between w-full px-3 py-1.5 text-sm rounded-md transition-colors ${
                  schemaKey === s.key
                    ? "bg-purple-50 text-purple-700 border border-purple-200"
                    : "text-gray-600 hover:bg-gray-50 border border-transparent"
                }`}
              >
                <span>{s.label}</span>
                <span className="text-xs text-gray-400">{s.count} field{s.count !== 1 ? "s" : ""}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add/Edit field modal */}
      <Dialog
        open={modalOpen}
        onClose={closeModal}
        title={editingIndex !== null ? "Edit Field" : "Add Form Field"}
      >
        <form onSubmit={handleSave} className="space-y-3">
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
    </>
  );
}
