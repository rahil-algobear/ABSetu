"use client";

import { Suspense, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { entityApi, entityTypeApi, metaFieldSchemaApi } from "@/services/api";
import { Entity, ListColumnConfig, MetaFieldSchemaItem } from "@/types";
import { getFieldsForScope } from "@/utils/meta-fields";
import { Can } from "@/components/Auth/Permissions";
import { useListParams } from "@/hooks/useListParams";
import type { FilterDefinition } from "@/components/ui/filter-modal";

import { Button } from "@/components/ui/button";
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
import { PageContent } from "@/components/ui/page-content";
import { Plus, Pencil } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import { formatDate, formatDateTime, DATE_FORMATS } from "@/utils/date";

function EntityTypeEntitiesContent() {
  const { key: entityTypeKey } = useParams<{ key: string }>();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Entity | null>(null);
  const [metaValues, setMetaValues] = useState<Record<string, unknown>>({});

  // Find the entity type by key
  const { data: entityTypes = [] } = useQuery({
    queryKey: ["entity-types"],
    queryFn: entityTypeApi.list,
  });

  const entityType = entityTypes.find((et) => et.key === entityTypeKey);

  // Fetch filter definitions + column config (scoped by entity type)
  const { data: filterData } = useQuery({
    queryKey: ["entity-filters", entityType?.id],
    queryFn: () => entityApi.getFilters(entityType?.id),
    enabled: !!entityType,
  });

  const columns: ListColumnConfig[] = filterData?.columns || [];
  const sortableKeys = new Set(filterData?.sortable_keys || []);

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

  // Helper to render a cell value for a given column config
  const renderCellValue = (entity: Entity, col: ListColumnConfig) => {
    // Static built-in columns
    if (col.field_type === "static") {
      switch (col.key) {
        case "code":
          return entity.code || "—";
        case "enrollment_count":
          return entity.enrollment_count;
        case "activity_count":
          return entity.activity_count;
        case "created_at":
          return formatDate(entity.created_at, DATE_FORMATS.DISPLAY);
        case "created_by":
          return entity.created_by_name || "—";
        default:
          return "—";
      }
    }
    // Meta field columns (key format: "meta:{field_key}")
    const metaKey = col.key.replace(/^meta:/, "");
    const val = entity.meta?.[metaKey];
    if (val === undefined || val === null) return "—";
    if (col.field_type === "date" && typeof val === "string") return formatDate(val);
    if (col.field_type === "datetime" && typeof val === "string") return formatDateTime(val);
    if (Array.isArray(val)) return val.join(", ");
    if (typeof val === "boolean") return val ? "Yes" : "No";
    // Render name as a link
    if (col.label === "Name") {
      return (
        <Link
          href={`/entities/${entityTypeKey}/${entity.id}`}
          className="text-primary hover:underline"
          onClick={(ev) => ev.stopPropagation()}
        >
          {String(val)}
        </Link>
      );
    }
    return String(val);
  };

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
    setMetaValues({});
    setModalOpen(true);
  };

  const openEdit = (e: React.MouseEvent, item: Entity) => {
    e.stopPropagation();
    setEditing(item);
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
        data: { meta: meta || undefined },
      });
    } else {
      createMutation.mutate({
        entity_type_id: entityType!.id,
        meta,
      });
    }
  };

  // Meta fields for create/edit form
  const { data: allSchemas = [] } = useQuery<MetaFieldSchemaItem[]>({
    queryKey: ["meta-field-schemas"],
    queryFn: metaFieldSchemaApi.getAll,
  });
  const metaFields = useMemo(
    () => entityType ? getFieldsForScope(allSchemas, { type: "entity", entity_type_id: entityType.id }) : [],
    [allSchemas, entityType],
  );

  const typeName = entityType?.name || "Entity";

  return (
    <PageLayout>
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
      <PageContent>
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
          <Table stickyRows={1} className="max-h-[calc(100vh-400px)] lg:max-h-[calc(100vh-300px)]">
            <TableHeader>
              <TableRow>
                {columns.map((col) =>
                  sortableKeys.has(col.key) ? (
                    <SortableTableHead
                      key={col.key}
                      label={col.label}
                      sortKey={col.key}
                      currentSortBy={listParams.sortBy}
                      currentSortOrder={listParams.sortOrder}
                      onSort={listParams.setSorting}
                    />
                  ) : (
                    <TableHead key={col.key}>{col.label}</TableHead>
                  )
                )}
                <TableHead className="w-20 text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entities.map((e) => (
                <TableRow
                  key={e.id}
                  onClick={() => router.push(`/entities/${entityTypeKey}/${e.id}`)}
                >
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={col.label === "Name" ? "font-medium" : col.key === "created_at" ? "text-gray-500" : ""}
                    >
                      {renderCellValue(e, col)}
                    </TableCell>
                  ))}
                  <TableCell>
                    <div className="flex items-center justify-center gap-2">
                      <Can permission="entity:edit">
                        <button
                          onClick={(ev) => openEdit(ev, e)}
                          className="text-gray-400 hover:text-primary"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </Can>
                    </div>
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
          <DynamicMetaForm
            fields={metaFields.filter((f) => {
              if (f.visible === false) return false;
              // "edit only" fields should be hidden on create
              if (!editing && f.stage === "record") return false;
              return true;
            })}
            values={metaValues}
            onChange={setMetaValues}
            disabledKeys={(() => {
              const keys = new Set<string>();
              for (const f of metaFields) {
                // "create only" fields are visible but disabled on edit
                if (editing && f.stage === "create") keys.add(f.key);
              }
              return keys;
            })()}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit">{editing ? "Save" : "Create"}</Button>
          </div>
        </form>
      </Dialog>
      </PageContent>
    </PageLayout>
  );
}

export default function EntityTypeEntitiesPage() {
  return (
    <Suspense fallback={<PageLayout><PageContent><p className="text-gray-500 text-sm">Loading...</p></PageContent></PageLayout>}>
      <EntityTypeEntitiesContent />
    </Suspense>
  );
}
