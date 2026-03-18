"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { activityCategoryApi } from "@/services/api";
import { ActivityCategory } from "@/types";
import { Can } from "@/components/Auth/Permissions";
import { useVocabulary } from "@/hooks/useVocabulary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
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

export default function ActivityCategoriesPage() {
  const queryClient = useQueryClient();
  const { v, vPlural } = useVocabulary();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ActivityCategory | null>(null);
  const [form, setForm] = useState({ name: "" });

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["activity-categories"],
    queryFn: activityCategoryApi.list,
  });

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
    setForm({ name: "" });
    setModalOpen(true);
  };

  const openEdit = (item: ActivityCategory) => {
    setEditing(item);
    setForm({ name: item.name });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: { name: form.name } });
    } else {
      createMutation.mutate({ name: form.name });
    }
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
        Activity categories group activity types. Use the{" "}
        <a href="/admin/form-builder" className="text-purple-600 underline">
          Form Builder
        </a>{" "}
        to configure what appears when recording an activity.
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
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((cat) => (
              <TableRow key={cat.id}>
                <TableCell className="font-medium">{cat.name}</TableCell>
                <TableCell className="text-gray-400 text-sm font-mono">{cat.key}</TableCell>
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
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
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
