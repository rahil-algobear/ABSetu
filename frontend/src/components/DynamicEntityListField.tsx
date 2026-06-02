"use client";

/**
 * Per-type renderer for entity_list fields. Fetches entities of the
 * field's entity_type_id (plus the entity type's list-column config so
 * we can pick a display name) and renders the participant-section UI
 * via SearchSelectParticipants.
 *
 * Owns its own data fetches; callers don't need to wire up entity
 * queries or a list-config lookup. Multiple instances on the same page
 * share fetches via TanStack Query's queryKey dedupe.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  entityApi,
  entityTypeApi,
  listConfigApi,
} from "@/services/api";
import type {
  EntityType,
  ListColumnConfig,
  MetaFieldDefinition,
} from "@/types";
import type { ParticipantRecord } from "@/utils/field-visibility";

import { SearchSelectParticipants } from "@/components/SearchSelectParticipants";

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

  // Entity type for label resolution.
  const { data: entityTypes = [] } = useQuery<EntityType[]>({
    queryKey: ["entity-types"],
    queryFn: entityTypeApi.list,
  });

  // Entities of this type — the picker's option pool.
  const { data: entities = [] } = useQuery({
    queryKey: ["entities-for-section", entityTypeId],
    queryFn: () => entityApi.list(entityTypeId!),
    enabled: !!entityTypeId,
  });

  // List column config — used to pick which meta field renders as the
  // option's display name (the first visible meta column the admin
  // configured for this entity type's list view).
  const { data: columns = [] } = useQuery<ListColumnConfig[]>({
    queryKey: ["list-config", `entity:${entityTypeId}`],
    queryFn: () => listConfigApi.get(`entity:${entityTypeId}`),
    enabled: !!entityTypeId,
  });

  const displayMetaKey = useMemo(() => {
    const firstCol = columns.find((c) => c.visible && c.key.startsWith("meta:"));
    return firstCol?.key.replace(/^meta:/, "");
  }, [columns]);

  const options = useMemo(
    () =>
      entities.map((e) => ({
        id: e.id,
        name: displayMetaKey
          ? String((e.meta || {})[displayMetaKey] || "")
          : "",
      })),
    [entities, displayMetaKey],
  );

  const entityTypeName = useMemo(() => {
    const et = entityTypes.find((t) => t.id === entityTypeId);
    return et?.name || field.label;
  }, [entityTypes, entityTypeId, field.label]);

  // field.config supplies the participant-section UX knobs (per-row
  // status column + the allowed statuses).
  const captureStatus = Boolean(field.config?.capture_status);
  const statuses =
    (field.config?.statuses as string[] | undefined) ?? ["present", "absent"];
  const defaultStatus =
    (field.config?.default_status as string | undefined) ?? statuses[0];

  if (isDisabled) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">
        {entityTypeName}
        {field.required && <span className="text-red-500 ml-0.5">*</span>}
      </h3>
      <SearchSelectParticipants
        sectionKey={entityTypeId || field.key}
        options={options}
        participantType="entity"
        selected={value}
        onChange={onChange}
        captureStatus={captureStatus}
        statuses={statuses}
        defaultStatus={defaultStatus}
        metaFields={[]}
        entityTypeId={entityTypeId}
        entityTypeName={entityTypeName}
      />
    </div>
  );
}
