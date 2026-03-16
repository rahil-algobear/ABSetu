"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dimensionApi } from "@/services/api";
import { Dimension } from "@/types";
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

export default function ManageDimensionsPage() {
  const queryClient = useQueryClient();
  const { vDim } = useVocabulary();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Dimension | null>(null);
  const [form, setForm] = useState({ name: "", key: "" });

  const { data: dimensions = [], isLoading } = useQuery<Dimension[]>({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
  });

  // Only show non-system dimensions (system dimensions like activity_type are managed elsewhere)
  const manageable = dimensions.filter((d) => !d.is_system);

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
    mutationFn: ({ id, data }: { id: string; data: { name: string } }) =>
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
    setForm({ name: "", key: "" });
    setModalOpen(true);
  };

  const openEdit = (dim: Dimension) => {
    setEditing(dim);
    setForm({ name: dim.name, key: dim.key });
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
      const key = form.key || form.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
      createMutation.mutate({ name: form.name, key });
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Dimensions</h2>
        <Can permission="dimension:manage">
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Add Dimension
          </Button>
        </Can>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Dimensions define how your organization scopes data for access control and reporting
        (e.g. Location, Programme, Funder). Each dimension has values that can be assigned to
        activities, entities, and enrollments.
      </p>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : manageable.length === 0 ? (
        <p className="text-gray-500 text-sm">No dimensions yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Values</TableHead>
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {manageable.map((dim) => (
              <DimensionRow
                key={dim.id}
                dimension={dim}
                vDim={vDim}
                onEdit={() => openEdit(dim)}
                onDelete={() => {
                  if (confirm(`Delete dimension "${vDim(dim)}"? This will remove all its values and linked data.`))
                    deleteMutation.mutate(dim.id);
                }}
              />
            ))}
          </TableBody>
        </Table>
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
          {!editing && (
            <div>
              <Label htmlFor="dim-key">Key</Label>
              <Input
                id="dim-key"
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
                placeholder="e.g. funder"
                className="font-mono text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">
                Auto-generated from name if left empty. Immutable after creation.
              </p>
            </div>
          )}
          {editing && (
            <p className="text-xs text-gray-400">
              Key: <span className="font-mono">{editing.key}</span> (immutable)
            </p>
          )}
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

/** Row component that fetches the value count for a dimension */
function DimensionRow({
  dimension,
  vDim,
  onEdit,
  onDelete,
}: {
  dimension: Dimension;
  vDim: (d: Dimension) => string;
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
      <TableCell className="font-medium">{vDim(dimension)}</TableCell>
      <TableCell className="text-gray-500 text-sm font-mono">{dimension.key}</TableCell>
      <TableCell className="text-gray-500">{values.length}</TableCell>
      <TableCell>
        <Can permission="dimension:manage">
          <div className="flex gap-1">
            <button onClick={onEdit} className="text-gray-400 hover:text-purple-600">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={onDelete} className="text-gray-400 hover:text-red-500">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </Can>
      </TableCell>
    </TableRow>
  );
}
