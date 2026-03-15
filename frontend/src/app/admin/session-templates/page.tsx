"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sessionTemplateApi, metaFieldSchemaApi } from "@/services/api";
import { SessionTemplate, MetaFieldDefinition } from "@/types";
import { Can } from "@/components/Auth/Permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { DynamicMetaForm } from "@/components/DynamicMetaForm";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/page-table";
import { Plus, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

export default function SessionTemplatesPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SessionTemplate | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [metaValues, setMetaValues] = useState<Record<string, unknown>>({});

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["session-templates"],
    queryFn: sessionTemplateApi.list,
  });

  const { data: metaFields = [] } = useQuery<MetaFieldDefinition[]>({
    queryKey: ["meta-field-schemas", "session_template"],
    queryFn: () => metaFieldSchemaApi.get("session_template"),
  });

  const createMutation = useMutation({
    mutationFn: sessionTemplateApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session-templates"] });
      closeModal();
      toast.success("Template created");
    },
    onError: () => toast.error("Failed to create template"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<SessionTemplate> }) =>
      sessionTemplateApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session-templates"] });
      closeModal();
      toast.success("Template updated");
    },
    onError: () => toast.error("Failed to update template"),
  });

  const deleteMutation = useMutation({
    mutationFn: sessionTemplateApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session-templates"] });
      toast.success("Template deleted");
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", description: "" });
    setMetaValues({});
    setModalOpen(true);
  };

  const openEdit = (item: SessionTemplate) => {
    setEditing(item);
    setForm({ name: item.name, description: item.description || "" });
    setMetaValues(item.meta || {});
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const meta = Object.keys(metaValues).length > 0 ? metaValues : undefined;
    if (editing) {
      updateMutation.mutate({
        id: editing.id,
        data: { ...form, meta: meta || null },
      });
    } else {
      createMutation.mutate({ ...form, meta });
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Session Templates</h2>
        <Can permission="session_template:manage">
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Add Template
          </Button>
        </Can>
      </div>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : templates.length === 0 ? (
        <p className="text-gray-500 text-sm">No session templates yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              {metaFields.map((f) => (
                <TableHead key={f.key}>{f.label}</TableHead>
              ))}
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.name}</TableCell>
                <TableCell>{t.description || "—"}</TableCell>
                {metaFields.map((f) => (
                  <TableCell key={f.key}>
                    {t.meta?.[f.key] !== undefined
                      ? String(t.meta[f.key])
                      : "—"}
                  </TableCell>
                ))}
                <TableCell>
                  <Can permission="session_template:manage">
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(t)}
                        className="text-gray-400 hover:text-purple-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Delete this template?"))
                            deleteMutation.mutate(t.id);
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
        title={editing ? "Edit Template" : "Add Session Template"}
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </div>
          <DynamicMetaForm
            fields={metaFields}
            values={metaValues}
            onChange={setMetaValues}
          />
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
