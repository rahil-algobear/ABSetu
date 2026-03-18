"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  activityCategoryApi,
  activityFormApi,
  dimensionApi,
  entityTypeApi,
  metaFieldSchemaApi,
} from "@/services/api";
import {
  ActivityCategory,
  ActivityFormElement,
  Dimension,
  EntityType,
  MetaFieldSchemas,
} from "@/types";
import { Can } from "@/components/Auth/Permissions";
import { useVocabulary } from "@/hooks/useVocabulary";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import {
  ChevronUp,
  ChevronDown,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Asterisk,
  Save,
  Layers,
  Users,
  SlidersHorizontal,
} from "lucide-react";
import toast from "react-hot-toast";

const ELEMENT_TYPES = [
  { value: "dimension", label: "Dimension", icon: Layers },
  { value: "entity_type", label: "Entity Type / Users", icon: Users },
  { value: "activity_meta", label: "Activity Meta", icon: SlidersHorizontal },
];

const DISPLAY_TYPES: Record<string, { value: string; label: string }[]> = {
  dimension: [
    { value: "dropdown", label: "Dropdown" },
    { value: "radio", label: "Radio buttons" },
    { value: "multiselect", label: "Multi-select" },
  ],
  entity_type: [
    { value: "checklist", label: "Checklist (attendance)" },
    { value: "search_select", label: "Search & select" },
    { value: "multi_select", label: "Multi-select" },
  ],
  activity_meta: [
    { value: "form", label: "Form fields" },
  ],
};

export default function FormBuilderPage() {
  const queryClient = useQueryClient();
  const { v, vPlural, vDim } = useVocabulary();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [elements, setElements] = useState<ActivityFormElement[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addType, setAddType] = useState<string>("dimension");
  const [addRefId, setAddRefId] = useState<string>("");
  const [addDisplayType, setAddDisplayType] = useState<string>("dropdown");

  // Data queries
  const { data: categories = [] } = useQuery<ActivityCategory[]>({
    queryKey: ["activity-categories"],
    queryFn: activityCategoryApi.list,
  });

  const { data: dimensions = [] } = useQuery<Dimension[]>({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
  });

  const { data: entityTypes = [] } = useQuery<EntityType[]>({
    queryKey: ["entity-types"],
    queryFn: entityTypeApi.list,
  });

  const { data: allSchemas = {} as MetaFieldSchemas } = useQuery<MetaFieldSchemas>({
    queryKey: ["meta-field-schemas"],
    queryFn: metaFieldSchemaApi.getAll,
  });

  // Load form when category changes
  const { data: formData, isLoading: formLoading } = useQuery({
    queryKey: ["activity-form", selectedCategoryId],
    queryFn: () => activityFormApi.get(selectedCategoryId),
    enabled: !!selectedCategoryId,
  });

  // Sync form data into local state when it loads (only if user hasn't made changes)
  useEffect(() => {
    if (formData && !isDirty) {
      setElements(formData.elements || []);
    }
  }, [formData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select first category
  useEffect(() => {
    if (!selectedCategoryId && categories.length > 0) {
      setSelectedCategoryId(categories[0].id);
    }
  }, [categories]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMutation = useMutation({
    mutationFn: () => activityFormApi.upsert(selectedCategoryId, elements),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-form", selectedCategoryId] });
      setIsDirty(false);
      toast.success("Form saved");
    },
    onError: () => toast.error("Failed to save form"),
  });

  // Element helpers
  const updateElement = (index: number, updates: Partial<ActivityFormElement>) => {
    setElements(elements.map((el, i) => (i === index ? { ...el, ...updates } : el)));
    setIsDirty(true);
  };

  const removeElement = (index: number) => {
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
    const needsRef = addType === "dimension" || addType === "entity_type";
    if (needsRef && !addRefId) {
      toast.error("Please select a reference");
      return;
    }

    const newElement: ActivityFormElement = {
      type: addType as ActivityFormElement["type"],
      ref_id: needsRef ? addRefId : null,
      sort_order: elements.length,
      display_type: addDisplayType,
      visible: true,
      required: false,
    };

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

  // Resolve element label
  const getElementLabel = (el: ActivityFormElement): string => {
    switch (el.type) {
      case "dimension": {
        const dim = dimensions.find((d) => d.id === el.ref_id);
        return dim ? vDim(dim) : "Dimension";
      }
      case "entity_type": {
        if (el.ref_id === "user") return "Users (staff)";
        const et = entityTypes.find((t) => t.id === el.ref_id);
        return et?.name || "Entity Type";
      }
      case "activity_meta":
        return "Activity Meta Fields";
      default:
        return el.type;
    }
  };

  const getElementIcon = (type: string) => {
    const def = ELEMENT_TYPES.find((t) => t.value === type);
    return def?.icon || SlidersHorizontal;
  };

  // Check for participation meta fields for an entity type
  const getParticipationMetaCount = (el: ActivityFormElement): number => {
    if (el.type !== "entity_type" || !el.ref_id) return 0;
    let count = 0;
    // Check participant:entity:{id}
    const baseKey = `participant:entity:${el.ref_id}`;
    count += allSchemas[baseKey]?.length || 0;
    // Check participant:entity:{id}:category:{categoryId}
    if (selectedCategoryId) {
      const catKey = `${baseKey}:category:${selectedCategoryId}`;
      count += allSchemas[catKey]?.length || 0;
    }
    return count;
  };

  // Check if element already exists
  const isElementAdded = (type: string, refId?: string): boolean => {
    return elements.some(
      (el) => el.type === type && (type === "activity_meta" || el.ref_id === refId)
    );
  };

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Form Builder</h2>
        <Can permission="activity_type:manage">
          {isDirty && (
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              <Save className="h-4 w-4 mr-1" />
              Save
            </Button>
          )}
        </Can>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Configure what form elements appear when recording an activity.
        Choose an {v("activity_category").toLowerCase()} and add the elements you want.
      </p>

      {/* Category selector */}
      <div className="mb-6">
        <Label className="text-sm mb-1 block">{v("activity_category")}</Label>
        <select
          className="border rounded-md px-3 py-2 text-sm w-full max-w-xs"
          value={selectedCategoryId}
          onChange={(e) => {
            setSelectedCategoryId(e.target.value);
            setIsDirty(false);
          }}
        >
          {categories.length === 0 && (
            <option value="">No categories yet</option>
          )}
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      {selectedCategoryId && !formLoading && (
        <>
          {/* Elements list */}
          <div className="flex items-center justify-between mb-3">
            <Label className="text-sm font-semibold">
              Form Elements for &ldquo;{selectedCategory?.name}&rdquo;
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
                Add elements to define what appears when recording an activity in this category.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {elements.map((el, idx) => {
                const Icon = getElementIcon(el.type);
                const metaCount = getParticipationMetaCount(el);
                return (
                  <div
                    key={`${el.type}-${el.ref_id}-${idx}`}
                    className={`border rounded-lg p-3 flex items-center gap-3 ${
                      el.visible ? "bg-white" : "bg-gray-50 opacity-60"
                    }`}
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
                        </p>
                        <p className="text-xs text-gray-400">
                          {ELEMENT_TYPES.find((t) => t.value === el.type)?.label || el.type}
                          {" \u00b7 "}
                          {DISPLAY_TYPES[el.type]?.find((d) => d.value === el.display_type)?.label || el.display_type}
                          {el.required && (
                            <span className="ml-1 text-red-500">
                              {" \u00b7 "}required
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

                    {/* Display type selector */}
                    <select
                      className="border rounded-md px-2 py-1 text-xs"
                      value={el.display_type}
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

                    {/* Visibility toggle */}
                    <button
                      type="button"
                      onClick={() => updateElement(idx, { visible: !el.visible })}
                      className="text-gray-400 hover:text-purple-600"
                      title={el.visible ? "Hide" : "Show"}
                    >
                      {el.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>

                    {/* Remove */}
                    <Can permission="activity_type:manage">
                      <button
                        type="button"
                        onClick={() => removeElement(idx)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </Can>
                  </div>
                );
              })}
            </div>
          )}

          {/* Participation meta hint */}
          {elements.some((el) => el.type === "entity_type") && (
            <p className="text-xs text-gray-400 mt-4">
              To configure participation meta fields (attendance status, scores, etc.) for each entity type,
              go to <a href="/admin/meta-fields" className="text-purple-600 underline">Form Fields</a> and
              use the &ldquo;Participant fields&rdquo; section.
            </p>
          )}
        </>
      )}

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
                const disabled =
                  et.value === "activity_meta" &&
                  isElementAdded(et.value);
                return (
                  <button
                    key={et.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setAddType(et.value);
                      setAddRefId("");
                      setAddDisplayType(DISPLAY_TYPES[et.value]?.[0]?.value || "dropdown");
                    }}
                    className={`flex items-center gap-2 p-3 rounded-lg border text-sm text-left transition-colors ${
                      addType === et.value
                        ? "border-purple-300 bg-purple-50 text-purple-700"
                        : disabled
                          ? "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed"
                          : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <et.icon className="h-4 w-4 shrink-0" />
                    {et.label}
                    {disabled && <span className="text-xs ml-auto">(added)</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reference selector for dimension / entity_type */}
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
                      {vDim(d)}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {addType === "entity_type" && (
            <div>
              <Label className="text-sm mb-1 block">Entity Type</Label>
              <select
                className="w-full border rounded-md p-2 text-sm"
                value={addRefId}
                onChange={(e) => setAddRefId(e.target.value)}
              >
                <option value="">Select...</option>
                {!isElementAdded("entity_type", "user") && (
                  <option value="user">Users (staff/facilitators)</option>
                )}
                {entityTypes
                  .filter((et) => !isElementAdded("entity_type", et.id))
                  .map((et) => (
                    <option key={et.id} value={et.id}>
                      {et.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Display type */}
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
    </>
  );
}
