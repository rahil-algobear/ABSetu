"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { beneficiaryApi } from "@/services/api";
import { Can } from "@/components/Auth/Permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLayout } from "@/components/ui/page-layout";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

export default function BeneficiariesPage() {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const queryClient = useQueryClient();

  const { data: beneficiaries = [], isLoading } = useQuery({
    queryKey: ["beneficiaries"],
    queryFn: beneficiaryApi.list,
  });

  const createMutation = useMutation({
    mutationFn: beneficiaryApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["beneficiaries"] });
      setShowCreate(false);
      setNewName("");
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

      {showCreate && (
        <Card className="mb-4">
          <CardContent className="pt-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newName.trim()) {
                  createMutation.mutate({ name: newName.trim() });
                }
              }}
              className="flex gap-2"
            >
              <Input
                placeholder="Beneficiary name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
              <Button type="submit" disabled={createMutation.isPending}>
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

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
