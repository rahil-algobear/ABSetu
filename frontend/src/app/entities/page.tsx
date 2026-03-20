"use client";

import { Suspense, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { entityApi, entityTypeApi, metaFieldSchemaApi } from "@/services/api";
import { MetaFieldDefinition } from "@/types";
import { Can } from "@/components/Auth/Permissions";
import { useListParams } from "@/hooks/useListParams";
import type { FilterDefinition } from "@/components/ui/filter-modal";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { DynamicMetaForm } from "@/components/DynamicMetaForm";
import { PageLayout } from "@/components/ui/page-layout";
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
import { Plus } from "lucide-react";
import toast from "react-hot-toast";

function EntitiesPageContent() {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTypeId, setNewTypeId] = useState("");
  const [metaValues, setMetaValues] = useState<Record<string, unknown>>({});
  const queryClient = useQueryClient();
  const router = useRouter();

  // List params from URL
  const listParams = useListParams({
    defaultSortBy: "created_at",
    defaultSortOrder: "desc",
  });

  // Fetch filter definitions
  const { data: filterData } = useQuery({
    queryKey: ["entity-filters"],
    queryFn: entityApi.getFilters,
  });

  // Enrich filter labels from URL-parsed filters using filter definitions
  const enrichedFilters = useMemo(() => {
    if (!filterData?.filters) return listParams.activeFilters;
    return listParams.activeFilters.map((f) => {
      const def = filterData.filters.find((d) => d.key === f.key);
      if (!def) return f;
      let displayValue = f.displayValue;
      if (def.type === "select" && def.options) {
        const vals = Array.isArray(f.value) ? f.value : [f.value];
        displayValue = vals
          .map((v) => def.options!.find((o) => o.value === v)?.label || v)
          .join(", ");
      }
      return { ...f, label: def.label, displayValue };
    });
  }, [listParams.activeFilters, filterData]);

  const filterDefinitions: FilterDefinition[] = useMemo(() => {
    return (filterData?.filters || []).map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type as FilterDefinition["type"],
      options: f.options,
      min: f.min,
      max: f.max,
    }));
  }, [filterData]);

  const { data: entityTypes = [] } = useQuery({
    queryKey: ["entity-types"],
    queryFn: entityTypeApi.list,
  });

  // Paginated entity list
  const { data: response, isLoading } = useQuery({
    queryKey: ["entities", listParams.apiParams],
    queryFn: () => entityApi.listPaginated(listParams.apiParams),
  });

  const entities = response?.data || [];
  const totalCount = response?.count || 0;
  const totalPages = Math.ceil(totalCount / listParams.limit);

  const { data: metaFields = [] } = useQuery<MetaFieldDefinition[]>({
    queryKey: ["meta-field-schemas", "entity"],
    queryFn: () => metaFieldSchemaApi.get("entity"),
  });

  const createMutation = useMutation({
    mutationFn: entityApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entities"] });
      setShowCreate(false);
      setNewName("");
      setNewTypeId("");
      setMetaValues({});
      toast.success("Entity created");
    },
    onError: () => toast.error("Failed to create entity"),
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

  return (
    <PageLayout className="p-4">
      <PageHeader
        title="Entities"
        actions={
          <Can permission="entity:create">
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </Can>
        }
      />

      <ListToolbar
        search={listParams.search}
        onSearchChange={listParams.setSearch}
        filterDefinitions={filterDefinitions}
        activeFilters={enrichedFilters}
        onFiltersChange={listParams.setActiveFilters}
        onRemoveFilter={listParams.removeFilter}
        searchPlaceholder="Search by name or case number..."
      />

      <Dialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add Entity"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim() && newTypeId) {
              const meta = Object.keys(metaValues).length > 0 ? metaValues : undefined;
              createMutation.mutate({
                entity_type_id: newTypeId,
                name: newName.trim(),
                meta,
              });
            }
          }}
          className="space-y-3"
        >
          <div>
            <Label htmlFor="entity_type_id">Entity Type</Label>
            <select
              id="entity_type_id"
              className="w-full mt-1 border rounded-md p-2 text-sm"
              value={newTypeId}
              onChange={(e) => setNewTypeId(e.target.value)}
              required
            >
              <option value="">Select...</option>
              {entityTypes.map((et) => (
                <option key={et.id} value={et.id}>{et.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="Entity name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <DynamicMetaForm
            fields={metaFields}
            values={metaValues}
            onChange={setMetaValues}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              Create
            </Button>
          </div>
        </form>
      </Dialog>

      {isLoading ? (
        <p className="text-gray-500">Loading...</p>
      ) : entities.length === 0 ? (
        <p className="text-gray-500">No entities found.</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead
                  label="Name"
                  sortKey="name"
                  currentSortBy={listParams.sortBy}
                  currentSortOrder={listParams.sortOrder}
                  onSort={listParams.setSorting}
                />
                <TableHead>Case #</TableHead>
                <TableHead>Type</TableHead>
                {dimensionColumns.map((dc) => (
                  <TableHead key={dc.key}>{dc.name}</TableHead>
                ))}
                <SortableTableHead
                  label="Created"
                  sortKey="created_at"
                  currentSortBy={listParams.sortBy}
                  currentSortOrder={listParams.sortOrder}
                  onSort={listParams.setSorting}
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {entities.map((e) => (
                <TableRow
                  key={e.id}
                  onClick={() => router.push(`/entities/${e.id}`)}
                >
                  <TableCell className="font-medium text-primary">
                    {e.name}
                  </TableCell>
                  <TableCell>{e.case_number || "—"}</TableCell>
                  <TableCell>
                    {e.entity_type_name && (
                      <Badge variant="secondary" className="text-xs">
                        {e.entity_type_name}
                      </Badge>
                    )}
                  </TableCell>
                  {dimensionColumns.map((dc) => {
                    const dim = e.dimensions.find((d) => d.dimension_key === dc.key);
                    return (
                      <TableCell key={dc.key}>
                        {dim ? dim.value_name : "—"}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-gray-500">
                    {e.updated_at
                      ? new Date(e.updated_at * 1000).toLocaleDateString()
                      : "—"}
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
            itemLabel="entities"
          />
        </>
      )}
    </PageLayout>
  );
}

export default function EntitiesPage() {
  return (
    <Suspense fallback={<PageLayout className="p-4"><p className="text-gray-500">Loading...</p></PageLayout>}>
      <EntitiesPageContent />
    </Suspense>
  );
}
