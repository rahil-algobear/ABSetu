"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { userApi, roleApi } from "@/services/api";
import { UserListItem, Role } from "@/types";
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
import { Plus, Pencil, Phone } from "lucide-react";
import toast from "react-hot-toast";

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [createForm, setCreateForm] = useState({
    first_name: "",
    last_name: "",
    country_code: "+91",
    mobile_number: "",
    role_id: "",
  });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: userApi.list,
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["roles"],
    queryFn: roleApi.list,
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

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      userApi.updateRole(userId, roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      closeEditModal();
      toast.success("Role updated");
    },
    onError: () => toast.error("Failed to update role"),
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
    setSelectedRoleId(user.role_id || "");
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setEditingUser(null);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(createForm);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !selectedRoleId) return;
    updateRoleMutation.mutate({
      userId: editingUser.id,
      roleId: selectedRoleId,
    });
  };

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
              <TableHead className="w-20">Actions</TableHead>
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
                  <Can permission="user:manage">
                    <button
                      onClick={() => openEdit(user)}
                      className="text-gray-400 hover:text-purple-600"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
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

      {/* Edit Role Modal */}
      <Dialog
        open={editModalOpen}
        onClose={closeEditModal}
        title="Change User Role"
      >
        {editingUser && (
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="font-medium">
                {editingUser.first_name} {editingUser.last_name}
              </p>
              <p className="text-sm text-gray-500">
                {editingUser.country_code} {editingUser.mobile_number}
              </p>
            </div>

            <div>
              <Label htmlFor="role-select">Role</Label>
              <select
                id="role-select"
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(e.target.value)}
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
              <Button type="submit" disabled={!selectedRoleId}>
                Save
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
