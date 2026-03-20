"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { activityTypeApi } from "@/services/api";
import { ActivityType } from "@/types";
import { Can } from "@/components/Auth/Permissions";
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
import { PageHeader } from "@/components/ui/page-header";
import { PageContent } from "@/components/ui/page-content";
import { Plus, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

export default function ActivityTypesPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ActivityType | null>(null);
  const [form, setForm] = useState({ name: "" });

  const { data: activityTypes = [], isLoading } = useQuery({
    queryKey: ["activity-types"],
    queryFn: activityTypeApi.list,
  });

  const createMutation = useMutation({
    mutationFn: activityTypeApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-types"] });
      closeModal();
      toast.success("Activity Type created");
    },
    onError: () => toast.error("Failed to create activity type"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof activityTypeApi.update>[1] }) =>
      activityTypeApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-types"] });
      closeModal();
      toast.success("Activity Type updated");
    },
    onError: () => toast.error("Failed to update activity type"),
  });

  const deleteMutation = useMutation({
    mutationFn: activityTypeApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-types"] });
      toast.success("Activity Type deleted");
    },
    onError: () => toast.error("Failed to delete — it may have activities"),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "" });
    setModalOpen(true);
  };

  const openEdit = (item: ActivityType) => {
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
      <PageHeader
        title="Activity Types"
        actions={
          <Can permission="activity_type:manage">
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Add Activity Type
            </Button>
          </Can>
        }
      />
      <PageContent>
      <p className="text-sm text-gray-500 mb-4">
        Activity types define the structural type of an activity. Use the{" "}
        <a href="/admin/form-builder" className="text-purple-600 underline">
          Form Builder
        </a>{" "}
        to configure what appears when recording an activity.
      </p>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : activityTypes.length === 0 ? (
        <p className="text-gray-500 text-sm">No activity types yet.</p>
      ) : (
        <div className="bg-white shadow-sm border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead className="w-20 text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activityTypes.map((at) => (
              <TableRow key={at.id}>
                <TableCell className="font-medium">{at.name}</TableCell>
                <TableCell className="text-gray-400 text-sm font-mono">{at.key}</TableCell>
                <TableCell>
                  <Can permission="activity_type:manage">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => openEdit(at)}
                        className="text-gray-400 hover:text-purple-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Delete this activity type?"))
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
        </div>
      )}

      <Dialog
        open={modalOpen}
        onClose={closeModal}
        title={editing ? "Edit Activity Type" : "Add Activity Type"}
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
      </PageContent>
    </>
  );
}
