"use client";

/**
 * Phase 3 smart participant picker. Replaces SearchSelectParticipants for
 * entity_list fields where the entity type is enrollable AND the activity
 * carries dimensions. Calls the atomic /participants/{add|enroll_and_add}
 * endpoints directly — no client-side orchestration.
 *
 * Two row states (Re-enroll deliberately dropped — see doc):
 *  - Active enrollment in scope    → [+ Add]
 *  - No active enrollment in scope → [Enroll & Add]
 *
 * "Enroll & Add" opens an in-component mini enrollment form for required
 * fields. The activity's dimensions are auto-applied (locked at the top
 * of the form as context).
 *
 * "Create new beneficiary" is intentionally deferred to a follow-up — for
 * v1, admins create beneficiaries via the entities listing and pick them
 * here.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  activityApi,
  entityApi,
  metaFieldSchemaApi,
} from "@/services/api";
import {
  Entity,
  MetaFieldDefinition,
  MetaFieldSchemaItem,
} from "@/types";
import { collectEnrollmentFields } from "@/utils/meta-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { DynamicMetaForm } from "@/components/DynamicMetaForm";
import { Plus, Search } from "lucide-react";
import toast from "react-hot-toast";

interface ActivityDimensionValue {
  dimension_id: string;
  dimension_name: string;
  value_id: string;
  value_name: string;
}

interface ParticipantPickerProps {
  activityId: string;
  /** Dimensions the activity is scoped to. The picker matches rows
   *  against this set and auto-applies them to new enrollments. */
  activityDimensions: ActivityDimensionValue[];
  sectionKey: string;
  entityTypeId: string;
  entityTypeName: string;
  /** Participant IDs already attached to this activity — those rows
   *  show as "✓ Added" instead of an action button. */
  alreadyAddedIds: Set<string>;
  /** Fired after a successful picker action. Parent should re-fetch
   *  the activity's participants. */
  onAdded: () => void;
  /** Trigger button label, e.g. "+ Beneficiary". */
  triggerLabel?: string;
}

export function ParticipantPicker({
  activityId,
  activityDimensions,
  sectionKey,
  entityTypeId,
  entityTypeName,
  alreadyAddedIds,
  onAdded,
  triggerLabel,
}: ParticipantPickerProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"enrolled_here" | "all">("enrolled_here");
  const [enrollFor, setEnrollFor] = useState<Entity | null>(null);

  const activityDvIds = useMemo(
    () => activityDimensions.map((d) => d.value_id),
    [activityDimensions],
  );

  // Fetch beneficiaries with enrollment_status for this activity.
  const { data: entitiesResp, isLoading } = useQuery({
    queryKey: ["picker-entities", entityTypeId, activityId, search],
    queryFn: () =>
      entityApi.listPaginated({
        entity_type_id: entityTypeId,
        with_enrollment_status_for_activity: activityId,
        search: search || undefined,
        limit: 50,
      }),
    enabled: open,
  });
  const entities: Entity[] = entitiesResp?.data || [];

  const filteredEntities = useMemo(() => {
    if (tab === "all") return entities;
    return entities.filter((e) => e.enrollment_status === "active_in_scope");
  }, [entities, tab]);

  const refreshAfterAction = () => {
    queryClient.invalidateQueries({ queryKey: ["picker-entities"] });
    onAdded();
  };

  const addMutation = useMutation({
    mutationFn: (entityId: string) =>
      activityApi.pickerAdd(activityId, {
        entity_id: entityId,
        section_key: sectionKey,
      }),
    onSuccess: () => {
      toast.success(`${entityTypeName} added`);
      refreshAfterAction();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || "Failed to add");
    },
  });

  const close = () => {
    setOpen(false);
    setSearch("");
    setTab("enrolled_here");
    setEnrollFor(null);
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1" />
        {triggerLabel || entityTypeName}
      </Button>

      <Dialog
        open={open}
        onClose={close}
        title={`Add ${entityTypeName}`}
        className="sm:max-w-xl"
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder={`Search ${entityTypeName.toLowerCase()}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          <div className="flex gap-2">
            <TabPill
              active={tab === "enrolled_here"}
              label="Enrolled here"
              count={
                entities.filter((e) => e.enrollment_status === "active_in_scope")
                  .length
              }
              onClick={() => setTab("enrolled_here")}
            />
            <TabPill
              active={tab === "all"}
              label="All"
              count={entities.length}
              onClick={() => setTab("all")}
            />
          </div>

          <div className="max-h-96 overflow-y-auto border rounded-md divide-y">
            {isLoading ? (
              <p className="text-sm text-gray-500 p-3">Loading…</p>
            ) : filteredEntities.length === 0 ? (
              <p className="text-sm text-gray-500 p-3">
                {tab === "enrolled_here"
                  ? "No one is enrolled here yet."
                  : `No ${entityTypeName.toLowerCase()} found.`}
              </p>
            ) : (
              filteredEntities.map((e) => (
                <PickerRow
                  key={e.id}
                  entity={e}
                  alreadyAdded={alreadyAddedIds.has(e.id)}
                  onAdd={() => addMutation.mutate(e.id)}
                  onEnrollAndAdd={() => setEnrollFor(e)}
                  pending={addMutation.isPending}
                />
              ))
            )}
          </div>
        </div>
      </Dialog>

      {enrollFor && (
        <EnrollAndAddModal
          entity={enrollFor}
          activityId={activityId}
          activityDimensions={activityDimensions}
          sectionKey={sectionKey}
          onClose={() => setEnrollFor(null)}
          onSuccess={() => {
            setEnrollFor(null);
            refreshAfterAction();
          }}
        />
      )}
    </>
  );
}

function TabPill({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
        active
          ? "bg-purple-100 text-purple-700 font-medium"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {label}
      <span className="ml-1 text-xs opacity-70">({count})</span>
    </button>
  );
}

function PickerRow({
  entity,
  alreadyAdded,
  onAdd,
  onEnrollAndAdd,
  pending,
}: {
  entity: Entity;
  alreadyAdded: boolean;
  onAdd: () => void;
  onEnrollAndAdd: () => void;
  pending: boolean;
}) {
  const displayName =
    Object.values(entity.meta || {})
      .find((v) => typeof v === "string" && v) as string | undefined ||
    entity.code ||
    entity.id;

  const isActiveInScope = entity.enrollment_status === "active_in_scope";

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-800 truncate">
          {displayName}
        </div>
        <div className="text-xs text-gray-500">
          {isActiveInScope ? "Enrolled here" : "Not enrolled in scope"}
        </div>
      </div>
      {alreadyAdded ? (
        <span className="text-xs text-gray-500 px-2">✓ Added</span>
      ) : isActiveInScope ? (
        <Button size="sm" variant="outline" onClick={onAdd} disabled={pending}>
          + Add
        </Button>
      ) : (
        <Button size="sm" onClick={onEnrollAndAdd} disabled={pending}>
          Enroll &amp; Add
        </Button>
      )}
    </div>
  );
}

/** Compact enrollment form for the "Enroll & Add" flow. Renders the
 *  org's enrollment fields (minus the dimension fields the activity
 *  already covers), with activity dimensions shown locked at top. */
function EnrollAndAddModal({
  entity,
  activityId,
  activityDimensions,
  sectionKey,
  onClose,
  onSuccess,
}: {
  entity: Entity;
  activityId: string;
  activityDimensions: ActivityDimensionValue[];
  sectionKey: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { data: allSchemas = [] } = useQuery<MetaFieldSchemaItem[]>({
    queryKey: ["meta-field-schemas"],
    queryFn: metaFieldSchemaApi.getAll,
  });

  const activityDimIds = useMemo(
    () => new Set(activityDimensions.map((d) => d.dimension_id)),
    [activityDimensions],
  );

  // Required + visible enrollment fields, excluding any dimension
  // fields the activity already locks in. The user fills the rest.
  const fillableFields: MetaFieldDefinition[] = useMemo(() => {
    const fields = collectEnrollmentFields(
      allSchemas,
      entity.entity_type_id,
      activityDimensions.map((d) => d.value_id),
    );
    return fields.filter((f) => {
      if (f.visible === false) return false;
      if (f.type === "dimension" && f.dimension_id && activityDimIds.has(f.dimension_id)) {
        return false; // activity supplies this dimension
      }
      return true;
    });
  }, [allSchemas, entity.entity_type_id, activityDimensions, activityDimIds]);

  const [metaValues, setMetaValues] = useState<Record<string, unknown>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      activityApi.pickerEnrollAndAdd(activityId, {
        entity_id: entity.id,
        section_key: sectionKey,
        enrollment_meta: Object.keys(metaValues).length ? metaValues : undefined,
        enrollment_dimension_value_ids: activityDimensions.map((d) => d.value_id),
      }),
    onSuccess: () => {
      toast.success("Enrolled and added");
      onSuccess();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setFormError(err.response?.data?.message || "Failed to enroll and add");
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    // Required-field check (mirrors EnrollmentForm validation shape).
    for (const f of fillableFields) {
      if (!f.required) continue;
      const v = metaValues[f.key];
      if (v === undefined || v === null || v === "") {
        setFormError(`${f.label} is required.`);
        return;
      }
    }
    mutation.mutate();
  };

  const displayName =
    Object.values(entity.meta || {})
      .find((v) => typeof v === "string" && v) as string | undefined ||
    entity.code ||
    "this beneficiary";

  return (
    <Dialog open onClose={onClose} title={`Enroll ${displayName}`}>
      <form onSubmit={onSubmit} className="space-y-3">
        {formError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </div>
        )}
        <div className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <span className="text-gray-500">Will enroll in:</span>{" "}
          {activityDimensions
            .map((d) => `${d.dimension_name}: ${d.value_name}`)
            .join(" · ")}
        </div>

        {fillableFields.length > 0 ? (
          <DynamicMetaForm
            fields={fillableFields}
            values={metaValues}
            onChange={setMetaValues}
          />
        ) : (
          <p className="text-sm text-gray-500">
            No additional fields needed. Confirm to enroll and add.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            Enroll &amp; Add
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
