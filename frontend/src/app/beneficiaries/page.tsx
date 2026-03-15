"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { beneficiaryApi, metaFieldSchemaApi } from "@/services/api";
import { MetaFieldDefinition } from "@/types";
import { Can } from "@/components/Auth/Permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { DynamicMetaForm } from "@/components/DynamicMetaForm";
import { PageLayout } from "@/components/ui/page-layout";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

export default function BeneficiariesPage() {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [metaValues, setMetaValues] = useState<Record<string, unknown>>({});
  const queryClient = useQueryClient();

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
      setShowCreate(false);
      setNewName("");
      setMetaValues({});
      toast.success("Beneficiary created");
    },
    onError: () => toast.error("Failed to create beneficiary"),
  });

  const filtered = beneficiaries.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.case_number.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <PageLayout className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Beneficiaries</h1>
        <Can permission="beneficiary:create">
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add
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

      <Dialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add Beneficiary"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) {
              const meta = Object.keys(metaValues).length > 0 ? metaValues : undefined;
              createMutation.mutate({ name: newName.trim(), meta });
            }
          }}
          className="space-y-3"
        >
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="Beneficiary name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <DynamicMetaForm
            fields={metaFields}
            values={metaValues}
            onChange={setMetaValues}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              Create
            </Button>
          </div>
        </form>
      </Dialog>

      {isLoading ? (
        <p className="text-gray-500">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500">No beneficiaries found.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((b) => (
            <Link key={b.id} href={`/beneficiaries/${b.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="py-3 px-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">{b.name}</p>
                      <p className="text-sm text-gray-500">{b.case_number}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </PageLayout>
  );
}
