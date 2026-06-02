"use client";

/**
 * Per-type renderer for user_list fields on the create form. Uses the
 * shared ParticipantPicker in deferred mode (picks accumulate in form
 * state) plus a simple selected list. No create-new — users are
 * provisioned via the user-admin page. Status / meta are set later on
 * the activity detail page.
 */

import { useMemo, useState } from "react";
import { X } from "lucide-react";

import type { MetaFieldDefinition } from "@/types";
import type { ParticipantRecord } from "@/utils/field-visibility";

import { ParticipantPicker } from "@/components/ParticipantPicker";

export interface DynamicUserListFieldProps {
  field: MetaFieldDefinition;
  value: ParticipantRecord[];
  onChange: (records: ParticipantRecord[]) => void;
  isDisabled: boolean;
}

export function DynamicUserListField({
  field,
  value,
  onChange,
  isDisabled,
}: DynamicUserListFieldProps) {
  const [names, setNames] = useState<Record<string, string>>({});

  const captureStatus = Boolean(field.config?.capture_status);
  const statuses =
    (field.config?.statuses as string[] | undefined) ?? ["present", "absent"];
  const defaultStatus =
    (field.config?.default_status as string | undefined) ?? statuses[0];

  const selectedIds = useMemo(
    () => new Set(value.map((v) => v.participant_id)),
    [value],
  );

  if (isDisabled) return null;

  const addParticipant = (id: string, name: string) => {
    setNames((prev) => ({ ...prev, [id]: name }));
    if (selectedIds.has(id)) return;
    onChange([
      ...value,
      {
        participant_id: id,
        participant_type: "user",
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
          Users
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </h3>
        <ParticipantPicker
          activityDimensions={[]}
          sectionKey="user"
          entityTypeName="Users"
          participantKind="user"
          smart={false}
          alreadyAdded={alreadyAdded}
          onAdded={() => {}}
          onDeferredAdd={addParticipant}
          triggerLabel="User"
        />
      </div>

      {value.length === 0 ? (
        <p className="text-xs text-gray-400">No users added yet</p>
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
