"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { programmeApi, metaFieldSchemaApi } from "@/services/api";
import { Programme, MetaFieldDefinition } from "@/types";
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

export default function ProgrammesPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Programme | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [metaValues, setMetaValues] = useState<Record<string, unknown>>({});

  const { data: programmes = [], isLoading } = useQuery({
    queryKey: ["programmes"],
    queryFn: programmeApi.list,
  });

  const { data: metaFields = [] } = useQuery<MetaFieldDefinition[]>({
    queryKey: ["meta-field-schemas", "programme"],
    queryFn: () => metaFieldSchemaApi.get("programme"),
  });

  const createMutation = useMutation({
    mutationFn: programmeApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programmes"] });
      closeModal();
      toast.success("Programme created");
    },
    onError: () => toast.error("Failed to create programme"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Programme> }) =>
      programmeApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programmes"] });
      closeModal();
      toast.success("Programme updated");
    },
    onError: () => toast.error("Failed to update programme"),
  });

  const deleteMutation = useMutation({
    mutationFn: programmeApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programmes"] });
      toast.success("Programme deleted");
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", description: "" });
    setMetaValues({});
    setModalOpen(true);
  };

  const openEdit = (item: Programme) => {
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
        <h2 className="text-lg font-semibold">Programmes</h2>
        <Can permission="programme:manage">
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Add Programme
          </Button>
        </Can>
      </div>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : programmes.length === 0 ? (
        <p className="text-gray-500 text-sm">No programmes yet.</p>
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
            {programmes.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.name}</TableCell>
                <TableCell>{p.description || "—"}</TableCell>
                {metaFields.map((f) => (
                  <TableCell key={f.key}>
                    {p.meta?.[f.key] !== undefined
                      ? String(p.meta[f.key])
                      : "—"}
                  </TableCell>
                ))}
                <TableCell>
                  <Can permission="programme:manage">
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(p)}
                        className="text-gray-400 hover:text-purple-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Delete this programme?"))
                            deleteMutation.mutate(p.id);
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
        title={editing ? "Edit Programme" : "Add Programme"}
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
