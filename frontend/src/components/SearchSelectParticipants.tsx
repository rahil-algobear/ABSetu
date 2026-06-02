"use client";

import { useState, useMemo, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { entityApi, metaFieldSchemaApi } from "@/services/api";
import { MetaFieldDefinition, MetaFieldSchemaItem } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { type FormValues } from "@/utils/field-visibility";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { Dialog } from "@/components/ui/dialog";
import { EntityFields, type EntityFieldsHandle } from "@/components/EntityFields";
import { Plus, Search, X } from "lucide-react";
import toast from "react-hot-toast";

interface ParticipantRecord {
  participant_id: string;
  participant_type: string;
  status?: string;
  meta?: Record<string, unknown>;
}

interface Option {
  id: string;
  name: string;
}

interface SearchSelectParticipantsProps {
  sectionKey: string;
  options: Option[];
  participantType: "user" | "entity";
  selected: ParticipantRecord[];
  onChange: (records: ParticipantRecord[]) => void;
  captureStatus: boolean;
  statuses: string[];
  defaultStatus: string;
  metaFields: MetaFieldDefinition[];
  /** Entity type ID — needed for creating new entities. Null for user sections. */
  entityTypeId: string | null;
  entityTypeName: string;
}

export function SearchSelectParticipants({
  options,
  participantType,
  selected,
  onChange,
  captureStatus,
  statuses,
  defaultStatus,
  metaFields,
  entityTypeId,
  entityTypeName,
}: SearchSelectParticipantsProps) {
  const [search, setSearch] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newEntityValues, setNewEntityValues] = useState<FormValues>({
    meta: {},
    dimensions: [],
  });
  const [createFormError, setCreateFormError] = useState<string | null>(null);
  const entityFieldsRef = useRef<EntityFieldsHandle>(null);
  const queryClient = useQueryClient();

  // allSchemas is forwarded to EntityFields; the form-builder field set
  // (with stage filtering, disabled keys, and validation) lives inside
  // that component now.
  const { data: allSchemas = [] } = useQuery<MetaFieldSchemaItem[]>({
    queryKey: ["meta-field-schemas"],
    queryFn: metaFieldSchemaApi.getAll,
  });

  const createEntityMutation = useMutation({
    mutationFn: entityApi.create,
    onSuccess: (newEntity) => {
      queryClient.invalidateQueries({ queryKey: ["entities-for-sections"] });
      // Auto-add the newly created entity as a participant
      onChange([
        ...selected,
        {
          participant_id: newEntity.id,
          participant_type: participantType,
          status: captureStatus ? defaultStatus : undefined,
          meta: {},
        },
      ]);
      setShowCreateDialog(false);
      setNewEntityValues({ meta: {}, dimensions: [] });
      setCreateFormError(null);
      toast.success(`${entityTypeName} created and selected — save to confirm`);
    },
    onError: () => toast.error(`Failed to create ${entityTypeName.toLowerCase()}`),
  });

  const selectedIds = new Set(selected.map((s) => s.participant_id));

  // Filter options not already selected, matching search
  const filteredOptions = useMemo(() => {
    return options.filter(
      (opt) =>
        !selectedIds.has(opt.id) &&
        opt.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [options, selectedIds, search]);

  const addParticipant = (opt: Option) => {
    onChange([
      ...selected,
      {
        participant_id: opt.id,
        participant_type: participantType,
        status: captureStatus ? defaultStatus : undefined,
        meta: {},
      },
    ]);
    setSearch("");
  };

  const removeParticipant = (participantId: string) => {
    onChange(selected.filter((s) => s.participant_id !== participantId));
  };

  const updateStatus = (participantId: string, status: string) => {
    onChange(
      selected.map((s) =>
        s.participant_id === participantId ? { ...s, status } : s
      )
    );
  };

  const updateMeta = (participantId: string, meta: Record<string, unknown>) => {
    onChange(
      selected.map((s) =>
        s.participant_id === participantId ? { ...s, meta } : s
      )
    );
  };

  const getName = (participantId: string) => {
    return options.find((o) => o.id === participantId)?.name || participantId;
  };

  return (
    <div className="space-y-2">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder={`Search ${entityTypeName.toLowerCase()}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 pr-10"
        />
        {/* Add new entity button (not for users) */}
        {entityTypeId && (
          <button
            type="button"
            onClick={() => setShowCreateDialog(true)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-600 hover:text-blue-800"
            title={`Add new ${entityTypeName.toLowerCase()}`}
          >
            <Plus className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Search results dropdown */}
      {search.length > 0 && (
        <div className="border rounded-md max-h-48 overflow-y-auto bg-white shadow-sm">
          {filteredOptions.length === 0 ? (
            <div className="p-3 text-sm text-gray-500 text-center">
              No matches found
              {entityTypeId && (
                <button
                  type="button"
                  onClick={() => setShowCreateDialog(true)}
                  className="block mx-auto mt-1 text-blue-600 hover:underline text-xs"
                >
                  + Create &ldquo;{search}&rdquo;
                </button>
              )}
            </div>
          ) : (
            filteredOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => addParticipant(opt)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b last:border-0"
              >
                {opt.name}
              </button>
            ))
          )}
        </div>
      )}

      {/* Selected participants table */}
      {selected.length > 0 && (
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Name</th>
                {captureStatus && (
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                )}
                {metaFields.map((field) => (
                  <th key={field.key} className="text-left px-3 py-2 font-medium">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-0.5">*</span>}
                  </th>
                ))}
                <th className="w-10 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {selected.map((p) => (
                <tr key={p.participant_id} className="border-b last:border-0">
                  <td className="px-3 py-2">{getName(p.participant_id)}</td>
                  {captureStatus && (
                    <td className="px-3 py-2">
                      <select
                        className="border rounded px-2 py-1 text-xs w-full"
                        value={p.status || ""}
                        onChange={(e) => updateStatus(p.participant_id, e.target.value)}
                      >
                        {statuses.map((st) => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                      </select>
                    </td>
                  )}
                  {metaFields.map((field) => (
                    <td key={field.key} className="px-3 py-2">
                      <MetaFieldCell
                        field={field}
                        value={(p.meta || {})[field.key]}
                        onChange={(val) =>
                          updateMeta(p.participant_id, {
                            ...(p.meta || {}),
                            [field.key]: val,
                          })
                        }
                      />
                    </td>
                  ))}
                  <td className="px-2 py-2">
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

      {selected.length === 0 && search.length === 0 && (
        <p className="text-xs text-gray-400">No {entityTypeName.toLowerCase()} added yet</p>
      )}

      {/* Create new entity dialog */}
      {entityTypeId && (
        <Dialog
          open={showCreateDialog}
          onClose={() => {
            setShowCreateDialog(false);
            setCreateFormError(null);
          }}
          title={`Add New ${entityTypeName}`}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setCreateFormError(null);
              const validationError = entityFieldsRef.current?.validate();
              if (validationError) {
                setCreateFormError(validationError);
                return;
              }
              const meta =
                Object.keys(newEntityValues.meta).length > 0
                  ? newEntityValues.meta
                  : undefined;
              createEntityMutation.mutate({
                entity_type_id: entityTypeId,
                meta,
              });
            }}
            className="space-y-3"
          >
            {createFormError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {createFormError}
              </div>
            )}
            <EntityFields
              ref={entityFieldsRef}
              entityTypeId={entityTypeId}
              allSchemas={allSchemas}
              values={newEntityValues}
              onChange={setNewEntityValues}
              mode="create"
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCreateDialog(false);
                  setCreateFormError(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createEntityMutation.isPending}>
                Create
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}

/** Inline cell editor for a single meta field */
function MetaFieldCell({
  field,
  value,
  onChange,
}: {
  field: MetaFieldDefinition;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  if (field.type === "boolean") {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  }

  if (field.type === "select") {
    return (
      <select
        className="border rounded px-2 py-1 text-xs w-full"
        value={(value as string) || ""}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
      >
        <option value="">-</option>
        {field.options?.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  }

  if (field.type === "number") {
    return (
      <input
        type="number"
        className="border rounded px-2 py-1 text-xs w-full"
        value={value != null ? String(value) : ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")}
        required={field.required}
      />
    );
  }

  if (field.type === "date" || field.type === "datetime") {
    return (
      <DateTimeInput
        value={(value as string) || ""}
        onChange={(val) => onChange(val)}
        required={field.required}
        allowTime={field.type === "datetime"}
      />
    );
  }

  // Default: text
  return (
    <input
      type="text"
      className="border rounded px-2 py-1 text-xs w-full"
      value={(value as string) || ""}
      onChange={(e) => onChange(e.target.value)}
      required={field.required}
    />
  );
}
