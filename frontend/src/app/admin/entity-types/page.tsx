"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { entityTypeApi } from "@/services/api";
import { EntityType } from "@/types";
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

export default function EntityTypesPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EntityType | null>(null);
  const [form, setForm] = useState({ name: "", can_enroll: true });

  const { data: entityTypes = [], isLoading } = useQuery({
    queryKey: ["entity-types"],
    queryFn: entityTypeApi.list,
  });

  const createMutation = useMutation({
    mutationFn: entityTypeApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entity-types"] });
      closeModal();
      toast.success("Entity Type created");
    },
    onError: () => toast.error("Failed to create entity type"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof entityTypeApi.update>[1] }) =>
      entityTypeApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entity-types"] });
      closeModal();
      toast.success("Entity Type updated");
    },
    onError: () => toast.error("Failed to update entity type"),
  });

  const deleteMutation = useMutation({
    mutationFn: entityTypeApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entity-types"] });
      toast.success("Entity Type deleted");
    },
    onError: () => toast.error(`Failed to delete — it may have entities`),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", can_enroll: false });
    setModalOpen(true);
  };

  const openEdit = (item: EntityType) => {
    setEditing(item);
    setForm({
      name: item.name,
      can_enroll: item.can_enroll,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      updateMutation.mutate({
        id: editing.id,
        data: { name: form.name, can_enroll: form.can_enroll },
      });
    } else {
      createMutation.mutate({ name: form.name, can_enroll: form.can_enroll });
    }
  };

  return (
    <>
      <PageHeader
        title="Entity Types"
        actions={
          <Can permission="entity_type:manage">
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Add Entity Type
            </Button>
          </Can>
        }
      />
      <PageContent>
      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : entityTypes.length === 0 ? (
        <p className="text-gray-500 text-sm">No entity types yet.</p>
      ) : (
        <div className="bg-white shadow-sm border rounded-lg overflow-hidden">
        <Table stickyRows={1} className="max-h-[calc(100vh-400px)] lg:max-h-[calc(100vh-300px)]">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Enrollable</TableHead>
              <TableHead className="w-20 text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entityTypes.map((et) => {
              return (
                <TableRow key={et.id}>
                  <TableCell>{et.name}</TableCell>
                  <TableCell>{et.can_enroll ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    <Can permission="entity_type:manage">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEdit(et)}
                          className="text-gray-400 hover:text-purple-600"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("Delete this entity type?"))
                              deleteMutation.mutate(et.id);
                          }}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </Can>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
      )}

      <Dialog
        open={modalOpen}
        onClose={closeModal}
        title={editing ? "Edit Entity Type" : "Add Entity Type"}
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
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="can_enroll"
              checked={form.can_enroll}
              onChange={(e) => setForm({ ...form, can_enroll: e.target.checked })}
            />
            <Label htmlFor="can_enroll">Enable Enrolments</Label>
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
