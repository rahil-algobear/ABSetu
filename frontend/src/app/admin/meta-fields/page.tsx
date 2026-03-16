"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  metaFieldSchemaApi,
  dimensionApi,
  entityTypeApi,
  activityCategoryApi,
  activityTypeApi,
} from "@/services/api";
import {
  MetaFieldDefinition,
  MetaFieldSchemas,
  MetaFieldType,
  Dimension,
  ActivityCategory,
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

  const { data: activityTypes = [] } = useQuery<ActivityType[]>({
    queryKey: ["activity-types"],
    queryFn: () => activityTypeApi.list(),
  });

  // Non-system dimensions for the pills
  const nonSystemDimensions = useMemo(
    () => dimensions.filter((d) => !d.is_system),
    [dimensions]
  );

  // Derive the schema key from section + activeKey
  const schemaKey = useMemo(() => {
    if (!activeKey) return "";
    switch (activeSection) {
      case "entity": return `entity:${activeKey}`;
      case "dimension": return `dimension:${activeKey}`;
      case "other": return activeKey; // "activity_type", "enrollment"
      case "activity": return `activity:${activeKey}`;
      case "participant": return `participant:${activeKey}`;
      default: return "";
    }
  }, [activeSection, activeKey]);

  // Auto-select first key when section changes
  const selectSection = (section: SectionKind) => {
    setActiveSection(section);
    switch (section) {
      case "entity":
        setActiveKey(entityTypesList[0]?.key || "");
        break;
      case "dimension":
        setActiveKey(nonSystemDimensions[0]?.key || "");
        break;
      case "other":
        setActiveKey("activity_type");
        break;
      case "activity":
        setActiveKey(categories[0]?.key || "");
        break;
      case "participant":
        setActiveKey(categories[0]?.key || "");
        break;
    }
  };

  // Set initial key on first load
  useMemo(() => {
    if (!activeKey && entityTypesList.length > 0) {
      setActiveKey(entityTypesList[0].key);
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
    const key = fieldForm.key || fieldForm.label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const options =
      fieldForm.type === "select" || fieldForm.type === "multiselect"
        ? optionsText.split("\n").map((o) => o.trim()).filter(Boolean)
        : undefined;

    const field: MetaFieldDefinition = { ...fieldForm, key, options };

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
      case "entity": return entityTypesList.find((et) => et.key === activeKey)?.name || activeKey;
      case "dimension": return nonSystemDimensions.find((d) => d.key === activeKey) ? vDim(nonSystemDimensions.find((d) => d.key === activeKey)!) : activeKey;
      case "other": return activeKey === "activity_type" ? vPlural("activity_type") : vPlural("enrollment");
      case "activity": {
        const cat = categories.find((c) => c.key === activeKey);
        if (cat) return `Activity: ${cat.name} (all types)`;
        const at = activityTypes.find((t) => t.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") === activeKey);
        return at ? `Activity: ${at.name}` : activeKey;
      }
      case "participant": {
        const cat = categories.find((c) => c.key === activeKey);
        if (cat) return `Participant: ${cat.name} (all types)`;
        const at = activityTypes.find((t) => t.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") === activeKey);
        return at ? `Participant: ${at.name}` : activeKey;
      }
      default: return "";
    }
  }, [activeSection, activeKey, entityTypesList, nonSystemDimensions, categories, activityTypes, vPlural, vDim]);

  // Section pills
  const sections: { key: SectionKind; label: string }[] = [
    { key: "entity", label: "Entity types" },
    { key: "dimension", label: "Dimensions" },
    { key: "other", label: "Other" },
    { key: "activity", label: "Activity fields" },
    { key: "participant", label: "Participant fields" },
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
                key={et.key}
                onClick={() => setActiveKey(et.key)}
                className={`px-3 py-1 text-sm rounded-md whitespace-nowrap transition-colors ${
                  activeKey === et.key
                    ? "bg-purple-50 text-purple-700 border border-purple-200 font-medium"
                    : "bg-white text-gray-600 border border-gray-200 hover:border-gray-300"
                }`}
              >
                {et.name}
                {(allSchemas[`entity:${et.key}`]?.length || 0) > 0 && (
                  <span className="ml-1 text-xs text-gray-400">
                    ({allSchemas[`entity:${et.key}`]!.length})
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
                key={d.key}
                onClick={() => setActiveKey(d.key)}
                className={`px-3 py-1 text-sm rounded-md whitespace-nowrap transition-colors ${
                  activeKey === d.key
                    ? "bg-purple-50 text-purple-700 border border-purple-200 font-medium"
                    : "bg-white text-gray-600 border border-gray-200 hover:border-gray-300"
                }`}
              >
                {vDim(d)}
                {(allSchemas[`dimension:${d.key}`]?.length || 0) > 0 && (
                  <span className="ml-1 text-xs text-gray-400">
                    ({allSchemas[`dimension:${d.key}`]!.length})
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

        {(activeSection === "activity" || activeSection === "participant") && (
          <div className="flex items-center gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">{v("activity_category")}</label>
              <select
                className="border rounded-md px-3 py-1.5 text-sm"
                value={categories.find((c) => c.key === activeKey) ? activeKey : ""}
                onChange={(e) => setActiveKey(e.target.value)}
              >
                {categories.map((cat) => (
                  <option key={cat.key} value={cat.key}>
                    {cat.name} (all types)
                  </option>
                ))}
              </select>
            </div>
            <span className="text-gray-300 mt-4">or</span>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Specific {v("activity_type")}</label>
              <select
                className="border rounded-md px-3 py-1.5 text-sm"
                value={categories.find((c) => c.key === activeKey) ? "" : activeKey}
                onChange={(e) => setActiveKey(e.target.value)}
              >
                <option value="">Select a type...</option>
                {activityTypes.map((at) => {
                  const typeKey = at.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
                  return (
                    <option key={at.id} value={typeKey}>
                      {at.name}
                    </option>
                  );
                })}
              </select>
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
                  <TableHead>Key</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Required</TableHead>
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
                    <TableCell className="text-gray-500 text-xs font-mono">{field.key}</TableCell>
                    <TableCell>
                      {FIELD_TYPES.find((ft) => ft.value === field.type)?.label || field.type}
                    </TableCell>
                    <TableCell>{field.required ? "Yes" : "No"}</TableCell>
                    <TableCell>
                      {field.options?.length ? field.options.join(", ") : "—"}
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
          <div>
            <Label htmlFor="field-key">
              Key <span className="text-gray-400 text-xs font-normal">(auto-generated if empty)</span>
            </Label>
            <Input
              id="field-key"
              value={fieldForm.key}
              onChange={(e) => setFieldForm({ ...fieldForm, key: e.target.value })}
              placeholder="e.g. nationality"
              className="font-mono text-sm"
            />
          </div>
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
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
            <Button type="submit">{editingIndex !== null ? "Save" : "Add"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
