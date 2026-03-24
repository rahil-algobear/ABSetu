"use client";

import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { entityApi, metaFieldSchemaApi } from "@/services/api";
import { MetaFieldDefinition, MetaFieldSchemaItem } from "@/types";
import { getFieldsForScope } from "@/utils/meta-fields";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { Dialog } from "@/components/ui/dialog";
import { DynamicMetaForm } from "@/components/DynamicMetaForm";
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
  const [newEntityName, setNewEntityName] = useState("");
  const [newEntityMeta, setNewEntityMeta] = useState<Record<string, unknown>>({});
  const queryClient = useQueryClient();

  // Entity-type-specific meta fields
  const { data: allSchemas = [] } = useQuery<MetaFieldSchemaItem[]>({
    queryKey: ["meta-field-schemas"],
    queryFn: metaFieldSchemaApi.getAll,
  });
  const entityMetaFields = useMemo(
    () => entityTypeId ? getFieldsForScope(allSchemas, { type: "entity", entity_type_id: entityTypeId }) : [],
    [allSchemas, entityTypeId],
  );

  // The standalone Name input in the create dialog handles the "Name" meta field,
  // so filter it out from DynamicMetaForm to avoid showing it twice.
  const nameField = entityMetaFields.find((f) => f.label === "Name");
  const nonNameFields = useMemo(
    () => entityMetaFields.filter((f) => f.label !== "Name"),
    [entityMetaFields],
  );

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
      setNewEntityName("");
      setNewEntityMeta({});
      toast.success(`${entityTypeName} created and added`);
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
                  onClick={() => {
                    setNewEntityName(search);
                    setShowCreateDialog(true);
                  }}
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
          onClose={() => setShowCreateDialog(false)}
          title={`Add New ${entityTypeName}`}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newEntityName.trim()) {
                const meta = { ...newEntityMeta };
                // Store the name value in its meta field key
                if (nameField) {
                  meta[nameField.key] = newEntityName.trim();
                }
                createEntityMutation.mutate({
                  entity_type_id: entityTypeId,
                  meta,
                });
              }
            }}
            className="space-y-3"
          >
            <div>
              <Label htmlFor="new-entity-name">Name</Label>
              <Input
                id="new-entity-name"
                placeholder={`${entityTypeName} name`}
                value={newEntityName}
                onChange={(e) => setNewEntityName(e.target.value)}
                autoFocus
                required
              />
            </div>
            <DynamicMetaForm
              fields={nonNameFields}
              values={newEntityMeta}
              onChange={setNewEntityMeta}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
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
