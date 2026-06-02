"use client";

/**
 * Per-type renderer for user_list fields. Fetches the org's users and
 * renders the participant-section UI via SearchSelectParticipants.
 *
 * No create-new dialog — users are provisioned through the user-admin
 * page, not inline.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { userApi } from "@/services/api";
import type { MetaFieldDefinition } from "@/types";
import type { ParticipantRecord } from "@/utils/field-visibility";

import { SearchSelectParticipants } from "@/components/SearchSelectParticipants";

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
  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: userApi.list,
  });

  const options = useMemo(
    () =>
      users.map((u) => ({
        id: u.id,
        name: `${u.first_name} ${u.last_name}`.trim() || u.id,
      })),
    [users],
  );

  const captureStatus = Boolean(field.config?.capture_status);
  const statuses =
    (field.config?.statuses as string[] | undefined) ?? ["present", "absent"];
  const defaultStatus =
    (field.config?.default_status as string | undefined) ?? statuses[0];

  if (isDisabled) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">
        Users
        {field.required && <span className="text-red-500 ml-0.5">*</span>}
      </h3>
      <SearchSelectParticipants
        sectionKey="user"
        options={options}
        participantType="user"
        selected={value}
        onChange={onChange}
        captureStatus={captureStatus}
        statuses={statuses}
        defaultStatus={defaultStatus}
        metaFields={[]}
        entityTypeId={null}
        entityTypeName="Users"
      />
    </div>
  );
}
