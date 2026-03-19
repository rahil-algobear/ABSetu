"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { entityApi, entityTypeApi, metaFieldSchemaApi } from "@/services/api";
import { MetaFieldDefinition } from "@/types";
import { Can } from "@/components/Auth/Permissions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { DynamicMetaForm } from "@/components/DynamicMetaForm";
import { PageLayout } from "@/components/ui/page-layout";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

export default function EntitiesPage() {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTypeId, setNewTypeId] = useState("");
  const [metaValues, setMetaValues] = useState<Record<string, unknown>>({});
  const [filterTypeId, setFilterTypeId] = useState("");
  const queryClient = useQueryClient();


  const { data: entityTypes = [] } = useQuery({
    queryKey: ["entity-types"],
    queryFn: entityTypeApi.list,
  });

  const { data: entities = [], isLoading } = useQuery({
    queryKey: ["entities", filterTypeId],
    queryFn: () => entityApi.list(filterTypeId || undefined),
  });

  const { data: metaFields = [] } = useQuery<MetaFieldDefinition[]>({
    queryKey: ["meta-field-schemas", "entity"],
    queryFn: () => metaFieldSchemaApi.get("entity"),
  });

  const createMutation = useMutation({
    mutationFn: entityApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entities"] });
      setShowCreate(false);
      setNewName("");
      setNewTypeId("");
      setMetaValues({});
      toast.success("Entity created");
    },
    onError: () => toast.error("Failed to create entity"),
  });

  const filtered = entities.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.case_number || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <PageLayout className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Entities</h1>
        <Can permission="entity:create">
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </Can>
      </div>

      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by name or case number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        {entityTypes.length > 1 && (
          <select
            className="border rounded-md px-3 py-2 text-sm"
            value={filterTypeId}
            onChange={(e) => setFilterTypeId(e.target.value)}
          >
            <option value="">All</option>
            {entityTypes.map((et) => (
              <option key={et.id} value={et.id}>{et.name}</option>
            ))}
          </select>
        )}
      </div>

      <Dialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add Entity"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim() && newTypeId) {
              const meta = Object.keys(metaValues).length > 0 ? metaValues : undefined;
              createMutation.mutate({
                entity_type_id: newTypeId,
                name: newName.trim(),
                meta,
              });
            }
          }}
          className="space-y-3"
        >
          <div>
            <Label htmlFor="entity_type_id">Entity Type</Label>
            <select
              id="entity_type_id"
              className="w-full mt-1 border rounded-md p-2 text-sm"
              value={newTypeId}
              onChange={(e) => setNewTypeId(e.target.value)}
              required
            >
              <option value="">Select...</option>
              {entityTypes.map((et) => (
                <option key={et.id} value={et.id}>{et.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="Entity name"
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
        <p className="text-gray-500">No entities found.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <Link key={e.id} href={`/entities/${e.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="py-3 px-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">{e.name}</p>
                      <div className="flex gap-1 items-center">
                        {e.case_number && (
                          <span className="text-sm text-gray-500">{e.case_number}</span>
                        )}
                        {e.entity_type_name && (
                          <Badge variant="secondary" className="text-xs">
                            {e.entity_type_name}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {e.dimensions.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {e.dimensions.map((dim) => (
                          <Badge key={dim.value_id} variant="secondary" className="text-xs">
                            {dim.value_name}
                          </Badge>
                        ))}
                      </div>
                    )}
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
