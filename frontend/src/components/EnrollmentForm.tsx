"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";

import {
  enrollmentApi,
  dimensionApi,
  dimensionValueLinkApi,
} from "@/services/api";
import {
  Dimension,
  DimensionValue,
  DimensionValueLink,
  Enrollment,
  MetaFieldDefinition,
  MetaFieldSchemaItem,
} from "@/types";
import { collectEnrollmentFields } from "@/utils/meta-fields";

import { Button } from "@/components/ui/button";
import { DynamicMetaForm } from "@/components/DynamicMetaForm";

/**
 * Cascading dimension filter — reused from activities page pattern.
 */
function getFilteredValues(
  targetDimValues: DimensionValue[],
  selectedByDim: Record<string, string>,
  targetDimId: string,
  dimensionValueLinks: DimensionValueLink[],
): DimensionValue[] {
  const otherSelections = Object.entries(selectedByDim)
    .filter(([dimId, dvId]) => dimId !== targetDimId && dvId)
    .map(([, dvId]) => dvId);

  if (otherSelections.length === 0) return targetDimValues;

  const linkPairs = new Set<string>();
  for (const link of dimensionValueLinks) {
    linkPairs.add(`${link.dimension_value_id_1}:${link.dimension_value_id_2}`);
    linkPairs.add(`${link.dimension_value_id_2}:${link.dimension_value_id_1}`);
  }

  return targetDimValues.filter((dv) =>
    otherSelections.every(
      (selectedId) => linkPairs.has(`${dv.id}:${selectedId}`)
    )
  );
}

export function EnrollmentForm({
  entityId,
  entityTypeId,
  enrollment,
  initialIsActive,
  allSchemas,
  onSuccess,
  onCancel,
}: {
  entityId: string;
  entityTypeId: string;
  enrollment?: Enrollment;
  initialIsActive?: boolean;
  allSchemas: MetaFieldSchemaItem[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const isEdit = !!enrollment;
  const [isActive, setIsActive] = useState<boolean>(
    initialIsActive ?? enrollment?.is_active ?? true,
  );
  const [formError, setFormError] = useState<string | null>(null);

  const { data: dimensions = [] } = useQuery<Dimension[]>({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
  });

  const { data: allDimensionValues = [] } = useQuery<DimensionValue[]>({
    queryKey: ["all-dimension-values", dimensions.map((d) => d.id).join(",")],
    queryFn: async () => {
      const results = await Promise.all(
        dimensions.map((d) => dimensionApi.listAccessibleValues(d.id))
      );
      return results.flat();
    },
    enabled: dimensions.length > 0,
  });

  const { data: dimensionValueLinks = [] } = useQuery<DimensionValueLink[]>({
    queryKey: ["dimension-value-links-all"],
    queryFn: () => dimensionValueLinkApi.list(),
  });

  const [dimensionValueIds, setDimensionValueIds] = useState<string[]>(
    () => enrollment?.dimensions?.map((t) => t.value_id) || []
  );
  const [metaValues, setMetaValues] = useState<Record<string, unknown>>(
    () => enrollment?.meta || {}
  );

  // Admin-configured fields for this enrollment (re-runs as dimensions change
  // to surface dimension-value-scoped fields).
  const allFields = useMemo(
    () => collectEnrollmentFields(allSchemas, entityTypeId, dimensionValueIds),
    [allSchemas, entityTypeId, dimensionValueIds],
  );
  const formFields = useMemo(
    () => allFields.filter((f) => f.visible !== false),
    [allFields],
  );

  const createDisabledKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const f of allFields) {
      if (isEdit && f.stage === "create") keys.add(f.key);
      if (!isEdit && f.stage === "record") keys.add(f.key);
    }
    return keys;
  }, [allFields, isEdit]);

  const selectedByDim = useMemo(() => {
    const map: Record<string, string> = {};
    for (const dim of dimensions) {
      const dimValues = allDimensionValues.filter(
        (dv) => dv.dimension_id === dim.id
      );
      const selected = dimensionValueIds.find((id) =>
        dimValues.some((dv) => dv.id === id)
      );
      if (selected) {
        map[dim.id] = selected;
      }
    }
    return map;
  }, [dimensions, allDimensionValues, dimensionValueIds]);

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof enrollmentApi.create>[0]) =>
      enrollmentApi.create(data),
    onSuccess: () => {
      toast.success("Enrollment created");
      onSuccess();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setFormError(err.response?.data?.message || "Failed to create enrollment");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; updates: Partial<Enrollment>; tagIds: string[] }) =>
      Promise.all([
        enrollmentApi.update(data.id, data.updates),
        enrollmentApi.updateDimensions(data.id, data.tagIds),
      ]),
    onSuccess: () => {
      toast.success("Enrollment updated");
      onSuccess();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setFormError(err.response?.data?.message || "Failed to update enrollment");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validate required fields (mirrors activity create page)
    for (const field of formFields) {
      if (!field.required || createDisabledKeys.has(field.key)) continue;
      if (field.type === "dimension") {
        const dimId = field.dimension_id;
        if (!dimId) continue;
        const hasValue = dimensionValueIds.some((dvId) =>
          allDimensionValues.find((dv) => dv.id === dvId)?.dimension_id === dimId,
        );
        if (!hasValue) {
          setFormError(`${field.label} is required.`);
          return;
        }
        continue;
      }
      const val = metaValues[field.key];
      if (val === undefined || val === null || val === "") {
        setFormError(`${field.label} is required.`);
        return;
      }
    }

    const meta = Object.keys(metaValues).length > 0 ? metaValues : undefined;
    if (isEdit && enrollment) {
      updateMutation.mutate({
        id: enrollment.id,
        updates: { meta, is_active: isActive },
        tagIds: dimensionValueIds,
      });
    } else {
      createMutation.mutate({
        entity_id: entityId,
        meta,
        dimension_value_ids: dimensionValueIds,
        is_active: isActive,
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const renderField = (field: MetaFieldDefinition) => {
    if (field.type === "dimension") {
      const dim = dimensions.find((d) => d.id === field.dimension_id);
      if (!dim) return null;
      const dimValues = allDimensionValues.filter(
        (dv) => dv.dimension_id === dim.id,
      );
      const filtered = getFilteredValues(
        dimValues,
        selectedByDim,
        dim.id,
        dimensionValueLinks,
      );
      const currentSelection =
        dimensionValueIds.find((dvId) =>
          dimValues.some((dv) => dv.id === dvId),
        ) || "";
      const isFieldDisabled = createDisabledKeys.has(field.key);
      return (
        <div key={`dim-${field.key}`}>
          <label className="text-sm font-medium">
            {field.label}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          <select
            className="w-full mt-1 border rounded-md p-2 text-sm disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
            value={currentSelection}
            onChange={(e) => {
              const newId = e.target.value;
              const otherIds = dimensionValueIds.filter(
                (dvId) => !dimValues.some((dv) => dv.id === dvId),
              );
              setDimensionValueIds(newId ? [...otherIds, newId] : otherIds);
            }}
            required={field.required}
            disabled={isFieldDisabled}
          >
            <option value="">Select {field.label}...</option>
            {filtered.map((dv) => (
              <option key={dv.id} value={dv.id}>
                {dv.name}
              </option>
            ))}
          </select>
        </div>
      );
    }
    return (
      <div key={`field-${field.key}`}>
        <DynamicMetaForm
          fields={[field]}
          values={metaValues}
          onChange={setMetaValues}
          disabledKeys={createDisabledKeys}
        />
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {formError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </div>
      )}
      {formFields.length === 0 ? (
        <p className="text-sm text-gray-500">
          No fields have been configured for enrollments. Please ask your admin to set them up in Form Fields under Admin settings.
        </p>
      ) : (
        formFields.map(renderField)
      )}

      {formFields.length > 0 && (
        <div>
          <label className="block text-sm font-medium">Status</label>
          <div className="inline-flex mt-1 rounded-md border overflow-hidden">
            <button
              type="button"
              onClick={() => setIsActive(false)}
              className={`px-3 py-1.5 text-sm transition-colors ${
                !isActive
                  ? "bg-gray-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              Inactive
            </button>
            <button
              type="button"
              onClick={() => setIsActive(true)}
              className={`px-3 py-1.5 text-sm transition-colors border-l ${
                isActive
                  ? "bg-purple-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              Active
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-3 mt-3 border-t -mx-6 px-6">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        {formFields.length > 0 && (
          <Button type="submit" disabled={isPending}>
            {isEdit ? "Save" : "Create"}
          </Button>
        )}
      </div>
    </form>
  );
}
