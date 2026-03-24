"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  activityTypeApi,
  activityFormApi,
  dimensionApi,
  entityTypeApi,
  metaFieldSchemaApi,
} from "@/services/api";
import {
  ActivityType,
  ActivityFormElement,
  Dimension,
  EntityType,
  MetaFieldSchemaItem,
} from "@/types";
import { findSchema } from "@/utils/meta-fields";
import { Can } from "@/components/Auth/Permissions";
import { PageHeader } from "@/components/ui/page-header";
import { PageContent } from "@/components/ui/page-content";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  ChevronUp,
  ChevronDown,
  Plus,
  Trash2,
  Asterisk,
  Layers,
  Users,
  SlidersHorizontal,
  Calendar,
  Type,
  FileText,
} from "lucide-react";
import toast from "react-hot-toast";

const ELEMENT_TYPES = [
  { value: "dimension", label: "Dimension", icon: Layers },
  { value: "participant_list", label: "Entity Type / Users", icon: Users },
  { value: "field", label: "Custom Field", icon: FileText },
];

const DEFAULT_ELEMENT_LABELS: Record<string, string> = {
  title: "Title",
  start_date: "Start Date",
  end_date: "End Date",
  notes: "Notes",
};

const SYSTEM_FIELD_KEYS = ["title", "start_date", "end_date", "notes"];

const DISPLAY_TYPES: Record<string, { value: string; label: string }[]> = {
  dimension: [
    { value: "dropdown", label: "Dropdown" },
    { value: "radio", label: "Radio buttons" },
    { value: "multiselect", label: "Multi-select" },
  ],
  participant_list: [
    { value: "checklist", label: "Checklist (attendance)" },
    { value: "search_select", label: "Search & select" },
    { value: "multi_select", label: "Multi-select" },
  ],
};

export default function FormBuilderPage() {
  const queryClient = useQueryClient();
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");
  const [elements, setElements] = useState<ActivityFormElement[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addType, setAddType] = useState<string>("dimension");
  const [addRefId, setAddRefId] = useState<string>("");
  const [addDisplayType, setAddDisplayType] = useState<string>("dropdown");

  // Data queries
  const { data: activityTypes = [] } = useQuery<ActivityType[]>({
    queryKey: ["activity-types"],
    queryFn: activityTypeApi.list,
  });

  const { data: dimensions = [] } = useQuery<Dimension[]>({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
  });

  const { data: entityTypes = [] } = useQuery<EntityType[]>({
    queryKey: ["entity-types"],
    queryFn: entityTypeApi.list,
  });

  const { data: allSchemas = [] } = useQuery<MetaFieldSchemaItem[]>({
    queryKey: ["meta-field-schemas"],
    queryFn: metaFieldSchemaApi.getAll,
  });

  // Load form when activity type changes
  const { data: formData, isLoading: formLoading } = useQuery({
    queryKey: ["activity-form", selectedTypeId],
    queryFn: () => activityFormApi.get(selectedTypeId),
    enabled: !!selectedTypeId,
  });

  // Sync form data into local state when it loads (only if user hasn't made changes)
  useEffect(() => {
    if (formData && !isDirty) {
      setElements(formData.elements || []);
    }
  }, [formData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select first activity type
  useEffect(() => {
    if (!selectedTypeId && activityTypes.length > 0) {
      setSelectedTypeId(activityTypes[0].id);
    }
  }, [activityTypes]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMutation = useMutation({
    mutationFn: () => activityFormApi.upsert(selectedTypeId, elements),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-form", selectedTypeId] });
      setIsDirty(false);
      toast.success("Form saved");
    },
    onError: () => toast.error("Failed to save form"),
  });

  // Available custom meta fields for "field" type
  const activityMetaFields = useMemo(() => {
    // Collect activity-scoped meta fields from schemas
    const fields: { key: string; label: string }[] = [];
    const seenKeys = new Set<string>();
    for (const schema of allSchemas) {
      if (schema.scope.type !== "activity") continue;
      for (const f of schema.fields) {
        if (SYSTEM_FIELD_KEYS.includes(f.key)) continue;
        if (seenKeys.has(f.key)) continue;
        seenKeys.add(f.key);
        fields.push({ key: f.key, label: f.label });
      }
    }
    return fields;
  }, [allSchemas]);

  // Element helpers
  const updateElement = (index: number, updates: Partial<ActivityFormElement>) => {
    setElements(elements.map((el, i) => (i === index ? { ...el, ...updates } : el)));
    setIsDirty(true);
  };

  const isSystemField = (refKey?: string | null): boolean => {
    return !!refKey && SYSTEM_FIELD_KEYS.includes(refKey);
  };

  const removeElement = (index: number) => {
    const el = elements[index];
    if (el?.type === "field" && isSystemField(el.ref_key)) return;
    setElements(elements.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  const moveElement = (index: number, direction: "up" | "down") => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= elements.length) return;
    const updated = [...elements];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    // Update sort_order
    updated.forEach((el, i) => (el.sort_order = i));
    setElements(updated);
    setIsDirty(true);
  };

  const handleAddElement = () => {
    const needsRef = addType === "dimension" || addType === "participant_list" || addType === "field";
    if (needsRef && !addRefId) {
      toast.error("Please select a reference");
      return;
    }

    let newElement: ActivityFormElement;

    if (addType === "dimension") {
      newElement = {
        type: "dimension",
        dimension_id: addRefId,
        sort_order: elements.length,
        display_type: addDisplayType,
        required: false,
      };
    } else if (addType === "participant_list") {
      newElement = {
        type: "participant_list",
        entity_type_id: addRefId,
        sort_order: elements.length,
        display_type: addDisplayType,
        required: false,
      };
    } else {
      // field
      newElement = {
        type: "field",
        ref_key: addRefId,
        sort_order: elements.length,
      };
    }

    setElements([...elements, newElement]);
    setIsDirty(true);
    setAddModalOpen(false);
  };

  const openAddModal = () => {
    setAddType("dimension");
    setAddRefId("");
    setAddDisplayType("dropdown");
    setAddModalOpen(false);
    // Small delay so state resets
    setTimeout(() => setAddModalOpen(true), 0);
  };

  // Build a field key → label lookup from meta schemas (includes system fields)
  const fieldLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const schema of allSchemas) {
      if (schema.scope.type !== "activity") continue;
      for (const f of schema.fields) {
        if (!map[f.key]) map[f.key] = f.label;
      }
    }
    return map;
  }, [allSchemas]);

  // Build a field key → visible lookup
  const fieldVisibleMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const schema of allSchemas) {
      if (schema.scope.type !== "activity") continue;
      for (const f of schema.fields) {
        if (!(f.key in map)) map[f.key] = f.visible !== false;
      }
    }
    return map;
  }, [allSchemas]);

  // Resolve element label
  const getElementLabel = (el: ActivityFormElement): string => {
    switch (el.type) {
      case "field":
        return fieldLabelMap[el.ref_key || ""] || DEFAULT_ELEMENT_LABELS[el.ref_key || ""] || el.ref_key || "Field";
      case "dimension": {
        const dim = dimensions.find((d) => d.id === el.dimension_id);
        return dim ? dim.name : "Dimension";
      }
      case "participant_list": {
        if (el.entity_type_id === "user") return "Users (staff)";
        const et = entityTypes.find((t) => t.id === el.entity_type_id);
        return et?.name || "Entity Type";
      }
      default:
        return el.type;
    }
  };

  const getElementIcon = (type: string, refKey?: string | null) => {
    if (type === "field" && refKey === "title") return Type;
    if (type === "field") return Calendar;
    const def = ELEMENT_TYPES.find((t) => t.value === type);
    return def?.icon || SlidersHorizontal;
  };

  // Check for participation meta fields for an entity type
  const getParticipationMetaCount = (el: ActivityFormElement): number => {
    if (el.type !== "participant_list" || !el.entity_type_id) return 0;
    let count = 0;
    count += findSchema(allSchemas, { type: "participant", entity_type_id: el.entity_type_id })?.fields?.length || 0;
    if (selectedTypeId) {
      count += findSchema(allSchemas, { type: "participant", entity_type_id: el.entity_type_id, activity_type_id: selectedTypeId })?.fields?.length || 0;
    }
    return count;
  };

  // Check if element already exists
  const isElementAdded = (type: string, refId?: string): boolean => {
    return elements.some((el) => {
      if (el.type !== type) return false;
      if (type === "dimension") return el.dimension_id === refId;
      if (type === "participant_list") return el.entity_type_id === refId;
      if (type === "field") return el.ref_key === refId;
      return false;
    });
  };

  const selectedType = activityTypes.find((c) => c.id === selectedTypeId);

  return (
    <>
      <PageHeader
        title="Form Builder"
        description="Configure what form elements appear when recording an activity. Choose an activity type and add the elements you want."
      />
      <PageContent>
      {/* Activity Type selector */}
      <div className="mb-6">
        <Label className="text-sm mb-1 block">Activity Type</Label>
        <select
          className="border rounded-md px-3 py-2 text-sm w-full max-w-xs"
          value={selectedTypeId}
          onChange={(e) => {
            setSelectedTypeId(e.target.value);
            setIsDirty(false);
          }}
        >
          {activityTypes.length === 0 && (
            <option value="">No activity types yet</option>
          )}
          {activityTypes.map((at) => (
            <option key={at.id} value={at.id}>
              {at.name}
            </option>
          ))}
        </select>
      </div>

      {selectedTypeId && !formLoading && (
        <>
          {/* Elements list */}
          <div className="flex items-center justify-between mb-3">
            <Label className="text-sm font-semibold">
              Form Elements for &ldquo;{selectedType?.name}&rdquo;
            </Label>
            <Can permission="activity_type:manage">
              <Button type="button" size="sm" variant="outline" onClick={openAddModal}>
                <Plus className="h-3 w-3 mr-1" />
                Add Element
              </Button>
            </Can>
          </div>

          {elements.length === 0 ? (
            <div className="border rounded-md p-8 text-center text-gray-400">
              <p className="text-sm">No form elements yet.</p>
              <p className="text-xs mt-1">
                Add elements to define what appears when recording an activity of this type.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {elements.map((el, idx) => {
                const Icon = getElementIcon(el.type, el.type === "field" ? el.ref_key : undefined);
                const metaCount = getParticipationMetaCount(el);
                const isDefault = el.type === "field" && isSystemField(el.ref_key);
                const isHidden = el.type === "field" && el.ref_key && fieldVisibleMap[el.ref_key] === false;
                const isRemovable = !isDefault;
                const isStructural = el.type === "dimension" || el.type === "participant_list";
                const isTitleEl = el.type === "field" && el.ref_key === "title";
                const titleConfig = isTitleEl ? (el.config || { mode: "free_text" }) : null;
                const titleMode = titleConfig?.mode as string || "free_text";
                return (
                  <div key={`${el.type}-${el.ref_key || el.dimension_id || el.entity_type_id}-${idx}`}>
                    <div
                      className={`border rounded-lg p-3 flex items-center gap-3 bg-white ${
                        isDefault ? "border-purple-200" : ""
                      } ${isTitleEl && titleConfig ? "rounded-b-none" : ""} ${isHidden ? "opacity-50" : ""}`}
                    >
                      {/* Reorder */}
                      <div className="flex flex-col -space-y-1">
                        <button
                          type="button"
                          onClick={() => moveElement(idx, "up")}
                          disabled={idx === 0}
                          className="text-gray-400 hover:text-purple-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveElement(idx, "down")}
                          disabled={idx === elements.length - 1}
                          className="text-gray-400 hover:text-purple-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Icon + Label */}
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Icon className="h-4 w-4 text-purple-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {getElementLabel(el)}
                            {isDefault && (
                              <span className="ml-1.5 text-[10px] font-medium text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                                System
                              </span>
                            )}
                            {isHidden && (
                              <span className="ml-1.5 text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                                Hidden
                              </span>
                            )}
                            {isTitleEl && (
                              <span className="ml-1.5 text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                {titleMode === "generated" ? "Generated" : "Free text"}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400">
                            {isDefault
                              ? "System field"
                              : el.type === "field"
                                ? "Custom field"
                                : (ELEMENT_TYPES.find((t) => t.value === el.type)?.label || el.type)}
                            {isStructural && (
                              <>
                                {" \u00b7 "}
                                {DISPLAY_TYPES[el.type]?.find((d) => d.value === el.display_type)?.label || el.display_type}
                              </>
                            )}
                            {el.required && (
                              <span className="ml-1 text-red-500">
                                {" \u00b7 "}required
                              </span>
                            )}
                            {!isDefault && el.type === "field" && (
                              <span className="ml-1 text-gray-400">
                                {" \u00b7 "}configured in Form Fields
                              </span>
                            )}
                            {metaCount > 0 && (
                              <span className="ml-1 text-purple-500">
                                {" \u00b7 "}{metaCount} participation field{metaCount !== 1 ? "s" : ""}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Controls only for structural elements (dimension, participant_list) */}
                      {isStructural && (
                        <>
                          {/* Display type selector */}
                          <select
                            className="border rounded-md px-2 py-1 text-xs"
                            value={el.display_type || ""}
                            onChange={(e) => updateElement(idx, { display_type: e.target.value })}
                          >
                            {(DISPLAY_TYPES[el.type] || []).map((d) => (
                              <option key={d.value} value={d.value}>{d.label}</option>
                            ))}
                          </select>

                          {/* Required toggle */}
                          <button
                            type="button"
                            onClick={() => updateElement(idx, { required: !el.required })}
                            className={el.required ? "text-red-500 hover:text-red-700" : "text-gray-300 hover:text-red-500"}
                            title={el.required ? "Required (click to make optional)" : "Optional (click to make required)"}
                          >
                            <Asterisk className="h-4 w-4" />
                          </button>
                        </>
                      )}

                      {/* Remove (disabled for system field elements) */}
                      <Can permission="activity_type:manage">
                        <button
                          type="button"
                          onClick={() => removeElement(idx)}
                          disabled={!isRemovable}
                          className={isRemovable
                            ? "text-gray-400 hover:text-red-500"
                            : "text-gray-200 cursor-not-allowed"
                          }
                          title={isRemovable ? "Remove" : "System fields cannot be removed"}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </Can>
                    </div>

                    {/* Title element config panel */}
                    {isTitleEl && (
                      <div className="border border-t-0 border-purple-200 rounded-b-lg px-4 py-3 bg-purple-50/30 space-y-3">
                        <div>
                          <Label className="text-xs font-medium mb-1.5 block">Title Mode</Label>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                updateElement(idx, { config: { mode: "free_text" } })
                              }
                              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                                titleMode === "free_text"
                                  ? "bg-purple-100 border-purple-300 text-purple-700"
                                  : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                              }`}
                            >
                              Free text
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateElement(idx, {
                                  config: {
                                    mode: "generated",
                                    dimension_ids: (titleConfig?.dimension_ids as string[]) || [],
                                    separator: (titleConfig?.separator as string) || " - ",
                                  },
                                })
                              }
                              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                                titleMode === "generated"
                                  ? "bg-purple-100 border-purple-300 text-purple-700"
                                  : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                              }`}
                            >
                              Generated from dimensions
                            </button>
                          </div>
                        </div>

                        {titleMode === "generated" && (
                          <>
                            <div>
                              <Label className="text-xs font-medium mb-1.5 block">
                                Dimensions to include (in order)
                              </Label>
                              <div className="space-y-1">
                                {dimensions.map((dim) => {
                                  const dimIds = (titleConfig?.dimension_ids as string[]) || [];
                                  const isChecked = dimIds.includes(dim.id);
                                  return (
                                    <label key={dim.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={(e) => {
                                          const newIds = e.target.checked
                                            ? [...dimIds, dim.id]
                                            : dimIds.filter((id) => id !== dim.id);
                                          updateElement(idx, {
                                            config: {
                                              ...titleConfig,
                                              dimension_ids: newIds,
                                            },
                                          });
                                        }}
                                        className="rounded"
                                      />
                                      {dim.name}
                                    </label>
                                  );
                                })}
                              </div>
                              {dimensions.length === 0 && (
                                <p className="text-xs text-gray-400">No dimensions defined yet.</p>
                              )}
                            </div>
                            <div>
                              <Label className="text-xs font-medium mb-1 block">Separator</Label>
                              <Input
                                className="max-w-[120px] text-sm h-8"
                                value={(titleConfig?.separator as string) || " - "}
                                onChange={(e) =>
                                  updateElement(idx, {
                                    config: {
                                      ...titleConfig,
                                      separator: e.target.value,
                                    },
                                  })
                                }
                                placeholder=" - "
                              />
                            </div>
                          </>
                        )}

                        {titleMode === "free_text" && (
                          <p className="text-xs text-gray-500">
                            Users will type a title manually when creating or editing an activity.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Participation meta hint */}
          {elements.some((el) => el.type === "participant_list") && (
            <p className="text-xs text-gray-400 mt-4">
              To configure participation meta fields (attendance status, scores, etc.) for each entity type,
              go to <a href="/admin/meta-fields" className="text-purple-600 underline">Form Fields</a> and
              use the &ldquo;Participant fields&rdquo; section.
            </p>
          )}
        </>
      )}

      <Can permission="activity_type:manage">
        <div className="flex justify-end mt-4">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!isDirty || saveMutation.isPending}
          >
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </Can>

      {/* Add Element Modal */}
      <Dialog
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add Form Element"
      >
        <div className="space-y-4">
          {/* Element type */}
          <div>
            <Label className="text-sm mb-2 block">Element Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {ELEMENT_TYPES.map((et) => {
                return (
                  <button
                    key={et.value}
                    type="button"
                    onClick={() => {
                      setAddType(et.value);
                      setAddRefId("");
                      setAddDisplayType(DISPLAY_TYPES[et.value]?.[0]?.value || "dropdown");
                    }}
                    className={`flex items-center gap-2 p-3 rounded-lg border text-sm text-left transition-colors ${
                      addType === et.value
                        ? "border-purple-300 bg-purple-50 text-purple-700"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <et.icon className="h-4 w-4 shrink-0" />
                    {et.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reference selector for dimension */}
          {addType === "dimension" && (
            <div>
              <Label className="text-sm mb-1 block">Dimension</Label>
              <select
                className="w-full border rounded-md p-2 text-sm"
                value={addRefId}
                onChange={(e) => setAddRefId(e.target.value)}
              >
                <option value="">Select a dimension...</option>
                {dimensions
                  .filter((d) => !isElementAdded("dimension", d.id))
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Reference selector for participant_list */}
          {addType === "participant_list" && (
            <div>
              <Label className="text-sm mb-1 block">Entity Type</Label>
              <select
                className="w-full border rounded-md p-2 text-sm"
                value={addRefId}
                onChange={(e) => setAddRefId(e.target.value)}
              >
                <option value="">Select...</option>
                {!isElementAdded("participant_list", "user") && (
                  <option value="user">Users (staff/facilitators)</option>
                )}
                {entityTypes
                  .filter((et) => !isElementAdded("participant_list", et.id))
                  .map((et) => (
                    <option key={et.id} value={et.id}>
                      {et.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Reference selector for field (custom meta fields) */}
          {addType === "field" && (
            <div>
              <Label className="text-sm mb-1 block">Custom Meta Field</Label>
              <select
                className="w-full border rounded-md p-2 text-sm"
                value={addRefId}
                onChange={(e) => setAddRefId(e.target.value)}
              >
                <option value="">Select a field...</option>
                {activityMetaFields
                  .filter((f) => !isElementAdded("field", f.key))
                  .map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label} ({f.key})
                    </option>
                  ))}
              </select>
              {activityMetaFields.length === 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  No custom activity meta fields defined yet. Define them in{" "}
                  <a href="/admin/meta-fields" className="text-purple-600 underline">Form Fields</a>.
                </p>
              )}
            </div>
          )}

          {/* Display type (only for structural elements) */}
          {(addType === "dimension" || addType === "participant_list") && (
            <div>
              <Label className="text-sm mb-1 block">Display Type</Label>
              <select
                className="w-full border rounded-md p-2 text-sm"
                value={addDisplayType}
                onChange={(e) => setAddDisplayType(e.target.value)}
              >
                {(DISPLAY_TYPES[addType] || []).map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleAddElement}>
              Add
            </Button>
          </div>
        </div>
      </Dialog>
      </PageContent>
    </>
  );
}
