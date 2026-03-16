"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { entityApi, enrollmentApi, metaFieldSchemaApi } from "@/services/api";
import { MetaFieldDefinition } from "@/types";
import { useVocabulary } from "@/hooks/useVocabulary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLayout } from "@/components/ui/page-layout";
import { Badge } from "@/components/ui/badge";
import { MetaFieldDisplay } from "@/components/DynamicMetaForm";

export default function EntityDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { v, vPlural } = useVocabulary();

  const { data: entity, isLoading } = useQuery({
    queryKey: ["entity", id],
    queryFn: () => entityApi.get(id),
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ["enrollments-entity", id],
    queryFn: () => enrollmentApi.listByEntity(id),
    enabled: !!entity,
  });

  const { data: metaFields = [] } = useQuery<MetaFieldDefinition[]>({
    queryKey: ["meta-field-schemas", "entity"],
    queryFn: () => metaFieldSchemaApi.get("entity"),
  });

  if (isLoading) return <PageLayout className="p-4"><p>Loading...</p></PageLayout>;
  if (!entity) return <PageLayout className="p-4"><p>Not found</p></PageLayout>;

  return (
    <PageLayout className="p-4">
      <h1 className="text-2xl font-bold mb-1">{entity.name}</h1>
      <div className="flex gap-1 items-center mb-2">
        {entity.case_number && (
          <span className="text-gray-500">{entity.case_number}</span>
        )}
        {entity.entity_type_name && (
          <Badge variant="secondary">{entity.entity_type_name}</Badge>
        )}
      </div>

      {entity.tags?.length > 0 && (
        <div className="flex gap-1 mb-4">
          {entity.tags.map((tag) => (
            <Badge key={tag.value_id} variant="secondary">
              {tag.dimension_name}: {tag.value_name}
            </Badge>
          ))}
        </div>
      )}

      {entity.meta && Object.keys(entity.meta).length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <MetaFieldDisplay
              fields={metaFields}
              values={entity.meta}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{vPlural("enrollment")}</CardTitle>
        </CardHeader>
        <CardContent>
          {enrollments.length === 0 ? (
            <p className="text-gray-500 text-sm">No {vPlural("enrollment").toLowerCase()}</p>
          ) : (
            <div className="space-y-2">
              {enrollments.map((e) => (
                <div
                  key={e.id}
                  className="flex justify-between items-center p-2 border rounded"
                >
                  <div>
                    <div className="flex gap-1 mb-0.5">
                      {e.tags?.map((tag) => (
                        <Badge key={tag.value_id} variant="secondary" className="text-xs">
                          {tag.value_name}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500">
                      {e.admission_date}
                      {e.release_date ? ` to ${e.release_date}` : ""}
                    </p>
                  </div>
                  <Badge variant={e.release_date ? "secondary" : "default"}>
                    {e.release_date ? "Released" : "Active"}
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
