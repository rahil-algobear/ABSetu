"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  centerApi,
  programmeApi,
  programmeCenterApi,
  sessionTemplateApi,
  facilitatorApi,
} from "@/services/api";
import { Can } from "@/components/Auth/Permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLayout } from "@/components/ui/page-layout";
import { Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

function AdminSection({
  title,
  permission,
  items,
  isLoading,
  onCreate,
  onDelete,
  fields,
  renderItem,
}: {
  title: string;
  permission: string;
  items: any[];
  isLoading: boolean;
  onCreate: (data: Record<string, string>) => void;
  onDelete?: (id: string) => void;
  fields: { key: string; label: string; required?: boolean }[];
  renderItem: (item: any) => React.ReactNode;
}) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});

  return (
    <Card className="mb-4">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-lg">{title}</CardTitle>
        <Can permission={permission}>
          <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" />
          </Button>
        </Can>
      </CardHeader>
      <CardContent>
        {showForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onCreate(formData);
              setFormData({});
              setShowForm(false);
            }}
            className="mb-3 space-y-2 p-3 border rounded bg-gray-50"
          >
            {fields.map((f) => (
              <Input
                key={f.key}
                placeholder={f.label}
                value={formData[f.key] || ""}
                onChange={(e) =>
                  setFormData({ ...formData, [f.key]: e.target.value })
                }
                required={f.required}
              />
            ))}
            <div className="flex gap-2">
              <Button type="submit" size="sm">Save</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        )}

        {isLoading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-gray-500 text-sm">None yet</p>
        ) : (
          <div className="space-y-1">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex justify-between items-center p-2 border rounded text-sm"
              >
                {renderItem(item)}
                {onDelete && (
                  <Can permission={permission}>
                    <button
                      onClick={() => onDelete(item.id)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Can>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminPage() {
  const queryClient = useQueryClient();

  const { data: centers = [], isLoading: centersLoading } = useQuery({
    queryKey: ["centers"],
    queryFn: centerApi.list,
  });

  const { data: programmes = [], isLoading: programmesLoading } = useQuery({
    queryKey: ["programmes"],
    queryFn: programmeApi.list,
  });

  const { data: programmeCenters = [], isLoading: pcLoading } = useQuery({
    queryKey: ["programme-centers"],
    queryFn: programmeCenterApi.list,
  });

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ["session-templates"],
    queryFn: sessionTemplateApi.list,
  });

  const { data: facilitators = [], isLoading: facilitatorsLoading } = useQuery({
    queryKey: ["facilitators"],
    queryFn: facilitatorApi.list,
  });

  // Mutations
  const createCenter = useMutation({
    mutationFn: centerApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["centers"] });
      toast.success("Center created");
    },
    onError: () => toast.error("Failed"),
  });

  const deleteCenter = useMutation({
    mutationFn: centerApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["centers"] });
      toast.success("Center deleted");
    },
  });

  const createProgramme = useMutation({
    mutationFn: programmeApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programmes"] });
      toast.success("Programme created");
    },
    onError: () => toast.error("Failed"),
  });

  const deleteProgramme = useMutation({
    mutationFn: programmeApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programmes"] });
      toast.success("Programme deleted");
    },
  });

  const createTemplate = useMutation({
    mutationFn: sessionTemplateApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session-templates"] });
      toast.success("Session template created");
    },
    onError: () => toast.error("Failed"),
  });

  const deleteTemplate = useMutation({
    mutationFn: sessionTemplateApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session-templates"] });
      toast.success("Session template deleted");
    },
  });

  const createFacilitator = useMutation({
    mutationFn: facilitatorApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["facilitators"] });
      toast.success("Facilitator created");
    },
    onError: () => toast.error("Failed"),
  });

  const deleteFacilitator = useMutation({
    mutationFn: facilitatorApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["facilitators"] });
      toast.success("Facilitator deleted");
    },
  });

  // Programme-Center linking
  const [pcForm, setPcForm] = useState({ programme_id: "", center_id: "" });

  const createPc = useMutation({
    mutationFn: programmeCenterApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programme-centers"] });
      toast.success("Programme linked to center");
    },
    onError: () => toast.error("Failed"),
  });

  const deletePc = useMutation({
    mutationFn: programmeCenterApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programme-centers"] });
      toast.success("Link removed");
    },
  });

  return (
    <PageLayout className="p-4">
      <h1 className="text-2xl font-bold mb-4">Settings</h1>

      <AdminSection
        title="Centers"
        permission="center:manage"
        items={centers}
        isLoading={centersLoading}
        onCreate={(data) => createCenter.mutate({ name: data.name, code: data.code, address: data.address })}
        onDelete={(id) => deleteCenter.mutate(id)}
        fields={[
          { key: "name", label: "Name", required: true },
          { key: "code", label: "Code", required: true },
          { key: "address", label: "Address" },
        ]}
        renderItem={(item) => (
          <div>
            <span className="font-medium">{item.name}</span>
            <span className="text-gray-400 ml-2">({item.code})</span>
          </div>
        )}
      />

      <AdminSection
        title="Programmes"
        permission="programme:manage"
        items={programmes}
        isLoading={programmesLoading}
        onCreate={(data) => createProgramme.mutate({ name: data.name, description: data.description })}
        onDelete={(id) => deleteProgramme.mutate(id)}
        fields={[
          { key: "name", label: "Name", required: true },
          { key: "description", label: "Description" },
        ]}
        renderItem={(item) => (
          <div>
            <span className="font-medium">{item.name}</span>
            {item.description && (
              <span className="text-gray-400 ml-2 text-xs">{item.description}</span>
            )}
          </div>
        )}
      />

      <Card className="mb-4">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-lg">Programme - Center Links</CardTitle>
        </CardHeader>
        <CardContent>
          <Can permission="programme:manage">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (pcForm.programme_id && pcForm.center_id) {
                  createPc.mutate(pcForm);
                  setPcForm({ programme_id: "", center_id: "" });
                }
              }}
              className="mb-3 flex gap-2 flex-wrap"
            >
              <select
                className="border rounded-md p-2 text-sm flex-1 min-w-[120px]"
                value={pcForm.programme_id}
                onChange={(e) => setPcForm({ ...pcForm, programme_id: e.target.value })}
                required
              >
                <option value="">Programme...</option>
                {programmes.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <select
                className="border rounded-md p-2 text-sm flex-1 min-w-[120px]"
                value={pcForm.center_id}
                onChange={(e) => setPcForm({ ...pcForm, center_id: e.target.value })}
                required
              >
                <option value="">Center...</option>
                {centers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <Button type="submit" size="sm">Link</Button>
            </form>
          </Can>

          {pcLoading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : programmeCenters.length === 0 ? (
            <p className="text-gray-500 text-sm">No links yet</p>
          ) : (
            <div className="space-y-1">
              {programmeCenters.map((pc) => (
                <div key={pc.id} className="flex justify-between items-center p-2 border rounded text-sm">
                  <span>{pc.programme_name} - {pc.center_name}</span>
                  <Can permission="programme:manage">
                    <button onClick={() => deletePc.mutate(pc.id)} className="text-gray-400 hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Can>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AdminSection
        title="Session Templates"
        permission="session_template:manage"
        items={templates}
        isLoading={templatesLoading}
        onCreate={(data) => createTemplate.mutate({ name: data.name, description: data.description })}
        onDelete={(id) => deleteTemplate.mutate(id)}
        fields={[
          { key: "name", label: "Name", required: true },
          { key: "description", label: "Description" },
        ]}
        renderItem={(item) => (
          <div>
            <span className="font-medium">{item.name}</span>
            {item.description && (
              <span className="text-gray-400 ml-2 text-xs">{item.description}</span>
            )}
          </div>
        )}
      />

      <AdminSection
        title="Facilitators"
        permission="facilitator:manage"
        items={facilitators}
        isLoading={facilitatorsLoading}
        onCreate={(data) => createFacilitator.mutate({ name: data.name, contact: data.contact })}
        onDelete={(id) => deleteFacilitator.mutate(id)}
        fields={[
          { key: "name", label: "Name", required: true },
          { key: "contact", label: "Contact" },
        ]}
        renderItem={(item) => (
          <div>
            <span className="font-medium">{item.name}</span>
            {item.contact && (
              <span className="text-gray-400 ml-2">{item.contact}</span>
            )}
          </div>
        )}
      />
    </PageLayout>
  );
}
