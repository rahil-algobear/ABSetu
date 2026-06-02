"use client";

/**
 * Per-type renderer for entity_list fields on the create form. Uses the
 * shared ParticipantPicker in deferred mode (no activity exists yet, so
 * picks accumulate in form state) plus a simple selected list. Status /
 * meta per participant are set later on the activity detail page — the
 * create form only chooses who's in.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

import { entityTypeApi } from "@/services/api";
import type { EntityType, MetaFieldDefinition } from "@/types";
import type { ParticipantRecord } from "@/utils/field-visibility";

import { ParticipantPicker } from "@/components/ParticipantPicker";

export interface DynamicEntityListFieldProps {
  field: MetaFieldDefinition;
  value: ParticipantRecord[];
  onChange: (records: ParticipantRecord[]) => void;
  isDisabled: boolean;
}

export function DynamicEntityListField({
  field,
  value,
  onChange,
  isDisabled,
}: DynamicEntityListFieldProps) {
  const entityTypeId = field.entity_type_id || null;

  const { data: entityTypes = [] } = useQuery<EntityType[]>({
    queryKey: ["entity-types"],
    queryFn: entityTypeApi.list,
  });

  const entityType = useMemo(
    () => entityTypes.find((t) => t.id === entityTypeId),
    [entityTypes, entityTypeId],
  );
  const entityTypeName = entityType?.name || field.label;
  const canEnroll = entityType?.can_enroll ?? true;

  // Names of selected participants, captured at add time so the
  // selected list and the picker's "Added" tab can label rows without a
  // separate lookup. Create starts empty and every id flows through the
  // picker, so this stays in sync with `value`.
  const [names, setNames] = useState<Record<string, string>>({});

  const captureStatus = Boolean(field.config?.capture_status);
  const statuses =
    (field.config?.statuses as string[] | undefined) ?? ["present", "absent"];
  const defaultStatus =
    (field.config?.default_status as string | undefined) ?? statuses[0];

  if (isDisabled) return null;

  const selectedIds = new Set(value.map((v) => v.participant_id));

  const addParticipant = (id: string, name: string) => {
    setNames((prev) => ({ ...prev, [id]: name }));
    if (selectedIds.has(id)) return;
    onChange([
      ...value,
      {
        participant_id: id,
        participant_type: "entity",
        status: captureStatus ? defaultStatus : undefined,
        meta: {},
      },
    ]);
  };

  const removeParticipant = (id: string) => {
    onChange(value.filter((v) => v.participant_id !== id));
  };

  const alreadyAdded = value.map((v) => ({
    id: v.participant_id,
    name: names[v.participant_id] || v.participant_id,
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">
          {entityTypeName}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </h3>
        <ParticipantPicker
          activityDimensions={[]}
          sectionKey={entityTypeId || field.key}
          entityTypeId={entityTypeId || undefined}
          entityTypeName={entityTypeName}
          participantKind="entity"
          smart={false}
          canEnroll={canEnroll}
          alreadyAdded={alreadyAdded}
          onAdded={() => {}}
          onDeferredAdd={addParticipant}
        />
      </div>

      {value.length === 0 ? (
        <p className="text-xs text-gray-400">
          No {entityTypeName.toLowerCase()} added yet
        </p>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {value.map((p) => (
                <tr key={p.participant_id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    {names[p.participant_id] || p.participant_id}
                  </td>
                  <td className="w-10 px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeParticipant(p.participant_id)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
