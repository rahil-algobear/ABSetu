"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";

import { enrollmentApi } from "@/services/api";
import type { Enrollment, MetaFieldSchemaItem } from "@/types";

import { Button } from "@/components/ui/button";
import {
  EnrollmentFields,
  useVisibleEnrollmentFields,
  type EnrollmentFieldsHandle,
} from "@/components/EnrollmentFields";

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

  const [dimensionValueIds, setDimensionValueIds] = useState<string[]>(
    () => enrollment?.dimensions?.map((t) => t.value_id) || [],
  );
  const [metaValues, setMetaValues] = useState<Record<string, unknown>>(
    () => enrollment?.meta || {},
  );

  const fieldsRef = useRef<EnrollmentFieldsHandle>(null);

  // Used to decide whether to render the empty-state message and hide the
  // submit/status toggle. Cheap re-derivation of the same field set the
  // renderer computes.
  const visibleFields = useVisibleEnrollmentFields({
    entityTypeId,
    allSchemas,
    knownDimensionValueIds: dimensionValueIds,
  });
  const hasFields = visibleFields.length > 0;

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

    const validationError = fieldsRef.current?.validate();
    if (validationError) {
      setFormError(validationError);
      return;
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

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {formError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </div>
      )}

      {hasFields ? (
        <>
          <EnrollmentFields
            ref={fieldsRef}
            entityTypeId={entityTypeId}
            allSchemas={allSchemas}
            lockedDimensions={[]}
            userDimensionValueIds={dimensionValueIds}
            onUserDimensionsChange={setDimensionValueIds}
            metaValues={metaValues}
            onMetaChange={setMetaValues}
            dimensionMode="picker"
            mode={isEdit ? "edit" : "create"}
          />
          <StatusToggle isActive={isActive} onChange={setIsActive} />
        </>
      ) : (
        <p className="text-sm text-gray-500">
          No fields have been configured for enrollments. Please ask your admin to set them up in Form Fields under Admin settings.
        </p>
      )}

      <div className="flex justify-end gap-2 pt-3 mt-3 border-t -mx-6 px-6">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        {hasFields && (
          <Button type="submit" disabled={isPending}>
            {isEdit ? "Save" : "Create"}
          </Button>
        )}
      </div>
    </form>
  );
}

function StatusToggle({
  isActive,
  onChange,
}: {
  isActive: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium">Status</label>
      <div className="inline-flex mt-1 rounded-md border overflow-hidden">
        <button
          type="button"
          onClick={() => onChange(false)}
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
          onClick={() => onChange(true)}
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
  );
}
