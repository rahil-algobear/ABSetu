"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  entityTypeApi,
  activityTypeApi,
  listConfigApi,
} from "@/services/api";
import { ListColumnConfig, MetaFieldType } from "@/types";
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
import { GripVertical, ArrowUp, ArrowDown } from "lucide-react";
import toast from "react-hot-toast";

type SectionKind = "entity" | "activity";

const UNSORTABLE_META_TYPES: Set<string> = new Set(["multiselect", "boolean"]);

const SOURCE_LABELS: Record<string, string> = {
  static: "Built-in",
  dimension: "Dimension",
  meta: "Meta Field",
};

const META_TYPE_LABELS: Record<string, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  select: "Dropdown",
  multiselect: "Multi-select",
  boolean: "Yes/No",
};

export default function ListSettingsPage() {
  const queryClient = useQueryClient();

  const [activeSection, setActiveSection] = useState<SectionKind>("entity");
  const [activeTypeId, setActiveTypeId] = useState<string>("");

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

  const { data: columns = [], isLoading } = useQuery({
    queryKey: ["list-config", scope],
    queryFn: () => listConfigApi.get(scope),
    enabled: !!scope,
  });

  const [localColumns, setLocalColumns] = useState<ListColumnConfig[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  // Sync local state when server data changes
  const currentColumns = isDirty ? localColumns : columns;

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

  const saveMutation = useMutation({
    mutationFn: () => listConfigApi.update(scope, localColumns),
    onSuccess: () => {
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
    // Dimensions can't be sorted (requires join-based sort not supported)
    if (col.source === "dimension") return false;
    // Certain meta types can't be sorted
    if (col.source === "meta" && col.meta_type && UNSORTABLE_META_TYPES.has(col.meta_type)) return false;
    // Static count columns can't be sorted
    if (col.source === "static" && ["enrollment_count", "activity_count", "participant_count"].includes(col.key)) return false;
    return true;
  };

  const canToggleFilterable = (col: ListColumnConfig) => {
    // Only static fields with backend filter support can be toggled
    if (col.source === "static") {
      const filterableStatic = new Set(["created_at", "start_date"]);
      return filterableStatic.has(col.key);
    }
    return true;
  };

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
        ) : currentColumns.length === 0 ? (
          <p className="text-gray-500 text-sm">No columns configured. Select a type above.</p>
        ) : (
          <>
            <div className="bg-white shadow-sm border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">{""}</TableHead>
                    <TableHead>Column</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-center">Visible</TableHead>
                    <TableHead className="text-center">Filterable</TableHead>
                    <TableHead className="text-center">Sortable</TableHead>
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
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{col.label}</span>
                          {col.source === "meta" && col.meta_type && (
                            <Badge variant="secondary" className="text-xs">
                              {META_TYPE_LABELS[col.meta_type] || col.meta_type}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-gray-500 text-sm">
                          {SOURCE_LABELS[col.source] || col.source}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={col.visible}
                          onCheckedChange={(v) => updateColumn(idx, { visible: v })}
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

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
    </>
  );
}
