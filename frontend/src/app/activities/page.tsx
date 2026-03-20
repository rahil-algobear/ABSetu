"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  activityApi,
  activityTypeApi,
} from "@/services/api";
import { Can } from "@/components/Auth/Permissions";

import { Button } from "@/components/ui/button";

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/page-table";
import { PageLayout } from "@/components/ui/page-layout";
import { PageHeader } from "@/components/ui/page-header";
import { Plus } from "lucide-react";
import { formatDate } from "@/utils/date";

function ActivitiesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeKey = searchParams.get("type");

  const { data: activityTypes = [] } = useQuery({
    queryKey: ["activity-types"],
    queryFn: activityTypeApi.list,
  });

  // Determine activity type from URL param
  const activityType = activityTypes.find((c) => c.key === typeKey);
  const selectedTypeId = activityType?.id || "";
  const typeName = activityType?.name || "Activity";

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ["activities", selectedTypeId],
    queryFn: () => activityApi.list(selectedTypeId || undefined),
  });

  const getActivityTitle = (a: typeof activities[0]) => {
    if (a.title) return a.title;
    if (a.dimensions.length > 0) return a.dimensions[0].value_name;
    return typeName;
  };

  // Derive unique dimension columns from all loaded activities
  const dimensionColumns = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of activities) {
      for (const dim of a.dimensions) {
        if (!seen.has(dim.dimension_key)) {
          seen.set(dim.dimension_key, dim.dimension_name);
        }
      }
    }
    return Array.from(seen.entries()).map(([key, name]) => ({ key, name }));
  }, [activities]);

  return (
    <PageLayout className="p-4">
      <PageHeader
        title={`${typeName}s`}
        actions={
          <Can permission="activity:create">
            <Button size="sm" onClick={() => router.push(`/activities/new?type=${typeKey}`)}>
              <Plus className="h-4 w-4 mr-1" />
              New {typeName}
            </Button>
          </Can>
        }
      />

      {isLoading ? (
        <p className="text-gray-500">Loading...</p>
      ) : activities.length === 0 ? (
        <p className="text-gray-500">No {typeName.toLowerCase()}s yet.</p>
      ) : (
        <div className="bg-white shadow-sm border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Start Date</TableHead>
              <TableHead className="w-28">End Date</TableHead>
              <TableHead>Title</TableHead>
              {dimensionColumns.map((dc) => (
                <TableHead key={dc.key}>{dc.name}</TableHead>
              ))}
              {!activityType && <TableHead>Type</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {activities.map((a) => (
              <TableRow
                key={a.id}
                onClick={() => router.push(`/activities/${a.id}`)}
              >
                <TableCell>{formatDate(a.start_date)}</TableCell>
                <TableCell>{formatDate(a.end_date)}</TableCell>
                <TableCell className="font-medium">
                  {getActivityTitle(a)}
                </TableCell>
                {dimensionColumns.map((dc) => {
                  const dim = a.dimensions.find((d) => d.dimension_key === dc.key);
                  return (
                    <TableCell key={dc.key}>
                      {dim ? dim.value_name : "—"}
                    </TableCell>
                  );
                })}
                {!activityType && (
                  <TableCell className="text-gray-500">
                    {a.activity_type_name}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      )}
    </PageLayout>
  );
}

export default function ActivitiesPage() {
  return (
    <Suspense fallback={<PageLayout className="p-4"><p className="text-gray-500">Loading...</p></PageLayout>}>
      <ActivitiesPageContent />
    </Suspense>
  );
}
