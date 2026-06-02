"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  activityApi,
  activityTypeApi,
  dimensionApi,
  dimensionValueLinkApi,
  metaFieldSchemaApi,
} from "@/services/api";
import {
  Dimension,
  DimensionValue,
  DimensionValueLink,
  MetaFieldSchemaItem,
} from "@/types";
import {
  deriveParticipantSectionKey,
  type FormValues,
} from "@/utils/field-visibility";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ActivityFields,
  useVisibleActivityFields,
  type ActivityFieldsHandle,
} from "@/components/ActivityFields";
import { PageLayout } from "@/components/ui/page-layout";
import { PageContent } from "@/components/ui/page-content";
import { PageHeader } from "@/components/ui/page-header";
import { usePermissions } from "@/components/Auth/Permissions";
import { useDimensionAutoSelect } from "@/hooks/useDimensionAutoSelect";
import { useFromLink } from "@/hooks/useFromLink";
import { pluralize } from "@/utils/pluralize";

import toast from "react-hot-toast";

export default function NewActivityPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { key: typeKey } = useParams<{ key: string }>();
  const { dimensionValueIds: userDimensionValueIds } = usePermissions();

  const { data: activityTypes = [] } = useQuery({
    queryKey: ["activity-types"],
    queryFn: activityTypeApi.list,
  });

  const activityType = activityTypes.find((c) => c.key === typeKey);
  const selectedTypeId = activityType?.id || "";
  const typeName = activityType?.name || "Activity";

  const backLink = useFromLink({
    fallbackHref: `/activities/${typeKey}`,
    fallbackLabel: pluralize(typeName),
  });

  const { data: allMetaSchemas = [] } = useQuery<MetaFieldSchemaItem[]>({
    queryKey: ["meta-field-schemas-all"],
    queryFn: metaFieldSchemaApi.getAll,
  });

  // Dimension queries are still kept at the page level — they feed the
  // useDimensionAutoSelect hook below. The form's dimension picker
  // itself goes through DynamicMetaForm + useDimensionData (which
  // dedupes against these same query keys).
  const { data: dimensions = [] } = useQuery<Dimension[]>({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
  });

  const { data: allDimensionValues = [] } = useQuery<DimensionValue[]>({
    queryKey: ["all-dimension-values", dimensions.map((d) => d.id).join(",")],
    queryFn: async () => {
      const results = await Promise.all(
        dimensions.map((d) => dimensionApi.listAccessibleValues(d.id)),
      );
      return results.flat();
    },
    enabled: dimensions.length > 0,
  });

  const { data: dimensionValueLinks = [] } = useQuery<DimensionValueLink[]>({
    queryKey: ["dimension-value-links-all"],
    queryFn: () => dimensionValueLinkApi.list(),
  });

  // Single source of truth for everything the form-builder collects.
  const [values, setValues] = useState<FormValues>({
    meta: {},
    dimensions: [],
    participants: {},
  });
  const [formError, setFormError] = useState<string | null>(null);
  const fieldsRef = useRef<ActivityFieldsHandle>(null);

  const visibleFields = useVisibleActivityFields({
    activityTypeId: selectedTypeId || null,
    allSchemas: allMetaSchemas,
    values,
    mode: "create",
  });

  const hasFields = visibleFields.length > 0;

  // Used by both useDimensionAutoSelect (below) and the save payload
  // assembler. Derived from the visible field list so it tracks
  // dim-value-scoped visibility changes.
  const formDimensions = useMemo(
    () =>
      visibleFields
        .filter((f) => f.type === "dimension" && f.dimension_id)
        .map((f) => ({ id: f.dimension_id! })),
    [visibleFields],
  );

  const participantFields = useMemo(
    () =>
      visibleFields.filter(
        (f) => f.type === "entity_list" || f.type === "user_list",
      ),
    [visibleFields],
  );

  const handleAutoSelect = useCallback(
    (dvIds: string[]) => {
      setValues((prev) => ({ ...prev, dimensions: dvIds }));
    },
    [],
  );

  useDimensionAutoSelect({
    dimensions: formDimensions,
    allDimensionValues,
    dimensionValueLinks,
    userDimensionValueIds,
    currentSelections: values.dimensions,
    onAutoSelect: handleAutoSelect,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Parameters<typeof activityApi.create>[0]) => {
      const activity = await activityApi.create(payload);
      const allRecords: {
        participant_type: string;
        participant_id: string;
        section_key: string;
        status?: string;
        meta?: Record<string, unknown>;
      }[] = [];
      for (const field of participantFields) {
        const sectionKey = deriveParticipantSectionKey(field);
        const sectionState = values.participants?.[sectionKey] ?? [];
        for (const p of sectionState) {
          allRecords.push({
            participant_type: p.participant_type,
            participant_id: p.participant_id,
            section_key: sectionKey,
            status: p.status,
            meta: p.meta,
          });
        }
      }
      if (allRecords.length > 0) {
        await activityApi.saveParticipants(activity.id, allRecords);
      }
      return activity;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      toast.success(`${typeName} created`);
      router.push(`/activities/${typeKey}`);
    },
    onError: () => toast.error(`Failed to create ${typeName.toLowerCase()}`),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const validationError = fieldsRef.current?.validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    createMutation.mutate({
      dimension_value_ids: values.dimensions,
      activity_type_id: selectedTypeId || undefined,
      meta: values.meta,
    });
  };

  return (
    <PageLayout>
      <PageHeader title={`New ${typeName}`} back={backLink} />

      <PageContent>
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="text-lg">Create {typeName}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-3">
              {formError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {formError}
                </div>
              )}

              {hasFields ? (
                <ActivityFields
                  ref={fieldsRef}
                  activityTypeId={selectedTypeId || null}
                  allSchemas={allMetaSchemas}
                  values={values}
                  onChange={setValues}
                  mode="create"
                />
              ) : (
                <p className="text-sm text-gray-500">
                  No fields have been configured for this activity type. Please ask your admin to set them up in Form Fields under Admin settings.
                </p>
              )}

              <div className="flex gap-2">
                {hasFields && (
                  <Button type="submit" disabled={createMutation.isPending}>
                    Create
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push(`/activities/${typeKey}`)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </PageContent>
    </PageLayout>
  );
}
