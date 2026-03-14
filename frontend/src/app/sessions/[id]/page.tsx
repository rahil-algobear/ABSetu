"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sessionApi, beneficiaryApi } from "@/services/api";
import { Can } from "@/components/Auth/Permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageLayout } from "@/components/ui/page-layout";
import toast from "react-hot-toast";

export default function SessionDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const queryClient = useQueryClient();
  const [showAttendance, setShowAttendance] = useState(false);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, string>>({});

  const { data: session, isLoading } = useQuery({
    queryKey: ["session", id],
    queryFn: () => sessionApi.get(id),
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ["attendance", id],
    queryFn: () => sessionApi.getAttendance(id),
  });

  const { data: beneficiaries = [] } = useQuery({
    queryKey: ["beneficiaries"],
    queryFn: beneficiaryApi.list,
    enabled: showAttendance,
  });

  const markMutation = useMutation({
    mutationFn: (records: { beneficiary_id: string; status: string }[]) =>
      sessionApi.markAttendance(id, records),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance", id] });
      setShowAttendance(false);
      toast.success("Attendance saved");
    },
    onError: () => toast.error("Failed to save attendance"),
  });

  // Initialize attendance map from existing records when opening
  const openAttendance = () => {
    const map: Record<string, string> = {};
    attendance.forEach((a) => {
      map[a.beneficiary_id] = a.status;
    });
    setAttendanceMap(map);
    setShowAttendance(true);
  };

  const handleSaveAttendance = () => {
    const records = Object.entries(attendanceMap).map(([beneficiary_id, status]) => ({
      beneficiary_id,
      status,
    }));
    markMutation.mutate(records);
  };

  if (isLoading) return <PageLayout className="p-4"><p>Loading...</p></PageLayout>;
  if (!session) return <PageLayout className="p-4"><p>Not found</p></PageLayout>;

  return (
    <PageLayout className="p-4">
      <h1 className="text-2xl font-bold mb-1">{session.template_name}</h1>
      <p className="text-gray-500 mb-4">
        {session.programme_name} - {session.center_name} | {session.date}
      </p>

      {session.facilitators.length > 0 && (
        <div className="mb-4">
          <span className="text-sm text-gray-500">Facilitators: </span>
          {session.facilitators.map((f) => (
            <Badge key={f.id} variant="secondary" className="mr-1">
              {f.name}
            </Badge>
          ))}
        </div>
      )}

      {session.notes && (
        <p className="text-sm text-gray-600 mb-4">{session.notes}</p>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-lg">Attendance</CardTitle>
          <Can permission="session:create">
            <Button size="sm" onClick={openAttendance}>
              Mark Attendance
            </Button>
          </Can>
        </CardHeader>
        <CardContent>
          {showAttendance ? (
            <div className="space-y-2">
              {beneficiaries.map((b) => (
                <label
                  key={b.id}
                  className="flex items-center justify-between p-2 border rounded"
                >
                  <span className="text-sm">{b.name}</span>
                  <select
                    className="border rounded px-2 py-1 text-sm"
                    value={attendanceMap[b.id] || ""}
                    onChange={(e) =>
                      setAttendanceMap({
                        ...attendanceMap,
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
                  onClick={handleSaveAttendance}
                  disabled={markMutation.isPending}
                >
                  Save
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowAttendance(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : attendance.length === 0 ? (
            <p className="text-gray-500 text-sm">No attendance recorded</p>
          ) : (
            <div className="space-y-1">
              {attendance.map((a) => (
                <div
                  key={a.id}
                  className="flex justify-between items-center p-2 border rounded text-sm"
                >
                  <span>{a.beneficiary_name || a.beneficiary_id}</span>
                  <Badge
                    variant={a.status === "present" ? "default" : "secondary"}
                  >
                    {a.status}
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
