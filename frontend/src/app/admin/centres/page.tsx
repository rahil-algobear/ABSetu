"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { centerApi, metaFieldSchemaApi } from "@/services/api";
import { Center, MetaFieldDefinition } from "@/types";
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

export default function CentresPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Center | null>(null);
  const [form, setForm] = useState({ name: "", code: "", address: "" });
  const [metaValues, setMetaValues] = useState<Record<string, unknown>>({});

  const { data: centres = [], isLoading } = useQuery({
    queryKey: ["centers"],
    queryFn: centerApi.list,
  });

  const { data: metaFields = [] } = useQuery<MetaFieldDefinition[]>({
    queryKey: ["meta-field-schemas", "centre"],
    queryFn: () => metaFieldSchemaApi.get("centre"),
  });

  const createMutation = useMutation({
    mutationFn: centerApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["centers"] });
      closeModal();
      toast.success("Centre created");
    },
    onError: () => toast.error("Failed to create centre"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Center> }) =>
      centerApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["centers"] });
      closeModal();
      toast.success("Centre updated");
    },
    onError: () => toast.error("Failed to update centre"),
  });

  const deleteMutation = useMutation({
    mutationFn: centerApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["centers"] });
      toast.success("Centre deleted");
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", code: "", address: "" });
    setMetaValues({});
    setModalOpen(true);
  };

  const openEdit = (item: Center) => {
    setEditing(item);
    setForm({ name: item.name, code: item.code, address: item.address || "" });
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
        <h2 className="text-lg font-semibold">Centres</h2>
        <Can permission="center:manage">
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Add Centre
          </Button>
        </Can>
      </div>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : centres.length === 0 ? (
        <p className="text-gray-500 text-sm">No centres yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Address</TableHead>
              {metaFields.map((f) => (
                <TableHead key={f.key}>{f.label}</TableHead>
              ))}
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {centres.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.name}</TableCell>
                <TableCell>{c.code}</TableCell>
                <TableCell>{c.address || "—"}</TableCell>
                {metaFields.map((f) => (
                  <TableCell key={f.key}>
                    {c.meta?.[f.key] !== undefined
                      ? String(c.meta[f.key])
                      : "—"}
                  </TableCell>
                ))}
                <TableCell>
                  <Can permission="center:manage">
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(c)}
                        className="text-gray-400 hover:text-purple-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Delete this centre?"))
                            deleteMutation.mutate(c.id);
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
        title={editing ? "Edit Centre" : "Add Centre"}
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
            <Label htmlFor="code">Code</Label>
            <Input
              id="code"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
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
            <Button type="submit">
              {editing ? "Save" : "Create"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
