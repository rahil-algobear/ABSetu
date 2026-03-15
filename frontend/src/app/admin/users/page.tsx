"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { userApi, roleApi } from "@/services/api";
import { UserListItem, Role } from "@/types";
import { Can } from "@/components/Auth/Permissions";
import { Button } from "@/components/ui/button";
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
import { Pencil, Phone } from "lucide-react";
import toast from "react-hot-toast";

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState("");

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: userApi.list,
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["roles"],
    queryFn: roleApi.list,
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      userApi.updateRole(userId, roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      closeModal();
      toast.success("Role updated");
    },
    onError: () => toast.error("Failed to update role"),
  });

  const openEdit = (user: UserListItem) => {
    setEditingUser(user);
    setSelectedRoleId(user.role_id || "");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingUser(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
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

      <Dialog
        open={modalOpen}
        onClose={closeModal}
        title="Change User Role"
      >
        {editingUser && (
          <form onSubmit={handleSubmit} className="space-y-4">
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
              <Button type="button" variant="outline" onClick={closeModal}>
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
