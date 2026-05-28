"use client";

/**
 * Phase 3 participant picker. Replaces SearchSelectParticipants for all
 * entity_list and user_list fields on an activity. Calls the atomic
 * /participants/{add|enroll_and_add|create_and_add} endpoints directly
 * — no client-side orchestration.
 *
 * Three modes (derived from props):
 *  - Smart (entity, enrollable, activity has dimensions): 3 tabs
 *    (Added/Enrolled/All), [+ Add] for active-in-scope rows,
 *    [Enroll & Add] for rows with no active enrollment in scope,
 *    plus a [Create new …] CTA.
 *  - Basic entity (non-enrollable type OR dimensionless activity):
 *    2 tabs (Added/All), every row gets [+ Add] directly. No enroll
 *    flow. Create-new is still offered for entity types that support
 *    it.
 *  - User (user_list section): 2 tabs (Added/All), direct [+ Add].
 *    No create-new — admins create users via the user-admin page.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  activityApi,
  entityApi,
  metaFieldSchemaApi,
  userApi,
} from "@/services/api";
import {
  Entity,
  MetaFieldDefinition,
  MetaFieldSchemaItem,
  UserListItem,
} from "@/types";
import { collectEnrollmentFields, getFieldsForScope } from "@/utils/meta-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { DynamicMetaForm } from "@/components/DynamicMetaForm";
import {
  EnrollmentFields,
  type EnrollmentFieldsHandle,
  type EnrollmentLockedDimension,
} from "@/components/EnrollmentFields";
import { Plus, Search } from "lucide-react";
import toast from "react-hot-toast";

interface ActivityDimensionValue {
  dimension_id: string;
  dimension_name: string;
  value_id: string;
  value_name: string;
}

interface AlreadyAddedParticipant {
  id: string;
  name: string;
}

interface ParticipantPickerProps {
  activityId: string;
  /** Dimensions the activity is scoped to. Used to derive scope for
   *  the Enrolled tab and to auto-apply onto new enrollments. Ignored
   *  outside Smart mode. */
  activityDimensions: ActivityDimensionValue[];
  sectionKey: string;
  /** Entity type ID for entity sections. Required when
   *  participantKind === "entity". Ignored for user sections. */
  entityTypeId?: string;
  /** Human label for the trigger button and dialog title
   *  (e.g. "Beneficiary", "Facilitator", "Users"). */
  entityTypeName: string;
  /** "entity" → list/search the entity API. "user" → list/search
   *  the users API. Default "entity". */
  participantKind?: "entity" | "user";
  /** True only for Smart mode: entity, enrollable type, activity has
   *  dimensions. Controls the Enrolled tab + Enroll & Add path. */
  smart?: boolean;
  /** Currently-added participants in this section. Picker uses these
   *  for the Added tab (no separate fetch needed) and to filter them
   *  out of the Enrolled tab. */
  alreadyAdded: AlreadyAddedParticipant[];
  /** Fired after a successful picker action. Parent should re-fetch
   *  the activity's participants. */
  onAdded: () => void;
  /** Trigger button label, e.g. "+ Beneficiary". */
  triggerLabel?: string;
}

type PickerTab = "added" | "enrolled" | "all";

const normalize = (s: string) =>
  s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

export function ParticipantPicker({
  activityId,
  activityDimensions,
  sectionKey,
  entityTypeId,
  entityTypeName,
  participantKind = "entity",
  smart = true,
  alreadyAdded,
  onAdded,
  triggerLabel,
}: ParticipantPickerProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  // Smart mode opens on Enrolled (the most useful list). Non-smart
  // modes have no Enrolled tab — they default to All so typing the
  // search box starts working immediately.
  const [tab, setTab] = useState<PickerTab>(smart ? "enrolled" : "all");
  const [enrollFor, setEnrollFor] = useState<Entity | null>(null);
  const [showCreateNew, setShowCreateNew] = useState(false);
  // Pagination size — used by both All-tab search and Enrolled tab.
  const PAGE_SIZE = 50;

  // --- All-tab pagination. Reset to 1 whenever the search term
  //     changes — a new query starts a fresh result accumulator. ---
  const [searchPage, setSearchPage] = useState(1);
  const [searchAccum, setSearchAccum] = useState<Entity[]>([]);
  useEffect(() => {
    setSearchPage(1);
    setSearchAccum([]);
  }, [search]);

  const isUserKind = participantKind === "user";

  const alreadyAddedIds = useMemo(
    () => new Set(alreadyAdded.map((p) => p.id)),
    [alreadyAdded],
  );

  // --- Enrolled tab: full active-in-scope cohort, paginated. Rows
  //     that are already added render dimmed with a ✓ Added pill
  //     (handled at render time) so the cohort count stays stable
  //     and we don't have to subtract anything client-side. ---
  const [enrolledPage, setEnrolledPage] = useState(1);
  const [enrolledAccum, setEnrolledAccum] = useState<Entity[]>([]);
  useEffect(() => {
    setEnrolledPage(1);
    setEnrolledAccum([]);
  }, [activityId, entityTypeId]);

  const {
    data: enrolledResp,
    isLoading: enrolledLoading,
    isFetching: enrolledFetching,
  } = useQuery({
    queryKey: ["picker-enrolled", entityTypeId, activityId, enrolledPage],
    queryFn: () =>
      entityApi.listPaginated({
        entity_type_id: entityTypeId,
        with_enrollment_status_for_activity: activityId,
        enrollment_status_filter: "active_in_scope",
        page: enrolledPage,
        limit: PAGE_SIZE,
      }),
    enabled: open && smart && !isUserKind && !!entityTypeId,
  });
  useEffect(() => {
    if (!enrolledResp) return;
    if (enrolledPage === 1) {
      setEnrolledAccum(enrolledResp.data || []);
    } else {
      setEnrolledAccum((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        const next = [...prev];
        for (const e of enrolledResp.data || []) {
          if (!seen.has(e.id)) next.push(e);
        }
        return next;
      });
    }
  }, [enrolledResp, enrolledPage]);
  const enrolledEntities: Entity[] = enrolledAccum;
  const enrolledTotal = enrolledResp?.count ?? 0;
  const hasMoreEnrolled = enrolledEntities.length < enrolledTotal;

  // --- All tab: total count (entity sections only — users come from
  //     userApi.list() below which already returns everything). ---
  const { data: totalResp } = useQuery({
    queryKey: ["picker-total", entityTypeId],
    queryFn: () =>
      entityApi.listPaginated({
        entity_type_id: entityTypeId,
        limit: 1,
      }),
    enabled: open && !isUserKind && !!entityTypeId,
  });

  // For small entity types (total ≤ one page), we render the All tab
  // without requiring a search — there's nothing to scroll past. Above
  // the page-size threshold the search prompt kicks in.
  const allTotalForGate = totalResp?.count ?? 0;
  const showAllByDefault =
    !isUserKind && totalResp !== undefined && allTotalForGate <= PAGE_SIZE;

  // --- All tab: search results. Entity sections paginate via server
  //     search; user sections client-filter the full user list. ---
  // Server returns the page indicated by `page`; we append non-first
  // pages into `searchAccum` so the user can browse past the 50-row
  // ceiling without losing earlier results when they hit Load more.
  const { data: searchResp, isLoading: searchLoading, isFetching: searchFetching } = useQuery({
    queryKey: ["picker-search", entityTypeId, activityId, search, searchPage],
    queryFn: () =>
      entityApi.listPaginated({
        entity_type_id: entityTypeId,
        // Only include enrollment status in Smart mode — saves the
        // server work we don't need anywhere else.
        with_enrollment_status_for_activity: smart ? activityId : undefined,
        search,
        page: searchPage,
        limit: PAGE_SIZE,
      }),
    enabled:
      open &&
      tab === "all" &&
      !isUserKind &&
      !!entityTypeId &&
      (search.trim().length > 0 || showAllByDefault),
  });
  useEffect(() => {
    if (!searchResp) return;
    if (searchPage === 1) {
      setSearchAccum(searchResp.data || []);
    } else {
      // Dedupe on id in case the server reshuffles between page calls
      // (e.g. someone just enrolled a beneficiary mid-browse).
      setSearchAccum((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        const next = [...prev];
        for (const e of searchResp.data || []) {
          if (!seen.has(e.id)) next.push(e);
        }
        return next;
      });
    }
  }, [searchResp, searchPage]);
  const searchTotal = searchResp?.count ?? 0;
  const searchEntities: Entity[] = searchAccum;
  const hasMoreSearch = searchEntities.length < searchTotal;

  // --- User mode: full users list. List is small (org staff), so
  //     fetching once and client-filtering is fine. ---
  const { data: allUsers = [], isLoading: usersLoading } = useQuery<UserListItem[]>({
    queryKey: ["picker-users"],
    queryFn: userApi.list,
    enabled: open && isUserKind,
  });
  const allUsersTotal = allUsers.length;

  const allTotal = isUserKind ? allUsersTotal : (totalResp?.count ?? 0);

  // Client-side filter helper for tabs that aren't search-driven.
  const matchesSearch = (name: string) => {
    if (!search.trim()) return true;
    return normalize(name).includes(normalize(search));
  };

  const getName = (e: Entity): string => {
    const firstStringVal = Object.values(e.meta || {}).find(
      (v) => typeof v === "string" && v,
    ) as string | undefined;
    return firstStringVal || e.code || e.id;
  };

  const getUserName = (u: UserListItem): string =>
    `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.mobile_number;

  // Per-tab visible rows.
  const addedRows = useMemo(
    () =>
      [...alreadyAdded]
        .filter((p) => matchesSearch(p.name))
        .sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [alreadyAdded, search],
  );
  // Enrolled rows include already-added ones (rendered with the
  // ✓ Added pill + dim opacity in PickerRow) so the count stays
  // stable as the user adds. Client-side search filters loaded pages
  // — for searching across the full cohort, use the All tab.
  const enrolledRows = useMemo(
    () =>
      enrolledEntities
        .filter((e) => matchesSearch(getName(e)))
        .sort((a, b) => getName(a).localeCompare(getName(b))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enrolledEntities, search],
  );
  const userRows = useMemo(
    () =>
      allUsers
        .filter((u) => matchesSearch(getUserName(u)))
        .sort((a, b) => getUserName(a).localeCompare(getUserName(b))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allUsers, search],
  );

  // Counts — absolute totals (not filtered by the current search box).
  // Enrolled = total active-in-scope cohort (includes already-added,
  // which render dimmed in the list). Added = parent-supplied count.
  // All = total of the entity type. Stable badges that don't bounce
  // as the user adds participants.
  const addedCount = alreadyAdded.length;
  const enrolledCount = enrolledTotal;
  const allCount = allTotal;

  const refreshAfterAction = () => {
    queryClient.invalidateQueries({ queryKey: ["picker-enrolled"] });
    queryClient.invalidateQueries({ queryKey: ["picker-total"] });
    queryClient.invalidateQueries({ queryKey: ["picker-search"] });
    onAdded();
  };

  const addMutation = useMutation({
    mutationFn: (participantId: string) =>
      activityApi.pickerAdd(activityId, {
        entity_id: participantId,
        section_key: sectionKey,
        participant_type: isUserKind ? "user" : "entity",
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
    setTab(smart ? "enrolled" : "all");
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
              active={tab === "added"}
              label="Added"
              count={addedCount}
              onClick={() => setTab("added")}
            />
            {smart && (
              <TabPill
                active={tab === "enrolled"}
                label="Enrolled"
                count={enrolledCount}
                onClick={() => setTab("enrolled")}
              />
            )}
            <TabPill
              active={tab === "all"}
              label="All"
              count={allCount}
              onClick={() => setTab("all")}
            />
          </div>

          <div className="max-h-96 overflow-y-auto border rounded-md divide-y">
            {tab === "added" && (
              addedRows.length === 0 ? (
                <p className="text-sm text-gray-500 p-3">
                  {search.trim()
                    ? `No added ${entityTypeName.toLowerCase()} match.`
                    : `No ${entityTypeName.toLowerCase()} added yet.`}
                </p>
              ) : (
                addedRows.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <div className="text-sm font-medium text-gray-800 truncate">
                      {p.name}
                    </div>
                    <span className="text-xs text-gray-500 px-2">✓ Added</span>
                  </div>
                ))
              )
            )}

            {smart && tab === "enrolled" && (
              enrolledLoading && enrolledEntities.length === 0 ? (
                <p className="text-sm text-gray-500 p-3">Loading…</p>
              ) : enrolledRows.length === 0 ? (
                <p className="text-sm text-gray-500 p-3">
                  {search.trim()
                    ? `No enrolled ${entityTypeName.toLowerCase()} match. Try the All tab.`
                    : `No ${entityTypeName.toLowerCase()} is enrolled here yet.`}
                </p>
              ) : (
                <>
                  {enrolledRows.map((e) => (
                    <PickerRow
                      key={e.id}
                      name={getName(e)}
                      subtitle={"Enrolled here"}
                      alreadyAdded={alreadyAddedIds.has(e.id)}
                      canEnrollAndAdd={true}
                      activeInScope={true}
                      onAdd={() => addMutation.mutate(e.id)}
                      onEnrollAndAdd={() => setEnrollFor(e)}
                      pending={addMutation.isPending}
                    />
                  ))}
                  {hasMoreEnrolled && (
                    <div className="px-3 py-2 flex items-center justify-between gap-3 bg-gray-50">
                      <span className="text-xs text-gray-500">
                        Showing {enrolledEntities.length} of {enrolledTotal}.
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={enrolledFetching}
                        onClick={() => setEnrolledPage((p) => p + 1)}
                      >
                        {enrolledFetching ? "Loading…" : "Load more"}
                      </Button>
                    </div>
                  )}
                </>
              )
            )}

            {tab === "all" && isUserKind && (
              usersLoading ? (
                <p className="text-sm text-gray-500 p-3">Loading…</p>
              ) : userRows.length === 0 ? (
                <p className="text-sm text-gray-500 p-3">
                  {search.trim()
                    ? `No ${entityTypeName.toLowerCase()} match.`
                    : `No ${entityTypeName.toLowerCase()} available.`}
                </p>
              ) : (
                userRows.map((u) => (
                  <PickerRow
                    key={u.id}
                    name={getUserName(u)}
                    subtitle={u.role_name || undefined}
                    alreadyAdded={alreadyAddedIds.has(u.id)}
                    canEnrollAndAdd={false}
                    activeInScope={true}
                    onAdd={() => addMutation.mutate(u.id)}
                    onEnrollAndAdd={() => {}}
                    pending={addMutation.isPending}
                  />
                ))
              )
            )}

            {tab === "all" && !isUserKind && (
              !search.trim() && !showAllByDefault ? (
                <p className="text-sm text-gray-500 p-3">
                  Type to search {entityTypeName.toLowerCase()}…
                </p>
              ) : searchLoading && searchEntities.length === 0 ? (
                <p className="text-sm text-gray-500 p-3">Searching…</p>
              ) : searchEntities.length === 0 ? (
                <p className="text-sm text-gray-500 p-3">
                  No {entityTypeName.toLowerCase()} match.
                </p>
              ) : (
                <>
                  {searchEntities.map((e) => {
                    const activeInScope =
                      smart && e.enrollment_status === "active_in_scope";
                    return (
                      <PickerRow
                        key={e.id}
                        name={getName(e)}
                        subtitle={
                          smart
                            ? activeInScope
                              ? "Enrolled here"
                              : "Not enrolled in scope"
                            : undefined
                        }
                        alreadyAdded={alreadyAddedIds.has(e.id)}
                        canEnrollAndAdd={smart}
                        activeInScope={smart ? activeInScope : true}
                        onAdd={() => addMutation.mutate(e.id)}
                        onEnrollAndAdd={() => setEnrollFor(e)}
                        pending={addMutation.isPending}
                      />
                    );
                  })}
                  {hasMoreSearch && (
                    <div className="px-3 py-2 flex items-center justify-between gap-3 bg-gray-50">
                      <span className="text-xs text-gray-500">
                        Showing {searchEntities.length} of {searchTotal} —
                        narrow your search or load more.
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={searchFetching}
                        onClick={() => setSearchPage((p) => p + 1)}
                      >
                        {searchFetching ? "Loading…" : "Load more"}
                      </Button>
                    </div>
                  )}
                </>
              )
            )}
          </div>

          {/* "Create new …" only for entity sections. Smart sections
              run create + enrollment together via the combined modal;
              basic-entity sections defer to the regular entity-create
              page. User sections never get a create CTA — admins
              manage users via /admin/users. */}
          {!isUserKind && smart && entityTypeId && (
            <div className="pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setShowCreateNew(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Create new {entityTypeName.toLowerCase()}
              </Button>
            </div>
          )}
        </div>
      </Dialog>

      {enrollFor && smart && (
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

      {showCreateNew && smart && entityTypeId && (
        <CreateAndAddModal
          activityId={activityId}
          activityDimensions={activityDimensions}
          sectionKey={sectionKey}
          entityTypeId={entityTypeId}
          entityTypeName={entityTypeName}
          onClose={() => setShowCreateNew(false)}
          onSuccess={() => {
            setShowCreateNew(false);
            // Land back on the picker with a clean state so the
            // freshly-created beneficiary actually surfaces — they
            // wouldn't match whatever the user had typed before.
            setSearch("");
            setTab("enrolled");
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
  name,
  subtitle,
  alreadyAdded,
  canEnrollAndAdd,
  activeInScope,
  onAdd,
  onEnrollAndAdd,
  pending,
}: {
  name: string;
  subtitle?: string;
  alreadyAdded: boolean;
  /** Smart mode entity row → may surface the Enroll & Add button when
   *  the row isn't active-in-scope. False for non-smart and user rows. */
  canEnrollAndAdd: boolean;
  /** In Smart mode, distinguishes the row's available action. Non-smart
   *  and user rows pass `true` so the direct + Add button shows. */
  activeInScope: boolean;
  onAdd: () => void;
  onEnrollAndAdd: () => void;
  pending: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 px-3 py-2 ${
        alreadyAdded ? "opacity-60" : ""
      }`}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-800 truncate">{name}</div>
        {subtitle && (
          <div className="text-xs text-gray-500 truncate">{subtitle}</div>
        )}
      </div>
      {alreadyAdded ? (
        <span className="text-xs text-gray-500 px-2">✓ Added</span>
      ) : canEnrollAndAdd && !activeInScope ? (
        <Button size="sm" onClick={onEnrollAndAdd} disabled={pending}>
          Enroll &amp; Add
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={onAdd} disabled={pending}>
          + Add
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

  // Dimension IDs the enrollment form-builder tracks for this entity
  // type. Activity dimensions on other axes (Project, Intervention,
  // etc.) shouldn't end up on the enrollment record or in the locked
  // banner — they're activity-only.
  const enrollmentTrackedDimIds = useMemo(() => {
    const ids = new Set<string>();
    for (const f of collectEnrollmentFields(
      allSchemas,
      entity.entity_type_id,
      [],
    )) {
      if (f.type === "dimension" && f.dimension_id) ids.add(f.dimension_id);
    }
    return ids;
  }, [allSchemas, entity.entity_type_id]);

  const lockedDimensions: EnrollmentLockedDimension[] = useMemo(
    () =>
      activityDimensions.filter((d) =>
        enrollmentTrackedDimIds.has(d.dimension_id),
      ),
    [activityDimensions, enrollmentTrackedDimIds],
  );

  const hasFields = useMemo(
    () =>
      collectEnrollmentFields(
        allSchemas,
        entity.entity_type_id,
        lockedDimensions.map((d) => d.value_id),
      ).some((f) => f.visible !== false),
    [allSchemas, entity.entity_type_id, lockedDimensions],
  );

  const [metaValues, setMetaValues] = useState<Record<string, unknown>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const fieldsRef = useRef<EnrollmentFieldsHandle>(null);

  const mutation = useMutation({
    mutationFn: () =>
      activityApi.pickerEnrollAndAdd(activityId, {
        entity_id: entity.id,
        section_key: sectionKey,
        enrollment_meta: Object.keys(metaValues).length ? metaValues : undefined,
        enrollment_dimension_value_ids: lockedDimensions.map((d) => d.value_id),
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
    const validationError = fieldsRef.current?.validate();
    if (validationError) {
      setFormError(validationError);
      return;
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
        {hasFields ? (
          <div className="space-y-3">
            <EnrollmentFields
              ref={fieldsRef}
              entityTypeId={entity.entity_type_id}
              allSchemas={allSchemas}
              lockedDimensions={lockedDimensions}
              userDimensionValueIds={[]}
              onUserDimensionsChange={() => {}}
              metaValues={metaValues}
              onMetaChange={setMetaValues}
              dimensionMode="activity"
            />
          </div>
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

/** Combined modal: entity-create fields + required enrollment fields,
 *  saved atomically via /participants/create_and_add. Activity
 *  dimensions auto-applied to the new enrollment. */
function CreateAndAddModal({
  activityId,
  activityDimensions,
  sectionKey,
  entityTypeId,
  entityTypeName,
  onClose,
  onSuccess,
}: {
  activityId: string;
  activityDimensions: ActivityDimensionValue[];
  sectionKey: string;
  entityTypeId: string;
  entityTypeName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { data: allSchemas = [] } = useQuery<MetaFieldSchemaItem[]>({
    queryKey: ["meta-field-schemas"],
    queryFn: metaFieldSchemaApi.getAll,
  });

  // Same scope-down as the existing Enroll & Add modal: filter activity
  // dimensions to those the enrollment form-builder tracks.
  const enrollmentTrackedDimIds = useMemo(() => {
    const ids = new Set<string>();
    for (const f of collectEnrollmentFields(allSchemas, entityTypeId, [])) {
      if (f.type === "dimension" && f.dimension_id) ids.add(f.dimension_id);
    }
    return ids;
  }, [allSchemas, entityTypeId]);

  const lockedDimensions: EnrollmentLockedDimension[] = useMemo(
    () =>
      activityDimensions.filter((d) =>
        enrollmentTrackedDimIds.has(d.dimension_id),
      ),
    [activityDimensions, enrollmentTrackedDimIds],
  );

  const entityFields: MetaFieldDefinition[] = useMemo(
    () =>
      getFieldsForScope(allSchemas, {
        type: "entity",
        entity_type_id: entityTypeId,
      }).filter((f) => f.visible !== false),
    [allSchemas, entityTypeId],
  );

  const hasEnrollmentFields = useMemo(
    () =>
      collectEnrollmentFields(
        allSchemas,
        entityTypeId,
        lockedDimensions.map((d) => d.value_id),
      ).some((f) => f.visible !== false),
    [allSchemas, entityTypeId, lockedDimensions],
  );

  const [entityMeta, setEntityMeta] = useState<Record<string, unknown>>({});
  const [enrollmentMeta, setEnrollmentMeta] = useState<Record<string, unknown>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const fieldsRef = useRef<EnrollmentFieldsHandle>(null);

  const mutation = useMutation({
    mutationFn: () =>
      activityApi.pickerCreateAndAdd(activityId, {
        entity_type_id: entityTypeId,
        entity_meta: Object.keys(entityMeta).length ? entityMeta : undefined,
        section_key: sectionKey,
        enrollment_meta: Object.keys(enrollmentMeta).length ? enrollmentMeta : undefined,
        enrollment_dimension_value_ids: lockedDimensions.map((d) => d.value_id),
      }),
    onSuccess: () => {
      toast.success(`${entityTypeName} created and added`);
      onSuccess();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setFormError(err.response?.data?.message || "Failed to create and add");
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    for (const f of entityFields) {
      if (!f.required) continue;
      const v = entityMeta[f.key];
      if (v === undefined || v === null || v === "") {
        setFormError(`${f.label} is required.`);
        return;
      }
    }
    const enrollmentError = fieldsRef.current?.validate();
    if (enrollmentError) {
      setFormError(enrollmentError);
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open onClose={onClose} title={`Create new ${entityTypeName}`}>
      <form onSubmit={onSubmit} className="space-y-4">
        {formError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </div>
        )}

        {entityFields.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {entityTypeName} details
            </h4>
            <DynamicMetaForm
              fields={entityFields}
              values={entityMeta}
              onChange={setEntityMeta}
            />
          </div>
        )}

        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Enrollment
          </h4>
          {hasEnrollmentFields ? (
            <EnrollmentFields
              ref={fieldsRef}
              entityTypeId={entityTypeId}
              allSchemas={allSchemas}
              lockedDimensions={lockedDimensions}
              userDimensionValueIds={[]}
              onUserDimensionsChange={() => {}}
              metaValues={enrollmentMeta}
              onMetaChange={setEnrollmentMeta}
              dimensionMode="activity"
            />
          ) : (
            <p className="text-xs text-gray-500">
              No additional enrollment fields configured.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            Create &amp; Add
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

