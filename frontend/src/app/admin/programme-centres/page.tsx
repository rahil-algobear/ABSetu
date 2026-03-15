"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  programmeApi,
  centerApi,
  programmeCenterApi,
} from "@/services/api";
import { Can } from "@/components/Auth/Permissions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/page-table";
import { Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

export default function ProgrammeCentresPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ programme_id: "", center_id: "" });

  const { data: programmeCenters = [], isLoading } = useQuery({
    queryKey: ["programme-centers"],
    queryFn: programmeCenterApi.list,
  });

  const { data: programmes = [] } = useQuery({
    queryKey: ["programmes"],
    queryFn: programmeApi.list,
  });

  const { data: centres = [] } = useQuery({
    queryKey: ["centers"],
    queryFn: centerApi.list,
  });

  const createMutation = useMutation({
    mutationFn: programmeCenterApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programme-centers"] });
      setModalOpen(false);
      setForm({ programme_id: "", center_id: "" });
      toast.success("Programme linked to centre");
    },
    onError: () => toast.error("Failed to create link"),
  });

  const deleteMutation = useMutation({
    mutationFn: programmeCenterApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programme-centers"] });
      toast.success("Link removed");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.programme_id && form.center_id) {
      createMutation.mutate(form);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Programme-Centre Links</h2>
        <Can permission="programme:manage">
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Link
          </Button>
        </Can>
      </div>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : programmeCenters.length === 0 ? (
        <p className="text-gray-500 text-sm">No links yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Programme</TableHead>
              <TableHead>Centre</TableHead>
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {programmeCenters.map((pc) => (
              <TableRow key={pc.id}>
                <TableCell>{pc.programme_name || pc.programme_id}</TableCell>
                <TableCell>{pc.center_name || pc.center_id}</TableCell>
                <TableCell>
                  <Can permission="programme:manage">
                    <button
                      onClick={() => {
                        if (confirm("Remove this link?"))
                          deleteMutation.mutate(pc.id);
                      }}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
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
        onClose={() => setModalOpen(false)}
        title="Link Programme to Centre"
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label>Programme</Label>
            <select
              className="w-full border rounded-md p-2 text-sm"
              value={form.programme_id}
              onChange={(e) =>
                setForm({ ...form, programme_id: e.target.value })
              }
              required
            >
              <option value="">Select programme...</option>
              {programmes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Centre</Label>
            <select
              className="w-full border rounded-md p-2 text-sm"
              value={form.center_id}
              onChange={(e) =>
                setForm({ ...form, center_id: e.target.value })
              }
              required
            >
              <option value="">Select centre...</option>
              {centres.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Link</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
