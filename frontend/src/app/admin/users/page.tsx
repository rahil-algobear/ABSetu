"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  userApi,
  roleApi,
  dimensionApi,
} from "@/services/api";
import { UserListItem, Role, Dimension, DimensionValue } from "@/types";
import { Can } from "@/components/Auth/Permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/page-table";
import { PageHeader } from "@/components/ui/page-header";
import { PageContent } from "@/components/ui/page-content";
import { Plus, Pencil, Phone, Shield, Trash2 } from "lucide-react";

import toast from "react-hot-toast";

function AccessCheckboxSection({
  title,
  items,
  selectedIds,
  onToggle,
  onToggleAll,
  getId,
  getLabel,
}: {
  title: string;
  items: { id: string; name: string }[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  getId: (item: { id: string; name: string }) => string;
  getLabel: (item: { id: string; name: string }) => string;
}) {
  const [search, setSearch] = useState("");
  const sorted = [...items].sort((a, b) => getLabel(a).localeCompare(getLabel(b)));
  const filtered = search
    ? sorted.filter((i) => getLabel(i).toLowerCase().includes(search.toLowerCase()))
    : sorted;
  const allSelected = items.length > 0 && items.every((i) => selectedIds.has(getId(i)));
  const noneSelected = items.every((i) => !selectedIds.has(getId(i)));

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium">{title}</label>
        <button
          type="button"
          onClick={onToggleAll}
          className="text-xs text-purple-600 hover:text-purple-800"
        >
          {allSelected ? "Clear All" : "Select All"}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">No {title.toLowerCase()} available</p>
      ) : (
        <>
          {items.length > 5 && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${title.toLowerCase()}...`}
              className="w-full mb-1 px-2 py-1 text-sm border rounded-md border-gray-300 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          )}
          <div className="space-y-1 max-h-36 overflow-y-auto border rounded-md p-2">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 py-1">No matches</p>
            ) : (
              filtered.map((item) => (
                <label key={getId(item)} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(getId(item))}
                    onChange={() => onToggle(getId(item))}
                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  {getLabel(item)}
                </label>
              ))
            )}
          </div>
        </>
      )}
      <p className="text-xs text-gray-400 mt-1">
        {noneSelected
          ? "No restriction — user sees all"
          : `${selectedIds.size} of ${items.length} selected`}
      </p>
    </div>
  );
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [accessModalOpen, setAccessModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
    country_code: "+91",
    mobile_number: "",
    role_id: "",
  });
  const [createForm, setCreateForm] = useState({
    first_name: "",
    last_name: "",
    country_code: "+91",
    mobile_number: "",
    role_id: "",
  });
  const [createDvIds, setCreateDvIds] = useState<Set<string>>(new Set());

  // Access modal state
  const [accessUser, setAccessUser] = useState<UserListItem | null>(null);
  const [selectedDvIds, setSelectedDvIds] = useState<Set<string>>(new Set());

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: userApi.list,
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["roles"],
    queryFn: roleApi.list,
  });

  const { data: allDimensions = [] } = useQuery<Dimension[]>({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
  });

  // Only access-control dimensions are assignable to users; tag-like
  // axes are excluded from the access editor and table columns.
  const dimensions = allDimensions.filter((d) => d.is_dimension);

  // Load all dimension values
  const { data: allDimensionValues = [] } = useQuery<DimensionValue[]>({
    queryKey: ["all-dimension-values", dimensions.map((d) => d.id).join(",")],
    queryFn: async () => {
      const results = await Promise.all(
        dimensions.map((d) => dimensionApi.listValues(d.id))
      );
      return results.flat();
    },
    enabled: dimensions.length > 0,
  });

  const dvMap = new Map(allDimensionValues.map((dv) => [dv.id, dv]));

  const createMutation = useMutation({
    mutationFn: async (data: typeof createForm) => {
      const user = await userApi.create(data);
      if (createDvIds.size > 0) {
        await userApi.updateAccess(user.id, {
          dimension_value_ids: Array.from(createDvIds),
        });
      }
      return user;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      closeCreateModal();
      toast.success("User added");
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      const msg = err.response?.data?.message || "Failed to add user";
      toast.error(msg);
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: typeof editForm }) =>
      userApi.update(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      closeEditModal();
      toast.success("User updated");
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      const msg = err.response?.data?.message || "Failed to update user";
      toast.error(msg);
    },
  });

  const updateAccessMutation = useMutation({
    mutationFn: ({
      userId,
      data,
    }: {
      userId: string;
      data: { dimension_value_ids: string[] };
    }) => userApi.updateAccess(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      closeAccessModal();
      toast.success("Access updated");
    },
    onError: () => toast.error("Failed to update access"),
  });

  const deleteMutation = useMutation({
    mutationFn: userApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("User deleted");
    },
    onError: () => toast.error("Failed to delete user"),
  });

  const openCreate = () => {
    const defaultRole = roles.find((r) => r.is_default);
    setCreateForm({
      first_name: "",
      last_name: "",
      country_code: "+91",
      mobile_number: "",
      role_id: defaultRole?.id || "",
    });
    setCreateDvIds(new Set());
    setCreateModalOpen(true);
  };

  const closeCreateModal = () => setCreateModalOpen(false);

  const openEdit = (user: UserListItem) => {
    setEditingUser(user);
    setEditForm({
      first_name: user.first_name,
      last_name: user.last_name,
      country_code: user.country_code,
      mobile_number: user.mobile_number,
      role_id: user.role_id || "",
    });
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setEditingUser(null);
  };

  const openAccess = (user: UserListItem) => {
    setAccessUser(user);
    setSelectedDvIds(new Set(user.dimension_value_ids || []));
    setAccessModalOpen(true);
  };

  const closeAccessModal = () => {
    setAccessModalOpen(false);
    setAccessUser(null);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(createForm);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !editForm.role_id) return;
    updateUserMutation.mutate({ userId: editingUser.id, data: editForm });
  };

  const handleAccessSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessUser) return;
    updateAccessMutation.mutate({
      userId: accessUser.id,
      data: { dimension_value_ids: Array.from(selectedDvIds) },
    });
  };

  const toggleId = (
    set: Set<string>,
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    id: string
  ) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };

  const toggleAll = (
    items: { id: string }[],
    set: Set<string>,
    setter: React.Dispatch<React.SetStateAction<Set<string>>>
  ) => {
    const allSelected = items.every((i) => set.has(i.id));
    if (allSelected) {
      // Remove only these items
      const next = new Set(set);
      items.forEach((i) => next.delete(i.id));
      setter(next);
    } else {
      const next = new Set(set);
      items.forEach((i) => next.add(i.id));
      setter(next);
    }
  };

  // Group dimension values by dimension for display
  const dvsByDimension = dimensions.map((dim) => ({
    dimension: dim,
    values: allDimensionValues.filter((dv) => dv.dimension_id === dim.id),
  }));

  return (
    <>
      <PageHeader
        title="Users"
        actions={
          <Can permission="user:manage">
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Add User
            </Button>
          </Can>
        }
      />
      <PageContent>
      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : users.length === 0 ? (
        <p className="text-gray-500 text-sm">No users yet.</p>
      ) : (
        <div className="bg-white shadow-sm border rounded-lg overflow-hidden">
        <Table stickyRows={1} className="max-h-[calc(100vh-400px)] lg:max-h-[calc(100vh-300px)]">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead>Role</TableHead>
              {dimensions.map((dim) => (
                <TableHead key={dim.id}>{dim.name}</TableHead>
              ))}
              <TableHead className="w-24 text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <span className="font-medium">
                    {user.first_name} {user.last_name}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 text-sm text-gray-500">
                    <Phone className="h-3 w-3" />
                    {user.country_code} {user.mobile_number}
                  </div>
                </TableCell>
                <TableCell>
                  {user.role_name ? (
                    <span className="text-sm bg-purple-50 text-purple-700 px-2 py-0.5 rounded">
                      {user.role_name}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400">No role</span>
                  )}
                </TableCell>
                {dimensions.map((dim) => {
                  const values = (user.dimension_value_ids ?? [])
                    .map((id) => dvMap.get(id))
                    .filter((dv): dv is DimensionValue => dv?.dimension_id === dim.id);
                  return (
                    <TableCell key={dim.id}>
                      <div className="flex flex-wrap gap-1">
                        {values.length ? (
                          values.map((dv) => (
                            <span key={dv.id} className="inline-block text-sm bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                              {dv.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-gray-400">All</span>
                        )}
                      </div>
                    </TableCell>
                  );
                })}
                <TableCell>
                  <Can permission="user:manage">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => openEdit(user)}
                        className="text-gray-400 hover:text-purple-600"
                        title="Edit user"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => openAccess(user)}
                        className="text-gray-400 hover:text-purple-600"
                        title="Manage access"
                      >
                        <Shield className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete ${user.first_name} ${user.last_name}?`))
                            deleteMutation.mutate(user.id);
                        }}
                        className="text-gray-400 hover:text-red-500"
                        title="Delete user"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </Can>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      )}

      {/* Add User Modal */}
      <Dialog open={createModalOpen} onClose={closeCreateModal} title="Add User">
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="first-name">First Name</Label>
              <Input
                id="first-name"
                value={createForm.first_name}
                onChange={(e) => setCreateForm({ ...createForm, first_name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="last-name">Last Name</Label>
              <Input
                id="last-name"
                value={createForm.last_name}
                onChange={(e) => setCreateForm({ ...createForm, last_name: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-[80px_1fr] gap-3">
            <div>
              <Label htmlFor="country-code">Code</Label>
              <Input
                id="country-code"
                value={createForm.country_code}
                onChange={(e) => setCreateForm({ ...createForm, country_code: e.target.value })}
                placeholder="+91"
                required
              />
            </div>
            <div>
              <Label htmlFor="mobile">Mobile Number</Label>
              <Input
                id="mobile"
                value={createForm.mobile_number}
                onChange={(e) => setCreateForm({ ...createForm, mobile_number: e.target.value })}
                placeholder="9876543210"
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="create-role">Role</Label>
            <select
              id="create-role"
              value={createForm.role_id}
              onChange={(e) => setCreateForm({ ...createForm, role_id: e.target.value })}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              required
            >
              <option value="">Select a role...</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}{role.is_default ? " (Default)" : ""}
                </option>
              ))}
            </select>
          </div>

          <p className="text-xs text-gray-500 pt-1">
            Restrict access to specific dimension values. Leave empty for full access.
          </p>

          {dvsByDimension.map(({ dimension, values }) => (
            <AccessCheckboxSection
              key={dimension.id}
              title={dimension.name}
              items={values}
              selectedIds={createDvIds}
              onToggle={(id) => toggleId(createDvIds, setCreateDvIds, id)}
              onToggleAll={() => toggleAll(values, createDvIds, setCreateDvIds)}
              getId={(i) => i.id}
              getLabel={(i) => i.name}
            />
          ))}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeCreateModal}>Cancel</Button>
            <Button type="submit">Add User</Button>
          </div>
        </form>
      </Dialog>

      {/* Edit User Modal */}
      <Dialog open={editModalOpen} onClose={closeEditModal} title="Edit User">
        {editingUser && (
          <form onSubmit={handleEditSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="edit-first-name">First Name</Label>
                <Input
                  id="edit-first-name"
                  value={editForm.first_name}
                  onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-last-name">Last Name</Label>
                <Input
                  id="edit-last-name"
                  value={editForm.last_name}
                  onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-[80px_1fr] gap-3">
              <div>
                <Label htmlFor="edit-country-code">Code</Label>
                <Input
                  id="edit-country-code"
                  value={editForm.country_code}
                  onChange={(e) => setEditForm({ ...editForm, country_code: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-mobile">Mobile Number</Label>
                <Input
                  id="edit-mobile"
                  value={editForm.mobile_number}
                  onChange={(e) => setEditForm({ ...editForm, mobile_number: e.target.value })}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-role">Role</Label>
              <select
                id="edit-role"
                value={editForm.role_id}
                onChange={(e) => setEditForm({ ...editForm, role_id: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                required
              >
                <option value="">Select a role...</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}{role.is_default ? " (Default)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={closeEditModal}>Cancel</Button>
              <Button type="submit" disabled={!editForm.role_id}>Save</Button>
            </div>
          </form>
        )}
      </Dialog>

      {/* Manage Access Modal */}
      <Dialog open={accessModalOpen} onClose={closeAccessModal} title="Manage Access">
        {accessUser && (
          <form onSubmit={handleAccessSubmit} className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="font-medium">{accessUser.first_name} {accessUser.last_name}</p>
              <p className="text-sm text-gray-500">{accessUser.role_name || "No role"}</p>
            </div>

            <p className="text-xs text-gray-500">
              Select which dimension values this user can access. Leave a section empty for unrestricted access.
            </p>

            {dvsByDimension.map(({ dimension, values }) => (
              <AccessCheckboxSection
                key={dimension.id}
                title={dimension.name}
                items={values}
                selectedIds={selectedDvIds}
                onToggle={(id) => toggleId(selectedDvIds, setSelectedDvIds, id)}
                onToggleAll={() => toggleAll(values, selectedDvIds, setSelectedDvIds)}
                getId={(i) => i.id}
                getLabel={(i) => i.name}
              />
            ))}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={closeAccessModal}>Cancel</Button>
              <Button type="submit">Save Access</Button>
            </div>
          </form>
        )}
      </Dialog>
      </PageContent>
    </>
  );
}
