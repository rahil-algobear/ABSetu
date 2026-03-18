"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { activityCategoryApi, entityTypeApi } from "@/services/api";
import { ActivityCategory, EntityType } from "@/types";
import { Can } from "@/components/Auth/Permissions";
import { useVocabulary } from "@/hooks/useVocabulary";
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
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";

interface SectionConfig {
  key: string;
  label: string;
  participant_source: string;
  selection_mode: string;
  min_count?: number | null;
  max_count?: number | null;
  capture_status: boolean;
  statuses: string[];
  default_status?: string | null;
}

const emptySectionConfig: SectionConfig = {
  key: "",
  label: "",
  participant_source: "",
  selection_mode: "multi_select",
  capture_status: false,
  statuses: [],
  default_status: null,
};

const SELECTION_MODES = [
  { value: "multi_select", label: "Multi-select (checkboxes)" },
  { value: "enrolled_checklist", label: "Enrolled checklist (attendance)" },
  { value: "single_select", label: "Single select" },
];

export default function ActivityCategoriesPage() {
  const queryClient = useQueryClient();
  const { v, vPlural } = useVocabulary();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ActivityCategory | null>(null);
  const [form, setForm] = useState({ name: "", key: "" });
  const [sections, setSections] = useState<SectionConfig[]>([]);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["activity-categories"],
    queryFn: activityCategoryApi.list,
  });

  const { data: entityTypes = [] } = useQuery<EntityType[]>({
    queryKey: ["entity-types"],
    queryFn: entityTypeApi.list,
  });

  // Build participant source options from entity types + "user"
  const participantSources = [
    ...entityTypes.map((et) => ({
      value: `entity_type:${et.key}`,
      label: et.name,
    })),
    { value: "user", label: "Users (staff)" },
  ];

  const createMutation = useMutation({
    mutationFn: activityCategoryApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-categories"] });
      closeModal();
      toast.success(`${v("activity_category")} created`);
    },
    onError: () => toast.error(`Failed to create ${v("activity_category").toLowerCase()}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof activityCategoryApi.update>[1] }) =>
      activityCategoryApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-categories"] });
      closeModal();
      toast.success(`${v("activity_category")} updated`);
    },
    onError: () => toast.error(`Failed to update ${v("activity_category").toLowerCase()}`),
  });

  const deleteMutation = useMutation({
    mutationFn: activityCategoryApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-categories"] });
      toast.success(`${v("activity_category")} deleted`);
    },
    onError: () => toast.error("Failed to delete — it may have activity types"),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", key: "" });
    setSections([]);
    setModalOpen(true);
  };

  const openEdit = (item: ActivityCategory) => {
    setEditing(item);
    setForm({ name: item.name, key: item.key });
    setSections(
      (item.sections as SectionConfig[] | null)?.map((s) => ({
        ...emptySectionConfig,
        ...s,
        statuses: s.statuses || [],
      })) || []
    );
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedSections = sections.map((s) => ({
      ...s,
      statuses: s.capture_status ? s.statuses : [],
      default_status: s.capture_status ? s.default_status : null,
    }));

    if (editing) {
      updateMutation.mutate({
        id: editing.id,
        data: { name: form.name, sections: cleanedSections },
      });
    } else {
      createMutation.mutate({
        name: form.name,
        key: form.key,
        sections: cleanedSections,
      });
    }
  };

  const addSection = () => {
    setSections([...sections, { ...emptySectionConfig }]);
  };

  const updateSection = (index: number, updates: Partial<SectionConfig>) => {
    setSections(sections.map((s, i) => (i === index ? { ...s, ...updates } : s)));
  };

  const removeSection = (index: number) => {
    setSections(sections.filter((_, i) => i !== index));
  };

  const moveSection = (index: number, direction: "up" | "down") => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= sections.length) return;
    const updated = [...sections];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    setSections(updated);
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{vPlural("activity_category")}</h2>
        <Can permission="activity_type:manage">
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Add {v("activity_category")}
          </Button>
        </Can>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Activity categories define the structure of a session — which participant
        sections appear, what selection mode to use, and whether to capture attendance status.
      </p>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : categories.length === 0 ? (
        <p className="text-gray-500 text-sm">No {vPlural("activity_category").toLowerCase()} yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Sections</TableHead>
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((cat) => (
              <TableRow key={cat.id}>
                <TableCell className="font-medium">{cat.name}</TableCell>
                <TableCell className="text-gray-500 text-sm font-mono">{cat.key}</TableCell>
                <TableCell>
                  {(cat.sections as SectionConfig[] | null)?.length ? (
                    <div className="flex flex-wrap gap-1">
                      {(cat.sections as SectionConfig[]).map((s) => (
                        <span
                          key={s.key}
                          className="inline-block text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full"
                        >
                          {s.label}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-400 text-sm">No sections</span>
                  )}
                </TableCell>
                <TableCell>
                  <Can permission="activity_type:manage">
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(cat)}
                        className="text-gray-400 hover:text-purple-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete this ${v("activity_category").toLowerCase()}?`))
                            deleteMutation.mutate(cat.id);
                        }}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </Can>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={modalOpen}
        onClose={closeModal}
        title={editing ? `Edit ${v("activity_category")}` : `Add ${v("activity_category")}`}
        className="max-w-2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            {!editing && (
              <div>
                <Label htmlFor="key">Key</Label>
                <Input
                  id="key"
                  value={form.key}
                  onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
                  required
                  placeholder="e.g. sessions"
                  className="font-mono text-sm"
                />
              </div>
            )}
          </div>

          {/* Sections builder */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-semibold">Participant Sections</Label>
              <Button type="button" size="sm" variant="outline" onClick={addSection}>
                <Plus className="h-3 w-3 mr-1" />
                Add Section
              </Button>
            </div>

            {sections.length === 0 ? (
              <p className="text-gray-400 text-sm border rounded-md p-4 text-center">
                No sections yet. Add a section to define how participants are recorded.
              </p>
            ) : (
              <div className="space-y-3">
                {sections.map((section, idx) => (
                  <div key={idx} className="border rounded-lg p-3 space-y-3 bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-1 text-gray-400">
                        <div className="flex flex-col -space-y-1">
                          <button
                            type="button"
                            onClick={() => moveSection(idx, "up")}
                            disabled={idx === 0}
                            className="text-gray-400 hover:text-purple-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveSection(idx, "down")}
                            disabled={idx === sections.length - 1}
                            className="text-gray-400 hover:text-purple-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        </div>
                        <span className="text-xs font-medium">Section {idx + 1}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSection(idx)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Label</Label>
                        <Input
                          value={section.label}
                          onChange={(e) => {
                            const label = e.target.value;
                            const key = section.key || label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
                            updateSection(idx, { label, key });
                          }}
                          placeholder="e.g. Beneficiaries"
                          required
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Key</Label>
                        <Input
                          value={section.key}
                          onChange={(e) => updateSection(idx, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
                          placeholder="auto-generated"
                          className="font-mono text-sm"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Participant Source</Label>
                        <select
                          className="w-full border rounded-md p-2 text-sm"
                          value={section.participant_source}
                          onChange={(e) => updateSection(idx, { participant_source: e.target.value })}
                          required
                        >
                          <option value="">Select source...</option>
                          {participantSources.map((ps) => (
                            <option key={ps.value} value={ps.value}>{ps.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs">Selection Mode</Label>
                        <select
                          className="w-full border rounded-md p-2 text-sm"
                          value={section.selection_mode}
                          onChange={(e) => updateSection(idx, { selection_mode: e.target.value })}
                        >
                          {SELECTION_MODES.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={section.capture_status}
                          onCheckedChange={(checked) => updateSection(idx, {
                            capture_status: checked,
                            statuses: checked && section.statuses.length === 0 ? ["present", "absent"] : section.statuses,
                            default_status: checked && !section.default_status ? "present" : section.default_status,
                          })}
                        />
                        <Label className="text-xs">Capture attendance status</Label>
                      </div>

                      {section.capture_status && (
                        <div className="grid grid-cols-2 gap-3 pl-6">
                          <div>
                            <Label className="text-xs">
                              Statuses <span className="text-gray-400 font-normal">(comma-separated)</span>
                            </Label>
                            <Input
                              value={section.statuses.join(", ")}
                              onChange={(e) => updateSection(idx, {
                                statuses: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                              })}
                              placeholder="present, absent"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Default Status</Label>
                            <select
                              className="w-full border rounded-md p-2 text-sm"
                              value={section.default_status || ""}
                              onChange={(e) => updateSection(idx, { default_status: e.target.value || null })}
                            >
                              <option value="">None</option>
                              {section.statuses.map((st) => (
                                <option key={st} value={st}>{st}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit">{editing ? "Save" : "Create"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
