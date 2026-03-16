"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { activityTypeApi, metaFieldSchemaApi } from "@/services/api";
import { ActivityType, MetaFieldDefinition } from "@/types";
import { Can } from "@/components/Auth/Permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { DynamicMetaForm, MetaFieldDisplay } from "@/components/DynamicMetaForm";
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

export default function ActivityTypesPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ActivityType | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [metaValues, setMetaValues] = useState<Record<string, unknown>>({});

  const { data: types = [], isLoading } = useQuery({
    queryKey: ["activity-types"],
    queryFn: activityTypeApi.list,
  });

  const { data: metaFields = [] } = useQuery<MetaFieldDefinition[]>({
    queryKey: ["meta-field-schemas", "activity_type"],
    queryFn: () => metaFieldSchemaApi.get("activity_type"),
  });

  const createMutation = useMutation({
    mutationFn: activityTypeApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-types"] });
      closeModal();
      toast.success("Activity type created");
    },
    onError: () => toast.error("Failed to create"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ActivityType> }) =>
      activityTypeApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-types"] });
      closeModal();
      toast.success("Activity type updated");
    },
    onError: () => toast.error("Failed to update"),
  });

  const deleteMutation = useMutation({
    mutationFn: activityTypeApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-types"] });
      toast.success("Activity type deleted");
    },
    onError: () => toast.error("Failed to delete"),
  });

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", description: "" });
    setMetaValues({});
    setModalOpen(true);
  };

  const openEdit = (at: ActivityType) => {
    setEditing(at);
    setForm({ name: at.name, description: at.description || "" });
    setMetaValues(at.meta || {});
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
      updateMutation.mutate({ id: editing.id, data: { ...form, meta } as Partial<ActivityType> });
    } else {
      createMutation.mutate({ ...form, meta });
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Activity Types</h2>
        <Can permission="activity_type:manage">
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </Can>
      </div>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : types.length === 0 ? (
        <p className="text-gray-500 text-sm">No activity types yet.</p>
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
            {types.map((at) => (
              <TableRow key={at.id}>
                <TableCell className="font-medium">{at.name}</TableCell>
                <TableCell className="text-gray-500 text-sm">
                  {at.description || "—"}
                </TableCell>
                {metaFields.map((f) => (
                  <TableCell key={f.key} className="text-sm">
                    <MetaFieldDisplay fields={[f]} values={at.meta || {}} />
                  </TableCell>
                ))}
                <TableCell>
                  <Can permission="activity_type:manage">
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(at)}
                        className="text-gray-400 hover:text-purple-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${at.name}"?`))
                            deleteMutation.mutate(at.id);
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
        title={editing ? "Edit Activity Type" : "Add Activity Type"}
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="at-name">Name</Label>
            <Input
              id="at-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="at-desc">Description</Label>
            <Input
              id="at-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <DynamicMetaForm fields={metaFields} values={metaValues} onChange={setMetaValues} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit">{editing ? "Save" : "Add"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
