"use client";

import { Suspense, useState, useMemo, useRef } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { entityApi, entityTypeApi, metaFieldSchemaApi, type EntityExportParams } from "@/services/api";
import { Entity, ListColumnConfig, MetaFieldSchemaItem } from "@/types";
import { Can, usePermissions } from "@/components/Auth/Permissions";
import { useListParams } from "@/hooks/useListParams";
import { useExport } from "@/hooks/useExport";
import { withFrom } from "@/hooks/useFromLink";
import { ExportMenu, type ExportScope } from "@/components/ui/export-menu";
import type { FilterDefinition } from "@/components/ui/filter-modal";
import { type FormValues } from "@/utils/field-visibility";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EntityFields, type EntityFieldsHandle } from "@/components/EntityFields";
import { EnrollmentForm } from "@/components/EnrollmentForm";
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
import { Plus, Pencil, UserPlus } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import { formatDate, formatDateTime, DATE_FORMATS } from "@/utils/date";

function EntityTypeEntitiesContent() {
  const { key: entityTypeKey } = useParams<{ key: string }>();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Entity | null>(null);
  const [values, setValues] = useState<FormValues>({ meta: {}, dimensions: [] });
  const [quickEnrollEntity, setQuickEnrollEntity] = useState<Entity | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const entityFieldsRef = useRef<EntityFieldsHandle>(null);

  // Find the entity type by key
  const { data: entityTypes = [] } = useQuery({
    queryKey: ["entity-types"],
    queryFn: entityTypeApi.list,
  });

  const entityType = entityTypes.find((et) => et.key === entityTypeKey);

  const backLabel = entityType?.name || "Back";
  const search = searchParams.toString();
  const fromUrl = search ? `${pathname}?${search}` : pathname;

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
      section: f.section,
      options: f.options,
      min: f.min,
      max: f.max,
    }));
  }, [filterData]);

  // Definitions for the filter modal (without entity_type_id — implicit from URL)
  const filterDefinitions: FilterDefinition[] = useMemo(() => {
    return allFilterDefs.filter((f) => f.key !== "entity_type_id");
  }, [allFilterDefs]);

  // List params from URL — uses filter defs + columns for slug mapping
  // (columns cover sortable-only fields that aren't in filter defs).
  const listParams = useListParams({
    defaultSortBy: "created_at",
    defaultSortOrder: "desc",
    filterDefinitions: allFilterDefs,
    columns,
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

  // Excel export — reuses the active search/filters/sort for "current view",
  // or just the entity-type scope for "all". Backend applies the same
  // org + dimension scoping as the list.
  const { can } = usePermissions();
  const { isExporting, runExport } = useExport();
  const handleExport = (scope: ExportScope) => {
    if (!entityType) return;
    const params: EntityExportParams = {
      entity_type_id: entityType.id,
      sort_by: listParams.apiParams.sort_by,
      sort_order: listParams.apiParams.sort_order,
    };
    if (scope === "current") {
      params.search = listParams.apiParams.search;
      params.filters = listParams.apiParams.filters;
    }
    runExport(() => entityApi.export(params));
  };

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
          href={withFrom(
            `/entities/${entityTypeKey}/${entity.id}`,
            fromUrl,
            backLabel,
          )}
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
    setValues({ meta: {}, dimensions: [] });
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (e: React.MouseEvent, item: Entity) => {
    e.stopPropagation();
    setEditing(item);
    setValues({ meta: item.meta || {}, dimensions: [] });
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setFormError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const validationError = entityFieldsRef.current?.validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    // Translate FormValues → backend shape at the API boundary.
    const meta = Object.keys(values.meta).length > 0 ? values.meta : undefined;
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

  // Meta-field schemas (used by EntityFields + EnrollmentForm below).
  const { data: allSchemas = [] } = useQuery<MetaFieldSchemaItem[]>({
    queryKey: ["meta-field-schemas"],
    queryFn: metaFieldSchemaApi.getAll,
  });

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
        actions={
          can("entity:export") ? (
            <ExportMenu
              onExport={handleExport}
              isExporting={isExporting}
              hasActiveFilters={listParams.activeFilters.length > 0}
            />
          ) : undefined
        }
      />

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : entities.length === 0 ? (
        <p className="text-gray-500 text-sm">No {typeName.toLowerCase()} found.</p>
      ) : (
        <>
          <div className="bg-white shadow-sm border rounded-lg overflow-hidden">
          <Table stickyRows={1} className="max-h-[calc(100vh-400px)] lg:max-h-[calc(100vh-200px)]">
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
                  onClick={() =>
                    router.push(
                      withFrom(
                        `/entities/${entityTypeKey}/${e.id}`,
                        fromUrl,
                        backLabel,
                      ),
                    )
                  }
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
                      {entityType?.can_enroll && (
                        <Can permission="enrollment:manage">
                          <button
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setQuickEnrollEntity(e);
                            }}
                            className="text-gray-400 hover:text-primary"
                            title="Quick Enroll"
                          >
                            <UserPlus className="h-4 w-4" />
                          </button>
                        </Can>
                      )}
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
        open={!!quickEnrollEntity}
        onClose={() => setQuickEnrollEntity(null)}
        title={`Enroll ${typeName}`}
      >
        {quickEnrollEntity && entityType && (
          <EnrollmentForm
            entityId={quickEnrollEntity.id}
            entityTypeId={entityType.id}
            allSchemas={allSchemas}
            onSuccess={() => {
              setQuickEnrollEntity(null);
              queryClient.invalidateQueries({ queryKey: ["entities"] });
            }}
            onCancel={() => setQuickEnrollEntity(null)}
          />
        )}
      </Dialog>

      <Dialog
        open={modalOpen}
        onClose={closeModal}
        title={editing ? `Edit ${typeName}` : `Add ${typeName}`}
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          {formError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}
          {entityType && (
            <EntityFields
              ref={entityFieldsRef}
              entityTypeId={entityType.id}
              allSchemas={allSchemas}
              values={values}
              onChange={setValues}
              mode={editing ? "edit" : "create"}
            />
          )}
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
