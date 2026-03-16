"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { activityTypeApi, metaFieldSchemaApi, dimensionApi, tagRuleApi } from "@/services/api";
import { ActivityType, MetaFieldDefinition, Dimension, DimensionValue, TagRule } from "@/types";
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

export default function ActivityTypesPage() {
  const queryClient = useQueryClient();
  const { v, vPlural, vDim } = useVocabulary();
  const [modalOpen, setModalOpen] = useState(false);
  const [matrixOpen, setMatrixOpen] = useState(false);
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

  // Load all tag rules (unfiltered)
  const { data: allTagRules = [] } = useQuery<TagRule[]>({
    queryKey: ["tag-rules-all"],
    queryFn: () => tagRuleApi.list(),
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
    for (const rule of allTagRules) {
      const { dimension_value_id_1: id1, dimension_value_id_2: id2 } = rule;
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
  }, [allTagRules, systemDvs]);

  const dvMap = useMemo(
    () => new Map(allNonSystemDvs.map((dv) => [dv.id, dv])),
    [allNonSystemDvs]
  );

  const createMutation = useMutation({
    mutationFn: activityTypeApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-types"] });
      queryClient.invalidateQueries({ queryKey: ["dimension-values"] });
      queryClient.invalidateQueries({ queryKey: ["tag-rules-all"] });
      closeModal();
      toast.success(`${v("activity_type")} created`);
    },
    onError: () => toast.error("Failed to create"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ActivityType> }) =>
      activityTypeApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-types"] });
      queryClient.invalidateQueries({ queryKey: ["dimension-values"] });
      queryClient.invalidateQueries({ queryKey: ["tag-rules-all"] });
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
      queryClient.invalidateQueries({ queryKey: ["tag-rules-all"] });
      toast.success(`${v("activity_type")} deleted`);
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

      <ActivityTypeMatrixDialog
        open={matrixOpen}
        onClose={() => setMatrixOpen(false)}
      />
    </>
  );
}
