"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  sessionApi,
  sessionTemplateApi,
  programmeCenterApi,
  facilitatorApi,
} from "@/services/api";
import { Can } from "@/components/Auth/Permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLayout } from "@/components/ui/page-layout";
import { Plus } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

export default function SessionsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const queryClient = useQueryClient();

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: sessionApi.list,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["session-templates"],
    queryFn: sessionTemplateApi.list,
  });

  const { data: programmeCenters = [] } = useQuery({
    queryKey: ["programme-centers"],
    queryFn: programmeCenterApi.list,
  });

  const { data: facilitators = [] } = useQuery({
    queryKey: ["facilitators"],
    queryFn: facilitatorApi.list,
  });

  const [formData, setFormData] = useState({
    session_template_id: "",
    programme_center_id: "",
    date: new Date().toISOString().split("T")[0],
    notes: "",
    facilitator_ids: [] as string[],
  });

  const createMutation = useMutation({
    mutationFn: sessionApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      setShowCreate(false);
      setFormData({
        session_template_id: "",
        programme_center_id: "",
        date: new Date().toISOString().split("T")[0],
        notes: "",
        facilitator_ids: [],
      });
      toast.success("Session created");
    },
    onError: () => toast.error("Failed to create session"),
  });

  return (
    <PageLayout className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Sessions</h1>
        <Can permission="session:create">
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Session
          </Button>
        </Can>
      </div>

      {showCreate && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Create Session</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate(formData);
              }}
              className="space-y-3"
            >
              <div>
                <label className="text-sm font-medium">Session Type</label>
                <select
                  className="w-full mt-1 border rounded-md p-2 text-sm"
                  value={formData.session_template_id}
                  onChange={(e) =>
                    setFormData({ ...formData, session_template_id: e.target.value })
                  }
                  required
                >
                  <option value="">Select...</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Programme - Center</label>
                <select
                  className="w-full mt-1 border rounded-md p-2 text-sm"
                  value={formData.programme_center_id}
                  onChange={(e) =>
                    setFormData({ ...formData, programme_center_id: e.target.value })
                  }
                  required
                >
                  <option value="">Select...</option>
                  {programmeCenters.map((pc) => (
                    <option key={pc.id} value={pc.id}>
                      {pc.programme_name} - {pc.center_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Date</label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) =>
                    setFormData({ ...formData, date: e.target.value })
                  }
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium">Facilitators</label>
                <div className="mt-1 space-y-1 max-h-32 overflow-y-auto border rounded-md p-2">
                  {facilitators.map((f) => (
                    <label key={f.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={formData.facilitator_ids.includes(f.id)}
                        onChange={(e) => {
                          const ids = e.target.checked
                            ? [...formData.facilitator_ids, f.id]
                            : formData.facilitator_ids.filter((id) => id !== f.id);
                          setFormData({ ...formData, facilitator_ids: ids });
                        }}
                      />
                      {f.name}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Notes</label>
                <Input
                  placeholder="Optional notes..."
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={createMutation.isPending}>
                  Create
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="text-gray-500">Loading...</p>
      ) : sessions.length === 0 ? (
        <p className="text-gray-500">No sessions yet.</p>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <Link key={s.id} href={`/sessions/${s.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="py-3 px-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">{s.template_name}</p>
                      <p className="text-sm text-gray-500">
                        {s.programme_name} - {s.center_name}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{s.date}</p>
                      {s.facilitators.length > 0 && (
                        <p className="text-xs text-gray-500">
                          {s.facilitators.map((f) => f.name).join(", ")}
                        </p>
                      )}
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
