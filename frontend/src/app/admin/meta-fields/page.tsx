"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  metaFieldSchemaApi,
  dimensionApi,
  entityTypeApi,
  activityCategoryApi,
} from "@/services/api";
import {
  MetaFieldDefinition,
  MetaFieldSchemas,
  MetaFieldType,
  Dimension,
  ActivityCategory,
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
import { useVocabulary } from "@/hooks/useVocabulary";

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
  const { v, vPlural, vDim } = useVocabulary();
  const [activeSection, setActiveSection] = useState<SectionKind>("entity");
  const [activeKey, setActiveKey] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [fieldForm, setFieldForm] = useState<MetaFieldDefinition>({ ...emptyField });
  const [optionsText, setOptionsText] = useState("");

  // Participant section state
  const [participantEntityId, setParticipantEntityId] = useState<string>("");
  const [participantScope, setParticipantScope] = useState<"all" | "category" | "type">("all");
  const [participantScopeId, setParticipantScopeId] = useState<string>("");

  const { data: dimensions = [] } = useQuery<Dimension[]>({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
  });

  const { data: entityTypesList = [] } = useQuery({
    queryKey: ["entity-types"],
    queryFn: entityTypeApi.list,
  });

  const { data: categories = [] } = useQuery<ActivityCategory[]>({
    queryKey: ["activity-categories"],
    queryFn: activityCategoryApi.list,
  });

  const nonSystemDimensions = dimensions;

  // Derive the schema key from section + activeKey
  const schemaKey = useMemo(() => {
    if (activeSection === "participant") {
      if (!participantEntityId) return "";
      const base = `participant:entity:${participantEntityId}`;
      if (participantScope === "all" || !participantScopeId) return base;
      return `${base}:${participantScope}:${participantScopeId}`;
    }

    if (!activeKey) return "";
    switch (activeSection) {
      case "entity": return `entity:${activeKey}`;
      case "dimension": return `dimension:${activeKey}`;
      case "other": return activeKey;
      case "activity": return `activity:category:${activeKey}`;
      default: return "";
    }
  }, [activeSection, activeKey, participantEntityId, participantScope, participantScopeId]);

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
        setActiveKey("activity_type");
        break;
      case "activity":
        setActiveKey(categories[0]?.id || "");
        break;
      case "participant":
        setParticipantEntityId(entityTypesList[0]?.id || "user");
        setParticipantScope("all");
        setParticipantScopeId("");
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

  const updateMutation = useMutation({
    mutationFn: (newFields: MetaFieldDefinition[]) =>
      metaFieldSchemaApi.update(schemaKey, newFields),
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
    switch (activeSection) {
      case "entity": return entityTypesList.find((et) => et.id === activeKey)?.name || activeKey;
      case "dimension": {
        const dim = nonSystemDimensions.find((d) => d.id === activeKey);
        return dim ? vDim(dim) : activeKey;
      }
      case "other": return activeKey === "activity_type" ? vPlural("activity_type") : vPlural("enrollment");
      case "activity": {
        const cat = categories.find((c) => c.id === activeKey);
        return cat ? `Activity: ${cat.name}` : activeKey;
      }
      case "participant": {
        const entityLabel = participantEntityId === "user"
          ? "Users"
          : entityTypesList.find((et) => et.id === participantEntityId)?.name || participantEntityId;
        if (participantScope === "all") return `Participant: ${entityLabel} (all categories)`;
        if (participantScope === "category") {
          const cat = categories.find((c) => c.id === participantScopeId);
          return `Participant: ${entityLabel} \u2192 ${cat?.name || "category"}`;
        }
        return `Participant: ${entityLabel}`;
      }
      default: return "";
    }
  }, [activeSection, activeKey, entityTypesList, nonSystemDimensions, categories, vPlural, vDim, participantEntityId, participantScope, participantScopeId]);

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
                {vDim(d)}
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
              { key: "activity_type", label: vPlural("activity_type") },
              { key: "enrollment", label: vPlural("enrollment") },
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
          <div>
            <label className="text-xs text-gray-500 block mb-1">{v("activity_category")}</label>
            <select
              className="border rounded-md px-3 py-1.5 text-sm"
              value={activeKey}
              onChange={(e) => setActiveKey(e.target.value)}
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
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
                      setParticipantScope("all");
                      setParticipantScopeId("");
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

            {/* Activity scope selector */}
            <div className="flex items-center gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Scope</label>
                <select
                  className="border rounded-md px-3 py-1.5 text-sm"
                  value={participantScope}
                  onChange={(e) => {
                    const scope = e.target.value as "all" | "category";
                    setParticipantScope(scope);
                    setParticipantScopeId("");
                  }}
                >
                  <option value="all">All categories</option>
                  <option value="category">Specific category</option>
                </select>
              </div>

              {participantScope === "category" && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">{v("activity_category")}</label>
                  <select
                    className="border rounded-md px-3 py-1.5 text-sm"
                    value={participantScopeId}
                    onChange={(e) => setParticipantScopeId(e.target.value)}
                  >
                    <option value="">Select...</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
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
