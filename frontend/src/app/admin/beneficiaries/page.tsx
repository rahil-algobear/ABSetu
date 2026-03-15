"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { beneficiaryApi, metaFieldSchemaApi } from "@/services/api";
import { Beneficiary, MetaFieldDefinition } from "@/types";
import { Can } from "@/components/Auth/Permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { DynamicMetaForm } from "@/components/DynamicMetaForm";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/page-table";
import { Plus, Pencil, Search } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

export default function BeneficiariesSettingsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Beneficiary | null>(null);
  const [form, setForm] = useState({ name: "" });
  const [metaValues, setMetaValues] = useState<Record<string, unknown>>({});
  const [search, setSearch] = useState("");

  const { data: beneficiaries = [], isLoading } = useQuery({
    queryKey: ["beneficiaries"],
    queryFn: beneficiaryApi.list,
  });

  const { data: metaFields = [] } = useQuery<MetaFieldDefinition[]>({
    queryKey: ["meta-field-schemas", "beneficiary"],
    queryFn: () => metaFieldSchemaApi.get("beneficiary"),
  });

  const createMutation = useMutation({
    mutationFn: beneficiaryApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["beneficiaries"] });
      closeModal();
      toast.success("Beneficiary created");
    },
    onError: () => toast.error("Failed to create beneficiary"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Beneficiary> }) =>
      beneficiaryApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["beneficiaries"] });
      closeModal();
      toast.success("Beneficiary updated");
    },
    onError: () => toast.error("Failed to update beneficiary"),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "" });
    setMetaValues({});
    setModalOpen(true);
  };

  const openEdit = (item: Beneficiary) => {
    setEditing(item);
    setForm({ name: item.name });
    setMetaValues(item.meta || {});
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const meta = Object.keys(metaValues).length > 0 ? metaValues : undefined;
    if (editing) {
      updateMutation.mutate({
        id: editing.id,
        data: { ...form, meta: meta || null },
      });
    } else {
      createMutation.mutate({ ...form, meta });
    }
  };

  const filtered = beneficiaries.filter(
    (b) =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.case_number.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Beneficiaries</h2>
        <Can permission="beneficiary:create">
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Add Beneficiary
          </Button>
        </Can>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by name or case number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500 text-sm">No beneficiaries found.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Case No.</TableHead>
              {metaFields.map((f) => (
                <TableHead key={f.key}>{f.label}</TableHead>
              ))}
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((b) => (
              <TableRow key={b.id}>
                <TableCell>
                  <Link
                    href={`/beneficiaries/${b.id}`}
                    className="text-purple-600 hover:underline"
                  >
                    {b.name}
                  </Link>
                </TableCell>
                <TableCell>{b.case_number}</TableCell>
                {metaFields.map((f) => (
                  <TableCell key={f.key}>
                    {b.meta?.[f.key] !== undefined
                      ? String(b.meta[f.key])
                      : "—"}
                  </TableCell>
                ))}
                <TableCell>
                  <Can permission="beneficiary:edit">
                    <button
                      onClick={() => openEdit(b)}
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
        title={editing ? "Edit Beneficiary" : "Add Beneficiary"}
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <DynamicMetaForm
            fields={metaFields}
            values={metaValues}
            onChange={setMetaValues}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit">{editing ? "Save" : "Create"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
