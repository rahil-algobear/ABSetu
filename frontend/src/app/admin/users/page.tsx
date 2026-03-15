"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  userApi,
  roleApi,
  centerApi,
  programmeApi,
  sessionTemplateApi,
} from "@/services/api";
import { UserListItem, Role, Center, Programme, SessionTemplate } from "@/types";
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
        <div className="space-y-1 max-h-36 overflow-y-auto border rounded-md p-2">
          {items.map((item) => (
            <label key={getId(item)} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectedIds.has(getId(item))}
                onChange={() => onToggle(getId(item))}
                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              {getLabel(item)}
            </label>
          ))}
        </div>
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

  // Access modal state
  const [accessUser, setAccessUser] = useState<UserListItem | null>(null);
  const [selectedCenterIds, setSelectedCenterIds] = useState<Set<string>>(new Set());
  const [selectedProgrammeIds, setSelectedProgrammeIds] = useState<Set<string>>(new Set());
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set());

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: userApi.list,
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["roles"],
    queryFn: roleApi.list,
  });

  const { data: centers = [] } = useQuery<Center[]>({
    queryKey: ["centers"],
    queryFn: centerApi.list,
  });

  const { data: programmes = [] } = useQuery<Programme[]>({
    queryKey: ["programmes"],
    queryFn: programmeApi.list,
  });

  const { data: sessionTemplates = [] } = useQuery<SessionTemplate[]>({
    queryKey: ["sessionTemplates"],
    queryFn: sessionTemplateApi.list,
  });

  const createMutation = useMutation({
    mutationFn: userApi.create,
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
      data: { center_ids: string[]; programme_ids: string[]; session_template_ids: string[] };
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
    setCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    setCreateModalOpen(false);
  };

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
    setSelectedCenterIds(new Set(user.center_ids || []));
    setSelectedProgrammeIds(new Set(user.programme_ids || []));
    setSelectedTemplateIds(new Set(user.session_template_ids || []));
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
    updateUserMutation.mutate({
      userId: editingUser.id,
      data: editForm,
    });
  };

  const handleAccessSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessUser) return;
    updateAccessMutation.mutate({
      userId: accessUser.id,
      data: {
        center_ids: Array.from(selectedCenterIds),
        programme_ids: Array.from(selectedProgrammeIds),
        session_template_ids: Array.from(selectedTemplateIds),
      },
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
      setter(new Set());
    } else {
      setter(new Set(items.map((i) => i.id)));
    }
  };

  const centerMap = new Map(centers.map((c) => [c.id, c.name]));
  const programmeMap = new Map(programmes.map((p) => [p.id, p.name]));
  const templateMap = new Map(sessionTemplates.map((t) => [t.id, t.name]));

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Users</h2>
        <Can permission="user:manage">
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Add User
          </Button>
        </Can>
      </div>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : users.length === 0 ? (
        <p className="text-gray-500 text-sm">No users yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Centers</TableHead>
              <TableHead>Programmes</TableHead>
              <TableHead>Templates</TableHead>
              <TableHead className="w-24">Actions</TableHead>
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
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {user.center_ids?.length ? (
                      user.center_ids.map((id) => (
                        <span key={id} className="inline-block text-sm bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                          {centerMap.get(id) || "Unknown"}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-gray-400">All</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {user.programme_ids?.length ? (
                      user.programme_ids.map((id) => (
                        <span key={id} className="inline-block text-sm bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
                          {programmeMap.get(id) || "Unknown"}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-gray-400">All</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {user.session_template_ids?.length ? (
                      user.session_template_ids.map((id) => (
                        <span key={id} className="inline-block text-sm bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                          {templateMap.get(id) || "Unknown"}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-gray-400">All</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Can permission="user:manage">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(user)}
                        className="text-gray-400 hover:text-purple-600"
                        title="Change role"
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
      )}

      {/* Add User Modal */}
      <Dialog
        open={createModalOpen}
        onClose={closeCreateModal}
        title="Add User"
      >
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="first-name">First Name</Label>
              <Input
                id="first-name"
                value={createForm.first_name}
                onChange={(e) =>
                  setCreateForm({ ...createForm, first_name: e.target.value })
                }
                required
              />
            </div>
            <div>
              <Label htmlFor="last-name">Last Name</Label>
              <Input
                id="last-name"
                value={createForm.last_name}
                onChange={(e) =>
                  setCreateForm({ ...createForm, last_name: e.target.value })
                }
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
                onChange={(e) =>
                  setCreateForm({ ...createForm, country_code: e.target.value })
                }
                placeholder="+91"
                required
              />
            </div>
            <div>
              <Label htmlFor="mobile">Mobile Number</Label>
              <Input
                id="mobile"
                value={createForm.mobile_number}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    mobile_number: e.target.value,
                  })
                }
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
              onChange={(e) =>
                setCreateForm({ ...createForm, role_id: e.target.value })
              }
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              required
            >
              <option value="">Select a role...</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                  {role.is_default ? " (Default)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeCreateModal}>
              Cancel
            </Button>
            <Button type="submit">Add User</Button>
          </div>
        </form>
      </Dialog>

      {/* Edit User Modal */}
      <Dialog
        open={editModalOpen}
        onClose={closeEditModal}
        title="Edit User"
      >
        {editingUser && (
          <form onSubmit={handleEditSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="edit-first-name">First Name</Label>
                <Input
                  id="edit-first-name"
                  value={editForm.first_name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, first_name: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-last-name">Last Name</Label>
                <Input
                  id="edit-last-name"
                  value={editForm.last_name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, last_name: e.target.value })
                  }
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
                  onChange={(e) =>
                    setEditForm({ ...editForm, country_code: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-mobile">Mobile Number</Label>
                <Input
                  id="edit-mobile"
                  value={editForm.mobile_number}
                  onChange={(e) =>
                    setEditForm({ ...editForm, mobile_number: e.target.value })
                  }
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-role">Role</Label>
              <select
                id="edit-role"
                value={editForm.role_id}
                onChange={(e) =>
                  setEditForm({ ...editForm, role_id: e.target.value })
                }
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                required
              >
                <option value="">Select a role...</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                    {role.is_default ? " (Default)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={closeEditModal}>
                Cancel
              </Button>
              <Button type="submit" disabled={!editForm.role_id}>
                Save
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      {/* Manage Access Modal */}
      <Dialog
        open={accessModalOpen}
        onClose={closeAccessModal}
        title="Manage Access"
      >
        {accessUser && (
          <form onSubmit={handleAccessSubmit} className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="font-medium">
                {accessUser.first_name} {accessUser.last_name}
              </p>
              <p className="text-sm text-gray-500">
                {accessUser.role_name || "No role"}
              </p>
            </div>

            <p className="text-xs text-gray-500">
              Select which entities this user can access. Leave a section empty for unrestricted access to that entity type.
            </p>

            <AccessCheckboxSection
              title="Centers"
              items={centers}
              selectedIds={selectedCenterIds}
              onToggle={(id) => toggleId(selectedCenterIds, setSelectedCenterIds, id)}
              onToggleAll={() => toggleAll(centers, selectedCenterIds, setSelectedCenterIds)}
              getId={(i) => i.id}
              getLabel={(i) => i.name}
            />

            <AccessCheckboxSection
              title="Programmes"
              items={programmes}
              selectedIds={selectedProgrammeIds}
              onToggle={(id) => toggleId(selectedProgrammeIds, setSelectedProgrammeIds, id)}
              onToggleAll={() => toggleAll(programmes, selectedProgrammeIds, setSelectedProgrammeIds)}
              getId={(i) => i.id}
              getLabel={(i) => i.name}
            />

            <AccessCheckboxSection
              title="Session Templates"
              items={sessionTemplates}
              selectedIds={selectedTemplateIds}
              onToggle={(id) => toggleId(selectedTemplateIds, setSelectedTemplateIds, id)}
              onToggleAll={() => toggleAll(sessionTemplates, selectedTemplateIds, setSelectedTemplateIds)}
              getId={(i) => i.id}
              getLabel={(i) => i.name}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={closeAccessModal}>
                Cancel
              </Button>
              <Button type="submit">Save Access</Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
