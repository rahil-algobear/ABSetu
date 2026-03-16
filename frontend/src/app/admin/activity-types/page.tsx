"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { activityTypeApi, dimensionApi, metaFieldSchemaApi } from "@/services/api";
import { ActivityType, ActivityTypeAccess, Dimension, DimensionValue, MetaFieldDefinition } from "@/types";
import { Can } from "@/components/Auth/Permissions";
import { useVocabulary } from "@/hooks/useVocabulary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { DynamicMetaForm, MetaFieldDisplay } from "@/components/DynamicMetaForm";
import { AccessCheckboxSection } from "@/components/ui/access-checkbox-section";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/page-table";
import { Plus, Pencil, Trash2, Shield } from "lucide-react";
import toast from "react-hot-toast";

export default function ActivityTypesPage() {
  const queryClient = useQueryClient();
  const { v, vPlural } = useVocabulary();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ActivityType | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [metaValues, setMetaValues] = useState<Record<string, unknown>>({});
  const [selectedDvIds, setSelectedDvIds] = useState<Set<string>>(new Set());

  // Access modal (for existing activity types)
  const [accessType, setAccessType] = useState<ActivityType | null>(null);
  const [accessDvIds, setAccessDvIds] = useState<Set<string>>(new Set());

  const { data: types = [], isLoading } = useQuery({
    queryKey: ["activity-types"],
    queryFn: activityTypeApi.list,
  });

  const { data: metaFields = [] } = useQuery<MetaFieldDefinition[]>({
    queryKey: ["meta-field-schemas", "activity_type"],
    queryFn: () => metaFieldSchemaApi.get("activity_type"),
  });

  const { data: dimensions = [] } = useQuery<Dimension[]>({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
  });

  // Non-system dimensions only
  const selectableDimensions = dimensions.filter((d) => !d.is_system);

  const { data: allDimensionValues = [] } = useQuery<DimensionValue[]>({
    queryKey: ["all-dimension-values", dimensions.map((d) => d.id).join(",")],
    queryFn: async () => {
      const results = await Promise.all(
        dimensions.map((d) => dimensionApi.listValues(d.id))
      );
      return results.flat();
    },
    enabled: dimensions.length > 0,
  });

  const { data: allAccess = [] } = useQuery<ActivityTypeAccess[]>({
    queryKey: ["activity-type-access"],
    queryFn: activityTypeApi.listAllAccess,
  });

  // Map: activity_type_id → Set of dimension_value_ids
  const accessByType = new Map<string, Set<string>>();
  for (const entry of allAccess) {
    accessByType.set(entry.activity_type_id, new Set(entry.dimension_value_ids));
  }

  // Map dimension value id → DimensionValue for badge rendering
  const dvMap = new Map<string, DimensionValue>();
  for (const dv of allDimensionValues) {
    dvMap.set(dv.id, dv);
  }

  // Group dimension values by dimension
  const dvsByDimension = selectableDimensions.map((dim) => ({
    dimension: dim,
    values: allDimensionValues
      .filter((dv) => dv.dimension_id === dim.id)
      .map((dv) => ({ id: dv.id, name: dv.name })),
  }));

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; meta?: Record<string, unknown> }) => {
      const at = await activityTypeApi.create(data);
      // Save access if any selected
      if (selectedDvIds.size > 0) {
        await activityTypeApi.updateAccess(at.id, {
          dimension_value_ids: Array.from(selectedDvIds),
        });
      }
      return at;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-types"] });
      queryClient.invalidateQueries({ queryKey: ["activity-type-access"] });
      closeModal();
      toast.success(`${v("activity_type")} created`);
    },
    onError: () => toast.error("Failed to create"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ActivityType> }) => {
      const at = await activityTypeApi.update(id, data);
      // Save access
      await activityTypeApi.updateAccess(id, {
        dimension_value_ids: Array.from(selectedDvIds),
      });
      return at;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-types"] });
      queryClient.invalidateQueries({ queryKey: ["activity-type-access"] });
      closeModal();
      toast.success(`${v("activity_type")} updated`);
    },
    onError: () => toast.error("Failed to update"),
  });

  const deleteMutation = useMutation({
    mutationFn: activityTypeApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-types"] });
      queryClient.invalidateQueries({ queryKey: ["activity-type-access"] });
      toast.success(`${v("activity_type")} deleted`);
    },
    onError: () => toast.error("Failed to delete"),
  });

  const updateAccessMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { dimension_value_ids: string[] } }) =>
      activityTypeApi.updateAccess(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-type-access"] });
      setAccessType(null);
      toast.success("Access updated");
    },
    onError: () => toast.error("Failed to update access"),
  });

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", description: "" });
    setMetaValues({});
    setSelectedDvIds(new Set());
    setModalOpen(true);
  };

  const openEdit = async (at: ActivityType) => {
    setEditing(at);
    setForm({ name: at.name, description: at.description || "" });
    setMetaValues(at.meta || {});
    // Load existing access
    try {
      const access = await activityTypeApi.getAccess(at.id);
      setSelectedDvIds(new Set(access.dimension_value_ids));
    } catch {
      setSelectedDvIds(new Set());
    }
    setModalOpen(true);
  };

  const openAccess = async (at: ActivityType) => {
    try {
      const access = await activityTypeApi.getAccess(at.id);
      setAccessDvIds(new Set(access.dimension_value_ids));
    } catch {
      setAccessDvIds(new Set());
    }
    setAccessType(at);
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

  const toggleId = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };

  const toggleAll = (
    items: { id: string }[],
    set: Set<string>,
    setter: (s: Set<string>) => void,
  ) => {
    const allSelected = items.every((i) => set.has(i.id));
    const next = new Set(set);
    if (allSelected) {
      items.forEach((i) => next.delete(i.id));
    } else {
      items.forEach((i) => next.add(i.id));
    }
    setter(next);
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{vPlural("activity_type")}</h2>
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
        <p className="text-gray-500 text-sm">No {vPlural("activity_type").toLowerCase()} yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              {metaFields.map((f) => (
                <TableHead key={f.key}>{f.label}</TableHead>
              ))}
              {selectableDimensions.map((dim) => (
                <TableHead key={dim.id}>{dim.name}</TableHead>
              ))}
              <TableHead className="w-24">Actions</TableHead>
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
                {selectableDimensions.map((dim) => {
                  const atAccess = accessByType.get(at.id) ?? new Set<string>();
                  const values = Array.from(atAccess)
                    .map((id) => dvMap.get(id))
                    .filter((dv): dv is DimensionValue => dv?.dimension_id === dim.id);
                  return (
                    <TableCell key={dim.id}>
                      <div className="flex flex-wrap gap-1">
                        {values.length ? (
                          values.map((dv) => (
                            <span key={dv.id} className="inline-block text-sm bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                              {dv.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-gray-400">All</span>
                        )}
                      </div>
                    </TableCell>
                  );
                })}
                <TableCell>
                  <Can permission="activity_type:manage">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(at)}
                        className="text-gray-400 hover:text-purple-600"
                        title="Edit activity type"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => openAccess(at)}
                        className="text-gray-400 hover:text-purple-600"
                        title="Manage access"
                      >
                        <Shield className="h-4 w-4" />
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

      {/* Create / Edit modal */}
      <Dialog
        open={modalOpen}
        onClose={closeModal}
        title={editing ? `Edit ${v("activity_type")}` : `Add ${v("activity_type")}`}
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

          {/* Dimension access sections */}
          {dvsByDimension.length > 0 && (
            <div className="space-y-3 pt-2 border-t">
              <p className="text-sm font-medium text-gray-700">Access</p>
              {dvsByDimension.map(({ dimension, values }) => (
                <AccessCheckboxSection
                  key={dimension.id}
                  title={dimension.name}
                  items={values}
                  selectedIds={selectedDvIds}
                  onToggle={(id) => toggleId(selectedDvIds, setSelectedDvIds, id)}
                  onToggleAll={() => toggleAll(values, selectedDvIds, setSelectedDvIds)}
                  emptyLabel={`Available at all ${dimension.name.toLowerCase()}s`}
                />
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit">{editing ? "Save" : "Add"}</Button>
          </div>
        </form>
      </Dialog>

      {/* Manage Access modal */}
      <Dialog
        open={!!accessType}
        onClose={() => setAccessType(null)}
        title={`${accessType?.name} — Access`}
      >
        <div className="space-y-3">
          {dvsByDimension.map(({ dimension, values }) => (
            <AccessCheckboxSection
              key={dimension.id}
              title={dimension.name}
              items={values}
              selectedIds={accessDvIds}
              onToggle={(id) => toggleId(accessDvIds, setAccessDvIds, id)}
              onToggleAll={() => toggleAll(values, accessDvIds, setAccessDvIds)}
              emptyLabel={`Available at all ${dimension.name.toLowerCase()}s`}
            />
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAccessType(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (accessType) {
                  updateAccessMutation.mutate({
                    id: accessType.id,
                    data: { dimension_value_ids: Array.from(accessDvIds) },
                  });
                }
              }}
            >
              Save Access
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
