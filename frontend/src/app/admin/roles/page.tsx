"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { roleApi } from "@/services/api";
import { Role, Permission } from "@/types";
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
import { Plus, Pencil, Trash2, Shield, Check } from "lucide-react";
import toast from "react-hot-toast";
// Group permission keys by area for better UX
function groupPermissions(permissions: Permission[]) {
  const groups: Record<string, Permission[]> = {};
  for (const p of permissions) {
    const area = p.key.split(":")[0];
    if (!groups[area]) groups[area] = [];
    groups[area].push(p);
  }
  return groups;
}

// Fallback labels for permission areas that aren't in vocabulary
const AREA_LABELS: Record<string, string> = {
  org: "Organization",
  dimension: "Dimensions",
  role: "Roles",
  user: "Users",
  reports: "Reports",
};

// Generic terms in permission descriptions → vocabulary keys
// Order matters: longer phrases first to avoid partial replacements
const DESCRIPTION_REPLACEMENTS: [string, string][] = [
  ["activity types", "activity_type"],
  ["activity type", "activity_type"],
  ["activities", "activity"],
  ["participation", "participation"],
  ["facilitators", "facilitator"],
  ["facilitator", "facilitator"],
  ["beneficiaries", "beneficiary"],
  ["beneficiary", "beneficiary"],
  ["enrollments", "enrollment"],
  ["enrollment", "enrollment"],
];

/** Replace generic entity terms in a permission description with hardcoded labels. */
function localizeDescription(desc: string): string {
  return desc;
}

export default function RolesPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [selectedPermIds, setSelectedPermIds] = useState<Set<string>>(
    new Set()
  );

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["roles"],
    queryFn: roleApi.list,
  });

  const { data: allPermissions = [] } = useQuery({
    queryKey: ["permissions"],
    queryFn: roleApi.listPermissions,
  });

  const createMutation = useMutation({
    mutationFn: roleApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      closeModal();
      toast.success("Role created");
    },
    onError: () => toast.error("Failed to create role"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof roleApi.update>[1] }) =>
      roleApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      closeModal();
      toast.success("Role updated");
    },
    onError: () => toast.error("Failed to update role"),
  });

  const deleteMutation = useMutation({
    mutationFn: roleApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      toast.success("Role deleted");
    },
    onError: (err: Error) =>
      toast.error(err.message || "Failed to delete role"),
  });

  const openCreate = () => {
    setEditing(null);
    setName("");
    setIsDefault(false);
    setSelectedPermIds(new Set());
    setModalOpen(true);
  };

  const openEdit = (role: Role) => {
    setEditing(role);
    setName(role.name);
    setIsDefault(role.is_default);
    setSelectedPermIds(new Set(role.permissions.map((p) => p.id)));
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const togglePermission = (id: string) => {
    setSelectedPermIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (perms: Permission[]) => {
    const allSelected = perms.every((p) => selectedPermIds.has(p.id));
    setSelectedPermIds((prev) => {
      const next = new Set(prev);
      for (const p of perms) {
        if (allSelected) next.delete(p.id);
        else next.add(p.id);
      }
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name,
      is_default: isDefault,
      permission_ids: Array.from(selectedPermIds),
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const grouped = groupPermissions(allPermissions);

  return (
    <>
      <PageHeader
        title="Roles"
        actions={
          <Can permission="role:manage">
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Add Role
            </Button>
          </Can>
        }
      />

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : roles.length === 0 ? (
        <p className="text-gray-500 text-sm">No roles yet.</p>
      ) : (
        <div className="bg-white shadow-sm border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead>Users</TableHead>
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => (
              <TableRow key={role.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-purple-500" />
                    {role.name}
                    {role.is_system && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                        System
                      </span>
                    )}
                    {role.is_default && (
                      <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                        Default
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-gray-500">
                    {role.permissions.length} permission
                    {role.permissions.length !== 1 ? "s" : ""}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-gray-500">
                    {role.user_count}
                  </span>
                </TableCell>
                <TableCell>
                  <Can permission="role:manage">
                    {!role.is_system && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEdit(role)}
                          className="text-gray-400 hover:text-purple-600"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (
                              confirm(
                                `Delete role "${role.name}"? This cannot be undone.`
                              )
                            )
                              deleteMutation.mutate(role.id);
                          }}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </Can>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      )}

      <Dialog
        open={modalOpen}
        onClose={closeModal}
        title={editing ? "Edit Role" : "Add Role"}
        className="max-w-lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="role-name">Role Name</Label>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Coordinator"
              required
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is-default"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
            />
            <Label htmlFor="is-default" className="mb-0">
              Default role for new users
            </Label>
          </div>

          <div>
            <Label>Permissions</Label>
            <div className="border rounded-lg max-h-64 overflow-y-auto divide-y">
              {Object.entries(grouped).map(([area, perms]) => {
                const allSelected = perms.every((p) =>
                  selectedPermIds.has(p.id)
                );
                return (
                  <div key={area} className="p-3">
                    <button
                      type="button"
                      onClick={() => toggleGroup(perms)}
                      className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5 hover:text-purple-600"
                    >
                      <div
                        className={`h-3.5 w-3.5 rounded border flex items-center justify-center ${
                          allSelected
                            ? "bg-purple-600 border-purple-600"
                            : "border-gray-300"
                        }`}
                      >
                        {allSelected && (
                          <Check className="h-2.5 w-2.5 text-white" />
                        )}
                      </div>
                      {AREA_LABELS[area] || area}
                    </button>
                    <div className="space-y-1.5 ml-5">
                      {perms.map((p) => (
                        <label
                          key={p.id}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedPermIds.has(p.id)}
                            onChange={() => togglePermission(p.id)}
                            className="h-3.5 w-3.5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                          />
                          <span>{p.description ? localizeDescription(p.description) : p.key}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {selectedPermIds.size} selected
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit">
              {editing ? "Save" : "Create"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
