"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  entityTypeApi,
  activityTypeApi,
  listConfigApi,
} from "@/services/api";
import { ListColumnConfig } from "@/types";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { PageContent } from "@/components/ui/page-content";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/page-table";
import { Dialog } from "@/components/ui/dialog";
import { GripVertical, ArrowUp, ArrowDown, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

type SectionKind = "entity" | "activity";

const UNSORTABLE_TYPES: Set<string> = new Set(["multiselect", "boolean", "dimension", "entity_list", "user_list"]);

const FIELD_TYPE_LABELS: Record<string, string> = {
  static: "Built-in",
  dimension: "Dimension",
  text: "Text",
  number: "Number",
  date: "Date",
  datetime: "Date & Time",
  select: "Dropdown",
  multiselect: "Multi-select",
  boolean: "Yes/No",
  entity_list: "Entity list",
  user_list: "User list",
};

export default function ListSettingsPage() {
  const queryClient = useQueryClient();

  const [activeSection, setActiveSection] = useState<SectionKind>("entity");
  const [activeTypeId, setActiveTypeId] = useState<string>("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set());

  const { data: entityTypes = [] } = useQuery({
    queryKey: ["entity-types"],
    queryFn: entityTypeApi.list,
    staleTime: 5 * 60 * 1000,
  });

  const { data: activityTypes = [] } = useQuery({
    queryKey: ["activity-types"],
    queryFn: activityTypeApi.list,
    staleTime: 5 * 60 * 1000,
  });

  const types = activeSection === "entity" ? entityTypes : activityTypes;

  // Auto-select first type when section changes
  const selectedTypeId = activeTypeId && types.find((t) => t.id === activeTypeId)
    ? activeTypeId
    : types[0]?.id || "";

  const scope = selectedTypeId
    ? `${activeSection}:${selectedTypeId}`
    : "";

  const { data: settings, isLoading } = useQuery({
    queryKey: ["list-config-settings", scope],
    queryFn: () => listConfigApi.getSettings(scope),
    enabled: !!scope,
  });

  const columns = settings?.columns || [];
  const availableColumns = settings?.available_columns || [];

  const [localColumns, setLocalColumns] = useState<ListColumnConfig[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  // Sync local state when server data changes
  const currentColumns = isDirty ? localColumns : columns;

  // Track which available columns are still available (accounting for local adds)
  const currentAvailable = isDirty
    ? availableColumns.filter((ac) => !localColumns.some((lc) => lc.key === ac.key))
    : availableColumns;

  const startEditing = (cols: ListColumnConfig[]) => {
    setLocalColumns([...cols]);
    setIsDirty(true);
  };

  const updateColumn = (index: number, updates: Partial<ListColumnConfig>) => {
    if (!isDirty) startEditing(columns);
    setLocalColumns((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
    setIsDirty(true);
  };

  const moveColumn = (index: number, direction: "up" | "down") => {
    const cols = isDirty ? [...localColumns] : [...columns];
    const swapIdx = direction === "up" ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= cols.length) return;
    // Swap sort_order values
    const tempOrder = cols[index].sort_order;
    cols[index] = { ...cols[index], sort_order: cols[swapIdx].sort_order };
    cols[swapIdx] = { ...cols[swapIdx], sort_order: tempOrder };
    // Swap positions in array
    [cols[index], cols[swapIdx]] = [cols[swapIdx], cols[index]];
    setLocalColumns(cols);
    setIsDirty(true);
  };

  const removeColumn = (index: number) => {
    const cols = isDirty ? [...localColumns] : [...columns];
    cols.splice(index, 1);
    // Re-number sort_order
    cols.forEach((c, i) => (c.sort_order = i));
    setLocalColumns(cols);
    setIsDirty(true);
  };

  const handleAddColumns = () => {
    const cols = isDirty ? [...localColumns] : [...columns];
    let maxOrder = cols.length;
    for (const key of selectedToAdd) {
      const col = availableColumns.find((ac) => ac.key === key);
      if (col) {
        cols.push({ ...col, sort_order: maxOrder, visible: true });
        maxOrder++;
      }
    }
    setLocalColumns(cols);
    setIsDirty(true);
    setSelectedToAdd(new Set());
    setShowAddModal(false);
  };

  const toggleAddSelection = (key: string) => {
    setSelectedToAdd((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const saveMutation = useMutation({
    mutationFn: () => listConfigApi.update(scope, localColumns),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list-config-settings", scope] });
      queryClient.invalidateQueries({ queryKey: ["list-config", scope] });
      queryClient.invalidateQueries({ queryKey: ["entity-filters"] });
      queryClient.invalidateQueries({ queryKey: ["activity-filters"] });
      setIsDirty(false);
      toast.success("List settings saved");
    },
    onError: () => toast.error("Failed to save"),
  });

  const handleSectionChange = (section: SectionKind) => {
    setActiveSection(section);
    setActiveTypeId("");
    setIsDirty(false);
  };

  const handleTypeChange = (typeId: string) => {
    setActiveTypeId(typeId);
    setIsDirty(false);
  };

  const canToggleSortable = (col: ListColumnConfig) => {
    if (UNSORTABLE_TYPES.has(col.field_type)) return false;
    if (col.field_type === "static" && ["enrollment_count", "activity_count", "participant_count"].includes(col.key)) return false;
    return true;
  };

  const canToggleFilterable = (col: ListColumnConfig) => {
    return !!col.filter_supported;
  };

  const canToggleSearchable = (col: ListColumnConfig) => {
    return !!col.search_supported;
  };

  const isStaticColumn = (col: ListColumnConfig) => col.field_type === "static";

  return (
    <>
      <PageHeader title="List Settings" />
      <PageContent>
        {/* Section tabs */}
        <div className="flex gap-2 mb-4">
          {(["entity", "activity"] as const).map((section) => (
            <button
              key={section}
              onClick={() => handleSectionChange(section)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeSection === section
                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                  : "text-gray-600 hover:bg-gray-100 border border-transparent"
              }`}
            >
              {section === "entity" ? "Entities" : "Activities"}
            </button>
          ))}
        </div>

        {/* Type selector (tab buttons) */}
        {types.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {types.map((t) => (
              <button
                key={t.id}
                onClick={() => handleTypeChange(t.id)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  selectedTypeId === t.id
                    ? "bg-purple-50 text-purple-700 border border-purple-200"
                    : "text-gray-600 hover:bg-gray-100 border border-gray-200"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}

        {/* Columns table */}
        {isLoading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : !scope ? (
          <p className="text-gray-500 text-sm">Select a type above.</p>
        ) : (
          <>
            {/* Add column button */}
            {currentAvailable.length > 0 && (
              <div className="flex justify-start mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedToAdd(new Set());
                    setShowAddModal(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Column
                </Button>
              </div>
            )}

            {currentColumns.length === 0 ? (
              <p className="text-gray-500 text-sm">No columns configured. Use &quot;Add Column&quot; to get started.</p>
            ) : (
              <div className="bg-white shadow-sm border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">{""}</TableHead>
                      <TableHead>Column</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-center">Visible</TableHead>
                      <TableHead className="text-center">Searchable</TableHead>
                      <TableHead className="text-center">Filterable</TableHead>
                      <TableHead className="text-center">Sortable</TableHead>
                      <TableHead className="w-12">{""}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentColumns.map((col, idx) => (
                      <TableRow key={col.key}>
                        <TableCell>
                          <div className="flex flex-col items-center gap-0.5">
                            <button
                              onClick={() => moveColumn(idx, "up")}
                              disabled={idx === 0}
                              className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <GripVertical className="h-4 w-4 text-gray-300" />
                            <button
                              onClick={() => moveColumn(idx, "down")}
                              disabled={idx === currentColumns.length - 1}
                              className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{col.label}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {FIELD_TYPE_LABELS[col.field_type] || col.field_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={col.visible}
                            onCheckedChange={(v) => updateColumn(idx, { visible: v })}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={col.searchable}
                            onCheckedChange={(v) => updateColumn(idx, { searchable: v })}
                            disabled={!canToggleSearchable(col)}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={col.filterable}
                            onCheckedChange={(v) => updateColumn(idx, { filterable: v })}
                            disabled={!canToggleFilterable(col)}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={col.sortable}
                            onCheckedChange={(v) => updateColumn(idx, { sortable: v })}
                            disabled={!canToggleSortable(col)}
                          />
                        </TableCell>
                        <TableCell>
                          {!isStaticColumn(col) && (
                            <button
                              onClick={() => removeColumn(idx)}
                              className="text-gray-400 hover:text-red-500 transition-colors"
                              title="Remove column"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex justify-end mt-4">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!isDirty || saveMutation.isPending}
              >
                {saveMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </>
        )}
      </PageContent>

      {/* Add Column Modal */}
      <Dialog
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Columns"
      >
        {currentAvailable.length === 0 ? (
          <p className="text-gray-500 text-sm">All available columns have been added.</p>
        ) : (
          <>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {currentAvailable.map((col) => (
                <label
                  key={col.key}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedToAdd.has(col.key)
                      ? "border-blue-300 bg-blue-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedToAdd.has(col.key)}
                    onChange={() => toggleAddSelection(col.key)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-medium text-sm">{col.label}</span>
                  <Badge variant="secondary" className="text-xs ml-auto">
                    {FIELD_TYPE_LABELS[col.field_type] || col.field_type}
                  </Badge>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAddColumns}
                disabled={selectedToAdd.size === 0}
              >
                Add {selectedToAdd.size > 0 ? `(${selectedToAdd.size})` : ""}
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </>
  );
}
