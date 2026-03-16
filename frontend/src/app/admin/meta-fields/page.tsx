"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { metaFieldSchemaApi, dimensionApi } from "@/services/api";
import {
  MetaFieldDefinition,
  MetaFieldSchemas,
  MetaFieldType,
  Dimension,
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

// Static entity types
const STATIC_ENTITY_TYPES = [
  { value: "activity_type", label: "Activity Types" },
  { value: "facilitator", label: "Facilitators" },
  { value: "beneficiary", label: "Beneficiaries" },
  { value: "enrollment", label: "Enrollments" },
  { value: "activity", label: "Activities" },
  { value: "participation", label: "Participations" },
];

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

export default function MetaFieldsPage() {
  const queryClient = useQueryClient();
  const [selectedEntity, setSelectedEntity] = useState<string>("beneficiary");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [fieldForm, setFieldForm] = useState<MetaFieldDefinition>({ ...emptyField });
  const [optionsText, setOptionsText] = useState("");

  const { data: dimensions = [] } = useQuery<Dimension[]>({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
  });

  // Build the full entity type list: static + dimension:{key}
  const entityTypes = [
    ...STATIC_ENTITY_TYPES,
    ...dimensions.map((d) => ({
      value: `dimension:${d.key}`,
      label: d.name,
    })),
  ];

  const { data: allSchemas = {} as MetaFieldSchemas } = useQuery<MetaFieldSchemas>({
    queryKey: ["meta-field-schemas"],
    queryFn: metaFieldSchemaApi.getAll,
  });

  const fields = allSchemas[selectedEntity] || [];

  const updateMutation = useMutation({
    mutationFn: (newFields: MetaFieldDefinition[]) =>
      metaFieldSchemaApi.update(selectedEntity, newFields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meta-field-schemas"] });
      toast.success("Custom fields updated");
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

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Custom Fields</h2>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Define custom fields for each entity type. These fields appear in
        create/edit forms and are stored as metadata.
      </p>

      {/* Entity type selector */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {entityTypes.map((et) => (
          <button
            key={et.value}
            onClick={() => setSelectedEntity(et.value)}
            className={`px-3 py-1.5 text-sm rounded-full whitespace-nowrap transition-colors ${
              selectedEntity === et.value
                ? "bg-purple-100 text-purple-700 font-medium"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {et.label}
            {(allSchemas[et.value]?.length || 0) > 0 && (
              <span className="ml-1 text-xs">
                ({allSchemas[et.value]!.length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Fields table */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-gray-700">
          Fields for{" "}
          {entityTypes.find((e) => e.value === selectedEntity)?.label}
        </p>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1" />
          Add Field
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="text-gray-500 text-sm">
          No custom fields defined yet for this entity type.
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

      {/* Add/Edit field modal */}
      <Dialog
        open={modalOpen}
        onClose={closeModal}
        title={editingIndex !== null ? "Edit Field" : "Add Custom Field"}
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
