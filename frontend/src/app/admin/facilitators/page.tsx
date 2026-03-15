"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { facilitatorApi, metaFieldSchemaApi } from "@/services/api";
import { Facilitator, MetaFieldDefinition } from "@/types";
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

export default function FacilitatorsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Facilitator | null>(null);
  const [form, setForm] = useState({ name: "", contact: "" });
  const [metaValues, setMetaValues] = useState<Record<string, unknown>>({});

  const { data: facilitators = [], isLoading } = useQuery({
    queryKey: ["facilitators"],
    queryFn: facilitatorApi.list,
  });

  const { data: metaFields = [] } = useQuery<MetaFieldDefinition[]>({
    queryKey: ["meta-field-schemas", "facilitator"],
    queryFn: () => metaFieldSchemaApi.get("facilitator"),
  });

  const createMutation = useMutation({
    mutationFn: facilitatorApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["facilitators"] });
      closeModal();
      toast.success("Facilitator created");
    },
    onError: () => toast.error("Failed to create facilitator"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Facilitator> }) =>
      facilitatorApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["facilitators"] });
      closeModal();
      toast.success("Facilitator updated");
    },
    onError: () => toast.error("Failed to update facilitator"),
  });

  const deleteMutation = useMutation({
    mutationFn: facilitatorApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["facilitators"] });
      toast.success("Facilitator deleted");
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", contact: "" });
    setMetaValues({});
    setModalOpen(true);
  };

  const openEdit = (item: Facilitator) => {
    setEditing(item);
    setForm({ name: item.name, contact: item.contact || "" });
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
        <h2 className="text-lg font-semibold">Facilitators</h2>
        <Can permission="facilitator:manage">
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Add Facilitator
          </Button>
        </Can>
      </div>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : facilitators.length === 0 ? (
        <p className="text-gray-500 text-sm">No facilitators yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              {metaFields.map((f) => (
                <TableHead key={f.key}>{f.label}</TableHead>
              ))}
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {facilitators.map((f) => (
              <TableRow key={f.id}>
                <TableCell>{f.name}</TableCell>
                <TableCell>{f.contact || "—"}</TableCell>
                {metaFields.map((mf) => (
                  <TableCell key={mf.key}>
                    {f.meta?.[mf.key] !== undefined
                      ? String(f.meta[mf.key])
                      : "—"}
                  </TableCell>
                ))}
                <TableCell>
                  <Can permission="facilitator:manage">
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(f)}
                        className="text-gray-400 hover:text-purple-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Delete this facilitator?"))
                            deleteMutation.mutate(f.id);
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
        title={editing ? "Edit Facilitator" : "Add Facilitator"}
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
            <Label htmlFor="contact">Contact</Label>
            <Input
              id="contact"
              value={form.contact}
              onChange={(e) => setForm({ ...form, contact: e.target.value })}
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
