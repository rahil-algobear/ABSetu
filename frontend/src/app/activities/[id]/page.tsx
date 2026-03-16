"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { activityApi, beneficiaryApi } from "@/services/api";
import { Can } from "@/components/Auth/Permissions";
import { useVocabulary } from "@/hooks/useVocabulary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageLayout } from "@/components/ui/page-layout";
import toast from "react-hot-toast";

export default function ActivityDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const queryClient = useQueryClient();
  const { v } = useVocabulary();
  const [showParticipation, setShowParticipation] = useState(false);
  const [participationMap, setParticipationMap] = useState<Record<string, string>>({});

  const { data: activity, isLoading } = useQuery({
    queryKey: ["activity", id],
    queryFn: () => activityApi.get(id),
  });

  const { data: participations = [] } = useQuery({
    queryKey: ["participations", id],
    queryFn: () => activityApi.getParticipations(id),
  });

  const { data: beneficiaries = [] } = useQuery({
    queryKey: ["beneficiaries"],
    queryFn: beneficiaryApi.list,
    enabled: showParticipation,
  });

  const markMutation = useMutation({
    mutationFn: (records: { beneficiary_id: string; status: string }[]) =>
      activityApi.markParticipations(id, records),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["participations", id] });
      setShowParticipation(false);
      toast.success("Participation saved");
    },
    onError: () => toast.error("Failed to save participation"),
  });

  const openParticipation = () => {
    const map: Record<string, string> = {};
    participations.forEach((p) => {
      map[p.beneficiary_id] = p.status;
    });
    setParticipationMap(map);
    setShowParticipation(true);
  };

  const handleSave = () => {
    const records = Object.entries(participationMap).map(([beneficiary_id, status]) => ({
      beneficiary_id,
      status,
    }));
    markMutation.mutate(records);
  };

  if (isLoading) return <PageLayout className="p-4"><p>Loading...</p></PageLayout>;
  if (!activity) return <PageLayout className="p-4"><p>Not found</p></PageLayout>;

  return (
    <PageLayout className="p-4">
      <h1 className="text-2xl font-bold mb-1">{activity.type_name}</h1>
      <div className="flex gap-1 mb-1 flex-wrap">
        {activity.tags
          .filter((tag) => tag.dimension_key !== "activity_type")
          .map((tag) => (
            <Badge key={tag.value_id} variant="secondary">
              {tag.dimension_name}: {tag.value_name}
            </Badge>
          ))}
      </div>
      <p className="text-gray-500 mb-4">{activity.date}</p>

      {activity.facilitators.length > 0 && (
        <div className="mb-4">
          <span className="text-sm text-gray-500">{v("facilitator")}s: </span>
          {activity.facilitators.map((f) => (
            <Badge key={f.id} variant="secondary" className="mr-1">
              {f.name}
            </Badge>
          ))}
        </div>
      )}

      {activity.notes && (
        <p className="text-sm text-gray-600 mb-4">{activity.notes}</p>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-lg">{v("participation")}</CardTitle>
          <Can permission="activity:create">
            <Button size="sm" onClick={openParticipation}>
              Mark {v("participation")}
            </Button>
          </Can>
        </CardHeader>
        <CardContent>
          {showParticipation ? (
            <div className="space-y-2">
              {beneficiaries.map((b) => (
                <label
                  key={b.id}
                  className="flex items-center justify-between p-2 border rounded"
                >
                  <span className="text-sm">{b.name}</span>
                  <select
                    className="border rounded px-2 py-1 text-sm"
                    value={participationMap[b.id] || ""}
                    onChange={(e) =>
                      setParticipationMap({
                        ...participationMap,
                        [b.id]: e.target.value,
                      })
                    }
                  >
                    <option value="">-- Not marked --</option>
                    <option value="present">Present</option>
                    <option value="absent">Absent</option>
                  </select>
                </label>
              ))}
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleSave}
                  disabled={markMutation.isPending}
                >
                  Save
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowParticipation(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : participations.length === 0 ? (
            <p className="text-gray-500 text-sm">No participation recorded</p>
          ) : (
            <div className="space-y-1">
              {participations.map((p) => (
                <div
                  key={p.id}
                  className="flex justify-between items-center p-2 border rounded text-sm"
                >
                  <span>{p.beneficiary_name || p.beneficiary_id}</span>
                  <Badge
                    variant={p.status === "present" ? "default" : "secondary"}
                  >
                    {p.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PageLayout>
  );
}
