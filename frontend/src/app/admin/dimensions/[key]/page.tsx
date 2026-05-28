"use client";

import { Suspense, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dimensionApi, metaFieldSchemaApi } from "@/services/api";
import { Dimension, DimensionValue, MetaFieldDefinition, MetaFieldSchemaItem } from "@/types";
import { getFieldsForScope } from "@/utils/meta-fields";
import { Can, usePermissions } from "@/components/Auth/Permissions";
import { useListParams } from "@/hooks/useListParams";
import { DimensionMatrixDialog } from "@/components/DimensionMatrixDialog";
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
import { DynamicMetaForm } from "@/components/DynamicMetaForm";
import { PageHeader } from "@/components/ui/page-header";
import { PageContent } from "@/components/ui/page-content";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Plus, Pencil, Trash2, LayoutGrid } from "lucide-react";
import toast from "react-hot-toast";

const SORTABLE_COLUMNS = [{ key: "name", label: "Name" }];

function DimensionValuesPageContent() {
  const params = useParams();
  const dimensionKey = params.key as string;
  const { can } = usePermissions();
  const canManage = can("dimension:manage");
  const queryClient = useQueryClient();
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingValue, setEditingValue] = useState<DimensionValue | null>(null);
  const [form, setForm] = useState({ name: "" });
  const [metaValues, setMetaValues] = useState<Record<string, unknown>>({});

  const { data: dimensions = [] } = useQuery<Dimension[]>({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
  });

  const dimension = dimensions.find((d) => d.key === dimensionKey);

  const listParams = useListParams({
    defaultSortBy: "name",
    defaultSortOrder: "asc",
    columns: SORTABLE_COLUMNS,
  });

  const { data: values = [], isLoading } = useQuery<DimensionValue[]>({
    queryKey: ["dimension-values", dimension?.id, listParams.apiParams],
    queryFn: () =>
      dimensionApi.listValues(dimension!.id, {
        search: listParams.apiParams.search,
        sort_by: listParams.apiParams.sort_by,
        sort_order: listParams.apiParams.sort_order,
      }),
    enabled: !!dimension,
  });

  const { data: allSchemas = [] } = useQuery<MetaFieldSchemaItem[]>({
    queryKey: ["meta-field-schemas"],
    queryFn: metaFieldSchemaApi.getAll,
  });
  const metaFields = useMemo(
    () => dimension ? getFieldsForScope(allSchemas, { type: "dimension", dimension_id: dimension.id }) : [],
    [allSchemas, dimension],
  );

  const createMutation = useMutation({
    mutationFn: (data: { name: string; meta?: Record<string, unknown> }) =>
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

  const openAdd = () => {
    setEditingValue(null);
    setForm({ name: "" });
    setMetaValues({});
    setModalOpen(true);
  };

  const openEdit = (value: DimensionValue) => {
    setEditingValue(value);
    setForm({ name: value.name });
    setMetaValues(value.meta || {});
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingValue(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const meta = Object.keys(metaValues).length > 0 ? metaValues : undefined;
    if (editingValue) {
      updateMutation.mutate({ id: editingValue.id, data: { name: form.name, meta: meta || null } });
    } else {
      createMutation.mutate({ name: form.name, meta });
    }
  };

  if (!dimension) {
    return <p className="text-gray-500 text-sm">Dimension not found.</p>;
  }

  return (
    <>
      <PageHeader
        title={dimension.name}
        actions={
          <div className="flex gap-2">
            {dimensions.length > 1 && (
              <Button size="sm" variant="outline" onClick={() => setMatrixOpen(true)}>
                <LayoutGrid className="h-4 w-4 mr-1" />
                View Matrix
              </Button>
            )}
            <Can permission="dimension:manage">
              <Button size="sm" onClick={openAdd}>
                <Plus className="h-4 w-4 mr-1" />
                Add {dimension.name}
              </Button>
            </Can>
          </div>
        }
      />
      <PageContent>
      <ListToolbar
        search={listParams.search}
        onSearchChange={listParams.setSearch}
        filterDefinitions={[]}
        activeFilters={[]}
        onFiltersChange={() => {}}
        onRemoveFilter={() => {}}
        searchPlaceholder={`Search ${dimension.name.toLowerCase()}...`}
      />
      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : values.length === 0 ? (
        <p className="text-gray-500 text-sm">
          {listParams.search ? "No matches." : "No values yet."}
        </p>
      ) : (
        <div className="bg-white shadow-sm border rounded-lg overflow-hidden">
        <Table stickyRows={1} className="max-h-[calc(100vh-400px)] lg:max-h-[calc(100vh-300px)]">
          <TableHeader>
            <TableRow>
              <SortableTableHead
                label="Name"
                sortKey="name"
                currentSortBy={listParams.sortBy}
                currentSortOrder={listParams.sortOrder}
                onSort={listParams.setSorting}
              />
              {metaFields.map((f) => (
                <TableHead key={f.key}>{f.label}</TableHead>
              ))}
              {canManage && <TableHead className="w-20 text-center">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {values.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="font-medium">{v.name}</TableCell>
                {metaFields.map((f) => (
                  <TableCell key={f.key}>
                    {v.meta?.[f.key] !== undefined
                      ? String(v.meta[f.key])
                      : "—"}
                  </TableCell>
                ))}
                {canManage && (
                  <TableCell>
                    <div className="flex items-center justify-center gap-2">
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
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      )}

      <Dialog
        open={modalOpen}
        onClose={closeModal}
        title={editingValue ? `Edit ${dimension.name}` : `Add ${dimension.name}`}
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
          <DynamicMetaForm
            fields={metaFields.filter((f) => f.visible !== false)}
            values={metaValues}
            onChange={setMetaValues}
            disabledKeys={(() => {
              const keys = new Set<string>();
              for (const f of metaFields) {
                if (editingValue && f.stage === "create") keys.add(f.key);
                if (!editingValue && f.stage === "edit") keys.add(f.key);
              }
              return keys;
            })()}
          />
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

      <DimensionMatrixDialog
        open={matrixOpen}
        onClose={() => setMatrixOpen(false)}
        defaultRowDimKey={dimensionKey}
      />
      </PageContent>
    </>
  );
}

export default function DimensionValuesPage() {
  return (
    <Suspense fallback={<PageContent><p className="text-gray-500">Loading...</p></PageContent>}>
      <DimensionValuesPageContent />
    </Suspense>
  );
}
