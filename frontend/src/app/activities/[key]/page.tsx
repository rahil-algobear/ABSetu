"use client";

import { Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { activityTypeApi } from "@/services/api";
import { Can } from "@/components/Auth/Permissions";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PageLayout } from "@/components/ui/page-layout";
import { PageContent } from "@/components/ui/page-content";
import { ActivityList } from "@/components/ActivityList";
import { Plus } from "lucide-react";

/** Simple English pluralizer for display names */
function pluralize(word: string): string {
  if (word.endsWith("y") && !/[aeiou]y$/i.test(word)) {
    return word.slice(0, -1) + "ies";
  }
  if (word.endsWith("s") || word.endsWith("x") || word.endsWith("z") || word.endsWith("sh") || word.endsWith("ch")) {
    return word + "es";
  }
  return word + "s";
}

function ActivityTypeListContent() {
  const { key: typeKey } = useParams<{ key: string }>();
  const router = useRouter();

  const { data: activityTypes = [] } = useQuery({
    queryKey: ["activity-types"],
    queryFn: activityTypeApi.list,
  });

  const activityType = activityTypes.find((c) => c.key === typeKey);
  const selectedTypeId = activityType?.id || "";
  const typeName = activityType?.name || "Activity";

  return (
    <PageLayout>
      <PageHeader
        title={pluralize(typeName)}
        actions={
          <Can permission="activity:create">
            <Button size="sm" onClick={() => router.push(`/activities/${typeKey}/new`)}>
              <Plus className="h-4 w-4 mr-1" />
              New {typeName}
            </Button>
          </Can>
        }
      />

      <PageContent>
        <ActivityList
          activityTypeKey={typeKey}
          activityTypeId={selectedTypeId}
          activityTypeName={typeName}
        />
      </PageContent>
    </PageLayout>
  );
}

export default function ActivityTypeListPage() {
  return (
    <Suspense fallback={<PageLayout><PageContent><p className="text-gray-500">Loading...</p></PageContent></PageLayout>}>
      <ActivityTypeListContent />
    </Suspense>
  );
}
