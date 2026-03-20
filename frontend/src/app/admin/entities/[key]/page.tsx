"use client";

import { Suspense, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { entityApi, entityTypeApi, metaFieldSchemaApi } from "@/services/api";
import { Entity, MetaFieldDefinition } from "@/types";
import { Can } from "@/components/Auth/Permissions";
import { useListParams } from "@/hooks/useListParams";
import type { FilterDefinition } from "@/components/ui/filter-modal";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { DynamicMetaForm } from "@/components/DynamicMetaForm";
import { PageHeader } from "@/components/ui/page-header";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Pagination } from "@/components/ui/pagination";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/page-table";
import { Plus, Pencil } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

function EntityTypeEntitiesContent() {
  const { key: entityTypeKey } = useParams<{ key: string }>();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Entity | null>(null);
  const [form, setForm] = useState({ name: "" });
  const [metaValues, setMetaValues] = useState<Record<string, unknown>>({});

  // Find the entity type by key
  const { data: entityTypes = [] } = useQuery({
    queryKey: ["entity-types"],
    queryFn: entityTypeApi.list,
  });

  const entityType = entityTypes.find((et) => et.key === entityTypeKey);

  // Fetch filter definitions (needed before useListParams for slug mapping)
  const { data: filterData } = useQuery({
    queryKey: ["entity-filters"],
    queryFn: entityApi.getFilters,
  });

  // All definitions (for slug mapping in useListParams)
  const allFilterDefs: FilterDefinition[] = useMemo(() => {
    return (filterData?.filters || []).map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type as FilterDefinition["type"],
      options: f.options,
      min: f.min,
      max: f.max,
    }));
  }, [filterData]);

  // Definitions for the filter modal (without entity_type_id — implicit from URL)
  const filterDefinitions: FilterDefinition[] = useMemo(() => {
    return allFilterDefs.filter((f) => f.key !== "entity_type_id");
  }, [allFilterDefs]);

  // List params from URL — uses filter definitions for slug mapping
  const listParams = useListParams({
    defaultSortBy: "created_at",
    defaultSortOrder: "desc",
    filterDefinitions: allFilterDefs,
  });

  // Paginated entity list — scoped to entity type
  const { data: response, isLoading } = useQuery({
    queryKey: ["entities", entityType?.id, listParams.apiParams],
    queryFn: () =>
      entityApi.listPaginated({
        ...listParams.apiParams,
        entity_type_id: entityType!.id,
      }),
    enabled: !!entityType,
  });

  const entities = response?.data || [];
  const totalCount = response?.count || 0;
  const totalPages = Math.ceil(totalCount / listParams.limit);

  // Use entity-type-specific meta fields if available
  const metaSchemaKey = entityType ? `entity:${entityType.id}` : "";
  const { data: metaFields = [] } = useQuery<MetaFieldDefinition[]>({
    queryKey: ["meta-field-schemas", metaSchemaKey],
    queryFn: () => metaFieldSchemaApi.get(metaSchemaKey),
  });

  // Derive unique dimension columns from loaded entities
  const dimensionColumns = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of entities) {
      for (const dim of e.dimensions) {
        if (!seen.has(dim.dimension_key)) {
          seen.set(dim.dimension_key, dim.dimension_name);
        }
      }
    }
    return Array.from(seen.entries()).map(([key, name]) => ({ key, name }));
  }, [entities]);

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

  const openEdit = (e: React.MouseEvent, item: Entity) => {
    e.stopPropagation();
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
        data: { name: form.name, meta: meta || undefined },
      });
    } else {
      createMutation.mutate({
        entity_type_id: entityType!.id,
        name: form.name,
        meta,
      });
    }
  };

  const typeName = entityType?.name || "Entity";
  const config = (entityType?.config || {}) as Record<string, boolean>;
  const hasCaseNumber = config.case_number_enabled;

  return (
    <>
      <PageHeader
        title={typeName}
        actions={
          <Can permission="entity:create">
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Add {typeName}
            </Button>
          </Can>
        }
      />

      <ListToolbar
        search={listParams.search}
        onSearchChange={listParams.setSearch}
        filterDefinitions={filterDefinitions}
        activeFilters={listParams.activeFilters}
        onFiltersChange={listParams.setActiveFilters}
        onRemoveFilter={listParams.removeFilter}
        searchPlaceholder={`Search ${typeName.toLowerCase()}...`}
      />

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : entities.length === 0 ? (
        <p className="text-gray-500 text-sm">No {typeName.toLowerCase()} found.</p>
      ) : (
        <>
          <div className="bg-white shadow-sm border rounded-lg overflow-hidden">
          <Table stickyRows={1} className="h-[calc(100vh-400px)] lg:h-[calc(100vh-300px)]">
            <TableHeader>
              <TableRow>
                <SortableTableHead
                  label="Name"
                  sortKey="name"
                  currentSortBy={listParams.sortBy}
                  currentSortOrder={listParams.sortOrder}
                  onSort={listParams.setSorting}
                />
                {hasCaseNumber && (
                  <SortableTableHead
                    label="Case No."
                    sortKey="case_number"
                    currentSortBy={listParams.sortBy}
                    currentSortOrder={listParams.sortOrder}
                    onSort={listParams.setSorting}
                  />
                )}
                {dimensionColumns.map((dc) => (
                  <TableHead key={dc.key}>{dc.name}</TableHead>
                ))}
                {metaFields.map((f) => (
                  <TableHead key={f.key}>{f.label}</TableHead>
                ))}
                <TableHead>Enrollments</TableHead>
                <TableHead>Activities</TableHead>
                <SortableTableHead
                  label="Created"
                  sortKey="created_at"
                  currentSortBy={listParams.sortBy}
                  currentSortOrder={listParams.sortOrder}
                  onSort={listParams.setSorting}
                />
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entities.map((e) => (
                <TableRow
                  key={e.id}
                  onClick={() => router.push(`/entities/${e.id}`)}
                >
                  <TableCell className="font-medium">
                    <Link
                      href={`/entities/${e.id}`}
                      className="text-primary hover:underline"
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      {e.name}
                    </Link>
                  </TableCell>
                  {hasCaseNumber && <TableCell>{e.case_number || "—"}</TableCell>}
                  {dimensionColumns.map((dc) => {
                    const dim = e.dimensions.find((d) => d.dimension_key === dc.key);
                    return (
                      <TableCell key={dc.key}>
                        {dim ? dim.value_name : "—"}
                      </TableCell>
                    );
                  })}
                  {metaFields.map((f) => (
                    <TableCell key={f.key}>
                      {e.meta?.[f.key] !== undefined
                        ? String(e.meta[f.key])
                        : "—"}
                    </TableCell>
                  ))}
                  <TableCell>{e.enrollment_count}</TableCell>
                  <TableCell>{e.activity_count}</TableCell>
                  <TableCell className="text-gray-500">
                    {e.updated_at
                      ? new Date(e.updated_at * 1000).toLocaleDateString()
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Can permission="entity:edit">
                      <button
                        onClick={(ev) => openEdit(ev, e)}
                        className="text-gray-400 hover:text-primary"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </Can>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            currentPage={listParams.page}
            totalPages={totalPages}
            totalItems={totalCount}
            itemsPerPage={listParams.limit}
            onPageChange={listParams.setPage}
            onItemsPerPageChange={listParams.setLimit}
            itemLabel={typeName.toLowerCase()}
          />
          </div>
        </>
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

export default function EntityTypeEntitiesPage() {
  return (
    <Suspense fallback={<p className="text-gray-500 text-sm p-4">Loading...</p>}>
      <EntityTypeEntitiesContent />
    </Suspense>
  );
}
