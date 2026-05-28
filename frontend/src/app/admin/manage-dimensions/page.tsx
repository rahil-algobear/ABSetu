"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dimensionApi } from "@/services/api";
import { Dimension } from "@/types";
import { Can, usePermissions } from "@/components/Auth/Permissions";

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

export default function ManageDimensionsPage() {
  const { can } = usePermissions();
  const canManage = can("dimension:manage");
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Dimension | null>(null);
  const [form, setForm] = useState({ name: "", controls_access: true });

  const { data: dimensions = [], isLoading } = useQuery<Dimension[]>({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
  });

  const manageable = dimensions;

  const createMutation = useMutation({
    mutationFn: dimensionApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dimensions"] });
      closeModal();
      toast.success("Dimension created");
    },
    onError: () => toast.error("Failed to create dimension"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string; controls_access: boolean } }) =>
      dimensionApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dimensions"] });
      closeModal();
      toast.success("Dimension updated");
    },
    onError: () => toast.error("Failed to update dimension"),
  });

  const deleteMutation = useMutation({
    mutationFn: dimensionApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dimensions"] });
      toast.success("Dimension deleted");
    },
    onError: () => toast.error("Failed to delete — it may have values or linked data"),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", controls_access: true });
    setModalOpen(true);
  };

  const openEdit = (dim: Dimension) => {
    setEditing(dim);
    setForm({ name: dim.name, controls_access: dim.controls_access });
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
        data: { name: form.name, controls_access: form.controls_access },
      });
    } else {
      createMutation.mutate({ name: form.name, controls_access: form.controls_access });
    }
  };

  return (
    <>
      <PageHeader
        title="Dimensions"
        description="Dimensions define how your organization scopes data for access control and reporting (e.g. Location, Programme, Funder). Each dimension has values that can be assigned to activities, entities, and enrollments."
        actions={
          <Can permission="dimension:manage">
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Add Dimension
            </Button>
          </Can>
        }
      />
      <PageContent>
      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : manageable.length === 0 ? (
        <p className="text-gray-500 text-sm">No dimensions yet.</p>
      ) : (
        <div className="bg-white shadow-sm border rounded-lg overflow-hidden">
        <Table stickyRows={1} className="max-h-[calc(100vh-400px)] lg:max-h-[calc(100vh-200px)]">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Values</TableHead>
              <TableHead>Access Control</TableHead>
              {canManage && <TableHead className="w-20 text-center">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {manageable.map((dim) => (
              <DimensionRow
                key={dim.id}
                dimension={dim}
                showActions={canManage}
                onEdit={() => openEdit(dim)}
                onDelete={() => {
                  if (confirm(`Delete dimension "${dim.name}"? This will remove all its values and linked data.`))
                    deleteMutation.mutate(dim.id);
                }}
              />
            ))}
          </TableBody>
        </Table>
        </div>
      )}

      <Dialog
        open={modalOpen}
        onClose={closeModal}
        title={editing ? "Edit Dimension" : "Add Dimension"}
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="dim-name">Name</Label>
            <Input
              id="dim-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Funder"
              required
            />
          </div>
          <div className="flex items-start gap-2 pt-1">
            <input
              id="dim-controls-access"
              type="checkbox"
              className="mt-1 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              checked={form.controls_access}
              onChange={(e) => setForm({ ...form, controls_access: e.target.checked })}
            />
            <div>
              <Label htmlFor="dim-controls-access" className="cursor-pointer">
                Use for access control
              </Label>
              <p className="text-xs text-gray-500 mt-0.5">
                Lets you use this dimension for giving users selective access within your organisation.
              </p>
            </div>
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

/** Row component that fetches the value count for a dimension */
function DimensionRow({
  dimension,
  showActions,
  onEdit,
  onDelete,
}: {
  dimension: Dimension;
  showActions: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { data: values = [] } = useQuery({
    queryKey: ["dimension-values", dimension.id],
    queryFn: () => dimensionApi.listValues(dimension.id),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <TableRow>
      <TableCell className="font-medium">{dimension.name}</TableCell>
      <TableCell className="text-gray-500">{values.length}</TableCell>
      <TableCell>
        {dimension.controls_access ? (
          <span className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
            Yes
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            No
          </span>
        )}
      </TableCell>
      {showActions && (
        <TableCell>
          <div className="flex items-center justify-center gap-2">
            <button onClick={onEdit} className="text-gray-400 hover:text-purple-600">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={onDelete} className="text-gray-400 hover:text-red-500">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}
