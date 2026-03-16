"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dimensionApi } from "@/services/api";
import { Dimension, DimensionValue } from "@/types";
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
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useVocabulary } from "@/hooks/useVocabulary";
import toast from "react-hot-toast";

export default function DimensionValuesPage() {
  const params = useParams();
  const router = useRouter();
  const dimensionKey = params.key as string;
  const queryClient = useQueryClient();
  const { vDim } = useVocabulary();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingValue, setEditingValue] = useState<DimensionValue | null>(null);
  const [form, setForm] = useState({ name: "", code: "" });

  // Dimension management state
  const [dimModalOpen, setDimModalOpen] = useState(false);
  const [dimModalMode, setDimModalMode] = useState<"add" | "edit">("add");
  const [dimForm, setDimForm] = useState({ name: "", key: "" });

  const { data: dimensions = [] } = useQuery<Dimension[]>({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
  });

  const dimension = dimensions.find((d) => d.key === dimensionKey);

  const { data: values = [], isLoading } = useQuery<DimensionValue[]>({
    queryKey: ["dimension-values", dimension?.id],
    queryFn: () => dimensionApi.listValues(dimension!.id),
    enabled: !!dimension,
  });

  // Value mutations
  const createMutation = useMutation({
    mutationFn: (data: { name: string; code: string }) =>
      dimensionApi.createValue(dimension!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dimension-values", dimension?.id] });
      closeModal();
      toast.success("Value added");
    },
    onError: () => toast.error("Failed to add value"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<DimensionValue> }) =>
      dimensionApi.updateValue(dimension!.id, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dimension-values", dimension?.id] });
      closeModal();
      toast.success("Value updated");
    },
    onError: () => toast.error("Failed to update value"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => dimensionApi.deleteValue(dimension!.id, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dimension-values", dimension?.id] });
      toast.success("Value deleted");
    },
    onError: () => toast.error("Failed to delete value"),
  });

  // Dimension mutations
  const createDimMutation = useMutation({
    mutationFn: (data: { name: string; key: string }) =>
      dimensionApi.create(data),
    onSuccess: (newDim) => {
      queryClient.invalidateQueries({ queryKey: ["dimensions"] });
      setDimModalOpen(false);
      toast.success("Dimension created");
      router.push(`/admin/dimensions/${newDim.key}`);
    },
    onError: () => toast.error("Failed to create dimension"),
  });

  const updateDimMutation = useMutation({
    mutationFn: (data: { name: string }) =>
      dimensionApi.update(dimension!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dimensions"] });
      setDimModalOpen(false);
      toast.success("Dimension updated");
    },
    onError: () => toast.error("Failed to update dimension"),
  });

  const deleteDimMutation = useMutation({
    mutationFn: () => dimensionApi.delete(dimension!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dimensions"] });
      toast.success("Dimension deleted");
      // Navigate to another dimension or the index
      const remaining = dimensions.filter((d) => d.id !== dimension!.id && !d.is_system);
      if (remaining.length > 0) {
        router.push(`/admin/dimensions/${remaining[0].key}`);
      } else {
        router.push("/admin/dimensions");
      }
    },
    onError: () => toast.error("Failed to delete dimension. It may have values or linked data."),
  });

  // Value modal handlers
  const openAdd = () => {
    setEditingValue(null);
    setForm({ name: "", code: "" });
    setModalOpen(true);
  };

  const openEdit = (value: DimensionValue) => {
    setEditingValue(value);
    setForm({ name: value.name, code: value.code });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingValue(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingValue) {
      updateMutation.mutate({ id: editingValue.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  // Dimension modal handlers
  const openAddDimension = () => {
    setDimModalMode("add");
    setDimForm({ name: "", key: "" });
    setDimModalOpen(true);
  };

  const openEditDimension = () => {
    if (!dimension) return;
    setDimModalMode("edit");
    setDimForm({ name: dimension.name, key: dimension.key });
    setDimModalOpen(true);
  };

  const handleDimSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (dimModalMode === "edit") {
      updateDimMutation.mutate({ name: dimForm.name });
    } else {
      const key = dimForm.key || dimForm.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
      createDimMutation.mutate({ name: dimForm.name, key });
    }
  };

  const handleDeleteDimension = () => {
    if (!dimension) return;
    if (!confirm(`Delete dimension "${dimension.name}"? This will remove all its values and linked data.`)) return;
    deleteDimMutation.mutate();
  };

  if (!dimension) {
    return <p className="text-gray-500 text-sm">Dimension not found.</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{vDim(dimension)}</h2>
          <Can permission="dimension:manage">
            {!dimension.is_system && (
              <>
                <button
                  onClick={openEditDimension}
                  className="text-gray-400 hover:text-purple-600"
                  title="Edit dimension name"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={handleDeleteDimension}
                  className="text-gray-400 hover:text-red-500"
                  title="Delete dimension"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </Can>
        </div>
        <div className="flex items-center gap-2">
          <Can permission="dimension:manage">
            <Button size="sm" variant="outline" onClick={openAddDimension}>
              <Plus className="h-4 w-4 mr-1" />
              New Dimension
            </Button>
          </Can>
          <Can permission="dimension:manage">
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4 mr-1" />
              Add {vDim(dimension)}
            </Button>
          </Can>
        </div>
      </div>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : values.length === 0 ? (
        <p className="text-gray-500 text-sm">No values yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Code</TableHead>
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {values.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="font-medium">{v.name}</TableCell>
                <TableCell className="text-gray-500 text-sm font-mono">{v.code}</TableCell>
                <TableCell>
                  <Can permission="dimension:manage">
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(v)}
                        className="text-gray-400 hover:text-purple-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${v.name}"?`))
                            deleteMutation.mutate(v.id);
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

      {/* Add/Edit dimension value modal */}
      <Dialog
        open={modalOpen}
        onClose={closeModal}
        title={editingValue ? `Edit ${vDim(dimension)}` : `Add ${vDim(dimension)}`}
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="value-name">Name</Label>
            <Input
              id="value-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Thane"
              required
            />
          </div>
          <div>
            <Label htmlFor="value-code">Code</Label>
            <Input
              id="value-code"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="e.g. THANE"
              className="font-mono"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit">
              {editingValue ? "Save" : "Add"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Add/Edit dimension modal */}
      <Dialog
        open={dimModalOpen}
        onClose={() => setDimModalOpen(false)}
        title={dimModalMode === "edit" ? "Edit Dimension" : "New Dimension"}
      >
        <form onSubmit={handleDimSubmit} className="space-y-3">
          <div>
            <Label htmlFor="dim-name">Name</Label>
            <Input
              id="dim-name"
              value={dimForm.name}
              onChange={(e) => setDimForm({ ...dimForm, name: e.target.value })}
              placeholder="e.g. Funder"
              required
            />
          </div>
          {dimModalMode === "add" && (
            <div>
              <Label htmlFor="dim-key">
                Key <span className="text-gray-400 text-xs font-normal">(auto-generated if empty)</span>
              </Label>
              <Input
                id="dim-key"
                value={dimForm.key}
                onChange={(e) => setDimForm({ ...dimForm, key: e.target.value })}
                placeholder="e.g. funder"
                className="font-mono text-sm"
              />
            </div>
          )}
          {dimModalMode === "edit" && (
            <p className="text-xs text-gray-400">
              Key: <span className="font-mono">{dimForm.key}</span> (immutable after creation)
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setDimModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              {dimModalMode === "edit" ? "Save" : "Create"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
