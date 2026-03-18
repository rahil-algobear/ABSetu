"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { activityTypeApi, activityCategoryApi, metaFieldSchemaApi, dimensionApi, dimensionValueLinkApi } from "@/services/api";
import { ActivityType, MetaFieldDefinition, Dimension, DimensionValue, DimensionValueLink } from "@/types";
import { Can } from "@/components/Auth/Permissions";
import { useVocabulary } from "@/hooks/useVocabulary";
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
import { Plus, Pencil, Trash2, LayoutGrid } from "lucide-react";
import toast from "react-hot-toast";
import { ActivityTypeMatrixDialog } from "@/components/ActivityTypeMatrixDialog";

function DimensionCheckboxSection({
  title,
  items,
  selectedIds,
  onToggle,
  onToggleAll,
}: {
  title: string;
  items: { id: string; name: string }[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
}) {
  const [search, setSearch] = useState("");
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
  const filtered = search
    ? sorted.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : sorted;
  const allSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id));

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium">{title}</label>
        <button
          type="button"
          onClick={onToggleAll}
          className="text-xs text-purple-600 hover:text-purple-800"
        >
          {allSelected ? "Clear All" : "Select All"}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">No {title.toLowerCase()} available</p>
      ) : (
        <>
          {items.length > 5 && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${title.toLowerCase()}...`}
              className="w-full mb-1 px-2 py-1 text-sm border rounded-md border-gray-300 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          )}
          <div className="space-y-1 max-h-36 overflow-y-auto border rounded-md p-2">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 py-1">No matches</p>
            ) : (
              filtered.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => onToggle(item.id)}
                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  {item.name}
                </label>
              ))
            )}
          </div>
        </>
      )}
      <p className="text-xs text-gray-400 mt-1">
        {selectedIds.size === 0
          ? "No dimensions selected"
          : `${Array.from(selectedIds).filter((id) => items.some((i) => i.id === id)).length} of ${items.length} selected`}
      </p>
    </div>
  );
}

export default function ActivityTypesPage() {
  const queryClient = useQueryClient();
  const { v, vPlural, vDim } = useVocabulary();
  const [modalOpen, setModalOpen] = useState(false);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [editing, setEditing] = useState<ActivityType | null>(null);
  const [form, setForm] = useState({ name: "", description: "", category_id: "" });
  const [metaValues, setMetaValues] = useState<Record<string, unknown>>({});
  const [selectedDvIds, setSelectedDvIds] = useState<Set<string>>(new Set());

  const { data: types = [], isLoading } = useQuery({
    queryKey: ["activity-types"],
    queryFn: () => activityTypeApi.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["activity-categories"],
    queryFn: activityCategoryApi.list,
  });

  const { data: metaFields = [] } = useQuery<MetaFieldDefinition[]>({
    queryKey: ["meta-field-schemas", "activity_type"],
    queryFn: () => metaFieldSchemaApi.get("activity_type"),
  });

  const { data: dimensions = [] } = useQuery<Dimension[]>({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
  });

  const nonSystemDimensions = useMemo(
    () => dimensions.filter((d) => !d.is_system),
    [dimensions]
  );

  const systemDimension = useMemo(
    () => dimensions.find((d) => d.is_system === "activity_type"),
    [dimensions]
  );

  // Load system dimension values (these correspond to activity types)
  const { data: systemDvs = [] } = useQuery<DimensionValue[]>({
    queryKey: ["dimension-values", systemDimension?.id],
    queryFn: () => dimensionApi.listValues(systemDimension!.id),
    enabled: !!systemDimension,
  });

  // Load all non-system dimension values
  const { data: allNonSystemDvs = [] } = useQuery<DimensionValue[]>({
    queryKey: ["all-nonsystem-dvs", nonSystemDimensions.map((d) => d.id).join(",")],
    queryFn: async () => {
      const results = await Promise.all(
        nonSystemDimensions.map((d) => dimensionApi.listValues(d.id))
      );
      return results.flat();
    },
    enabled: nonSystemDimensions.length > 0,
  });

  // Load all dimension value links (unfiltered)
  const { data: allDimensionValueLinks = [] } = useQuery<DimensionValueLink[]>({
    queryKey: ["dimension-value-links-all"],
    queryFn: () => dimensionValueLinkApi.list(),
  });

  // Build map: activity type name → system dimension value id
  const atNameToDvId = useMemo(() => {
    const map = new Map<string, string>();
    for (const dv of systemDvs) {
      map.set(dv.name, dv.id);
    }
    return map;
  }, [systemDvs]);

  // Build map: system dv id → set of connected non-system dv ids
  const systemDvToConnected = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const systemDvIds = new Set(systemDvs.map((dv) => dv.id));
    for (const link of allDimensionValueLinks) {
      const { dimension_value_id_1: id1, dimension_value_id_2: id2 } = link;
      if (systemDvIds.has(id1) && !systemDvIds.has(id2)) {
        if (!map.has(id1)) map.set(id1, new Set());
        map.get(id1)!.add(id2);
      }
      if (systemDvIds.has(id2) && !systemDvIds.has(id1)) {
        if (!map.has(id2)) map.set(id2, new Set());
        map.get(id2)!.add(id1);
      }
    }
    return map;
  }, [allDimensionValueLinks, systemDvs]);

  const dvMap = useMemo(
    () => new Map(allNonSystemDvs.map((dv) => [dv.id, dv])),
    [allNonSystemDvs]
  );

  // Group non-system dimension values by dimension for checkbox sections
  const dvsByDimension = useMemo(
    () =>
      nonSystemDimensions.map((dim) => ({
        dimension: dim,
        values: allNonSystemDvs.filter((dv) => dv.dimension_id === dim.id),
      })),
    [nonSystemDimensions, allNonSystemDvs]
  );

  const toggleDvId = (id: string) => {
    setSelectedDvIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllForDimension = (values: { id: string }[]) => {
    setSelectedDvIds((prev) => {
      const next = new Set(prev);
      const allSelected = values.every((v) => next.has(v.id));
      if (allSelected) {
        values.forEach((v) => next.delete(v.id));
      } else {
        values.forEach((v) => next.add(v.id));
      }
      return next;
    });
  };

  // Sync dimension value links for a given activity type's system DV
  const syncDimensionLinks = async (sysDvId: string, selected: Set<string>) => {
    if (!systemDimension) return;
    const systemDvIdSet = new Set(systemDvs.map((dv) => dv.id));

    // Group selected values by dimension
    const selectedByDim = new Map<string, string[]>();
    for (const dvId of selected) {
      const dv = dvMap.get(dvId);
      if (dv) {
        if (!selectedByDim.has(dv.dimension_id)) selectedByDim.set(dv.dimension_id, []);
        selectedByDim.get(dv.dimension_id)!.push(dvId);
      }
    }

    // 1. Sync system ↔ non-system links (places AT in matrix columns)
    for (const dim of nonSystemDimensions) {
      const dimValueIds = new Set(
        allNonSystemDvs.filter((dv) => dv.dimension_id === dim.id).map((dv) => dv.id)
      );

      // Keep existing pairs between system dim and this dim that DON'T involve this AT
      const otherPairs: [string, string][] = allDimensionValueLinks
        .filter((link) => {
          const { dimension_value_id_1: id1, dimension_value_id_2: id2 } = link;
          const involvesSystemDim = systemDvIdSet.has(id1) || systemDvIdSet.has(id2);
          const involvesThisDim = dimValueIds.has(id1) || dimValueIds.has(id2);
          const involvesThisAt = id1 === sysDvId || id2 === sysDvId;
          return involvesSystemDim && involvesThisDim && !involvesThisAt;
        })
        .map((link) => [link.dimension_value_id_1, link.dimension_value_id_2]);

      // Add this AT's new pairs
      const thisPairs: [string, string][] = Array.from(selected)
        .filter((id) => dimValueIds.has(id))
        .map((id) => [sysDvId, id]);

      await dimensionValueLinkApi.bulkSync({
        dimension_id_1: systemDimension.id,
        dimension_id_2: dim.id,
        pairs: [...otherPairs, ...thisPairs],
      });
    }

    // 2. Additively create cross-dimension links (builds matrix column structure)
    //    For every pair of non-system dimensions that have selected values,
    //    ensure links exist between all combinations of selected values.
    const dimIds = Array.from(selectedByDim.keys());
    for (let i = 0; i < dimIds.length; i++) {
      for (let j = i + 1; j < dimIds.length; j++) {
        const dimA = dimIds[i];
        const dimB = dimIds[j];
        const valsA = selectedByDim.get(dimA) || [];
        const valsB = selectedByDim.get(dimB) || [];

        if (valsA.length === 0 || valsB.length === 0) continue;

        // Get existing links between these two dimensions
        const dimAValueIds = new Set(
          allNonSystemDvs.filter((dv) => dv.dimension_id === dimA).map((dv) => dv.id)
        );
        const dimBValueIds = new Set(
          allNonSystemDvs.filter((dv) => dv.dimension_id === dimB).map((dv) => dv.id)
        );

        const existingPairs: [string, string][] = allDimensionValueLinks
          .filter((link) => {
            const { dimension_value_id_1: id1, dimension_value_id_2: id2 } = link;
            return (
              (dimAValueIds.has(id1) && dimBValueIds.has(id2)) ||
              (dimAValueIds.has(id2) && dimBValueIds.has(id1))
            );
          })
          .map((link) => [link.dimension_value_id_1, link.dimension_value_id_2]);

        // Build new cross-dimension pairs from selected values
        const newPairs: [string, string][] = [];
        for (const a of valsA) {
          for (const b of valsB) {
            newPairs.push([a, b]);
          }
        }

        // Merge: existing + new (bulkSync deduplicates via normalization)
        await dimensionValueLinkApi.bulkSync({
          dimension_id_1: dimA,
          dimension_id_2: dimB,
          pairs: [...existingPairs, ...newPairs],
        });
      }
    }
  };

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; category_id?: string; description?: string; meta?: Record<string, unknown> }) => {
      const at = await activityTypeApi.create(data);
      // After creation, the backend auto-creates a system dimension value.
      // Fetch it and sync dimension links.
      if (systemDimension && selectedDvIds.size > 0) {
        const sysDvs = await dimensionApi.listValues(systemDimension.id);
        const newSysDv = sysDvs.find((dv) => dv.name === at.name);
        if (newSysDv) {
          await syncDimensionLinks(newSysDv.id, selectedDvIds);
        }
      }
      return at;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-types"] });
      queryClient.invalidateQueries({ queryKey: ["dimension-values"] });
      queryClient.invalidateQueries({ queryKey: ["dimension-value-links-all"] });
      queryClient.invalidateQueries({ queryKey: ["dimension-value-links"] });
      closeModal();
      toast.success(`${v("activity_type")} created`);
    },
    onError: () => toast.error("Failed to create"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ActivityType> }) => {
      const at = await activityTypeApi.update(id, data);
      // Sync dimension links using the existing system DV
      if (systemDimension && editing) {
        const sysDvId = atNameToDvId.get(editing.name);
        if (sysDvId) {
          await syncDimensionLinks(sysDvId, selectedDvIds);
        }
      }
      return at;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-types"] });
      queryClient.invalidateQueries({ queryKey: ["dimension-values"] });
      queryClient.invalidateQueries({ queryKey: ["dimension-value-links-all"] });
      queryClient.invalidateQueries({ queryKey: ["dimension-value-links"] });
      closeModal();
      toast.success(`${v("activity_type")} updated`);
    },
    onError: () => toast.error("Failed to update"),
  });

  const deleteMutation = useMutation({
    mutationFn: activityTypeApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-types"] });
      queryClient.invalidateQueries({ queryKey: ["dimension-values"] });
      queryClient.invalidateQueries({ queryKey: ["dimension-value-links-all"] });
      toast.success(`${v("activity_type")} deleted`);
    },
    onError: () => toast.error("Failed to delete"),
  });

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", description: "", category_id: "" });
    setMetaValues({});
    setSelectedDvIds(new Set());
    setModalOpen(true);
  };

  const openEdit = (at: ActivityType) => {
    setEditing(at);
    setForm({ name: at.name, description: at.description || "", category_id: at.category_id || "" });
    setMetaValues(at.meta || {});
    // Populate selected dimension values from existing links
    const sysDvId = atNameToDvId.get(at.name);
    const connectedIds = sysDvId ? systemDvToConnected.get(sysDvId) : undefined;
    setSelectedDvIds(connectedIds ? new Set(connectedIds) : new Set());
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const meta = Object.keys(metaValues).length > 0 ? metaValues : undefined;
    const data = {
      name: form.name,
      description: form.description || undefined,
      category_id: form.category_id || undefined,
      meta,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: data as Partial<ActivityType> });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{vPlural("activity_type")}</h2>
        <div className="flex gap-2">
          {nonSystemDimensions.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setMatrixOpen(true)}>
              <LayoutGrid className="h-4 w-4 mr-1" />
              View Matrix
            </Button>
          )}
          <Can permission="activity_type:manage">
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </Can>
        </div>
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
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              {nonSystemDimensions.map((dim) => (
                <TableHead key={dim.id}>{vDim(dim)}</TableHead>
              ))}
              {metaFields.map((f) => (
                <TableHead key={f.key}>{f.label}</TableHead>
              ))}
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {types.map((at) => {
              const sysDvId = atNameToDvId.get(at.name);
              const connectedIds = sysDvId ? systemDvToConnected.get(sysDvId) : undefined;
              return (
                <TableRow key={at.id}>
                  <TableCell className="font-medium">{at.name}</TableCell>
                  <TableCell className="text-gray-500 text-sm">
                    {at.category_name || "—"}
                  </TableCell>
                  <TableCell className="text-gray-500 text-sm">
                    {at.description || "—"}
                  </TableCell>
                  {nonSystemDimensions.map((dim) => {
                    const values = connectedIds
                      ? Array.from(connectedIds)
                          .map((id) => dvMap.get(id))
                          .filter((dv): dv is DimensionValue => dv?.dimension_id === dim.id)
                      : [];
                    return (
                      <TableCell key={dim.id}>
                        <div className="flex flex-wrap gap-1">
                          {values.length ? (
                            values.map((dv) => (
                              <span
                                key={dv.id}
                                className="inline-block text-sm bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full"
                              >
                                {dv.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </div>
                      </TableCell>
                    );
                  })}
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
              );
            })}
          </TableBody>
        </Table>
      )}

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
            <Label htmlFor="at-category">{v("activity_category")}</Label>
            <select
              id="at-category"
              className="w-full mt-1 border rounded-md p-2 text-sm"
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            >
              <option value="">None</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
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
          {dvsByDimension.length > 0 && (
            <div className="space-y-3 pt-1">
              <p className="text-xs text-gray-500">
                Select which {nonSystemDimensions.length === 1 ? vDim(nonSystemDimensions[0]).toLowerCase() + " values" : "dimension values"} this {v("activity_type").toLowerCase()} is mapped to.
              </p>
              {dvsByDimension.map(({ dimension, values }) => (
                <DimensionCheckboxSection
                  key={dimension.id}
                  title={vDim(dimension)}
                  items={values}
                  selectedIds={selectedDvIds}
                  onToggle={toggleDvId}
                  onToggleAll={() => toggleAllForDimension(values)}
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

      <ActivityTypeMatrixDialog
        open={matrixOpen}
        onClose={() => setMatrixOpen(false)}
      />
    </>
  );
}
