"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { entityApi, entityTypeApi, metaFieldSchemaApi } from "@/services/api";
import { Entity, MetaFieldDefinition } from "@/types";
import { Can } from "@/components/Auth/Permissions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { DynamicMetaForm } from "@/components/DynamicMetaForm";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/page-table";
import { Plus, Pencil, Search } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

export default function EntityTypeEntitiesPage() {
  const { key: entityTypeKey } = useParams<{ key: string }>();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Entity | null>(null);
  const [form, setForm] = useState({ name: "" });
  const [metaValues, setMetaValues] = useState<Record<string, unknown>>({});
  const [search, setSearch] = useState("");

  // Find the entity type by key
  const { data: entityTypes = [] } = useQuery({
    queryKey: ["entity-types"],
    queryFn: entityTypeApi.list,
  });

  const entityType = entityTypes.find((et) => et.key === entityTypeKey);

  const { data: entities = [], isLoading } = useQuery({
    queryKey: ["entities", entityType?.id],
    queryFn: () => entityApi.list(entityType!.id),
    enabled: !!entityType,
  });

  // Use entity-type-specific meta fields if available
  const metaSchemaKey = entityType ? `entity:${entityType.id}` : "";
  const { data: metaFields = [] } = useQuery<MetaFieldDefinition[]>({
    queryKey: ["meta-field-schemas", metaSchemaKey],
    queryFn: () => metaFieldSchemaApi.get(metaSchemaKey),
  });

  const createMutation = useMutation({
    mutationFn: entityApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entities"] });
      closeModal();
      toast.success(`${entityType?.name || "Entity"} created`);
    },
    onError: () => toast.error(`Failed to create`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof entityApi.update>[1] }) =>
      entityApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entities"] });
      closeModal();
      toast.success(`${entityType?.name || "Entity"} updated`);
    },
    onError: () => toast.error(`Failed to update`),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "" });
    setMetaValues({});
    setModalOpen(true);
  };

  const openEdit = (item: Entity) => {
    setEditing(item);
    setForm({ name: item.name });
    setMetaValues(item.meta || {});
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
      updateMutation.mutate({
        id: editing.id,
        data: { name: form.name, meta: meta || null },
      });
    } else {
      createMutation.mutate({
        entity_type_id: entityType!.id,
        name: form.name,
        meta,
      });
    }
  };

  const filtered = entities.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      (e.case_number || "").toLowerCase().includes(search.toLowerCase())
  );

  const typeName = entityType?.name || "Entity";
  const config = (entityType?.config || {}) as Record<string, boolean>;
  const hasCaseNumber = config.case_number_enabled;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{typeName}</h2>
        <Can permission="entity:create">
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Add {typeName}
          </Button>
        </Can>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder={`Search ${typeName.toLowerCase()}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500 text-sm">No {typeName.toLowerCase()} found.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              {hasCaseNumber && <TableHead>Case No.</TableHead>}
              {metaFields.map((f) => (
                <TableHead key={f.key}>{f.label}</TableHead>
              ))}
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  <Link
                    href={`/entities/${e.id}`}
                    className="text-purple-600 hover:underline"
                  >
                    {e.name}
                  </Link>
                </TableCell>
                {hasCaseNumber && <TableCell>{e.case_number || "—"}</TableCell>}
                {metaFields.map((f) => (
                  <TableCell key={f.key}>
                    {e.meta?.[f.key] !== undefined
                      ? String(e.meta[f.key])
                      : "—"}
                  </TableCell>
                ))}
                <TableCell>
                  <Can permission="entity:edit">
                    <button
                      onClick={() => openEdit(e)}
                      className="text-gray-400 hover:text-purple-600"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
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
        title={editing ? `Edit ${typeName}` : `Add ${typeName}`}
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
          <DynamicMetaForm
            fields={metaFields}
            values={metaValues}
            onChange={setMetaValues}
          />
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
