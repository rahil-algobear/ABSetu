"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { beneficiaryApi, enrollmentApi, metaFieldSchemaApi } from "@/services/api";
import { MetaFieldDefinition } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLayout } from "@/components/ui/page-layout";
import { Badge } from "@/components/ui/badge";
import { MetaFieldDisplay } from "@/components/DynamicMetaForm";

export default function BeneficiaryDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const { data: beneficiary, isLoading } = useQuery({
    queryKey: ["beneficiary", id],
    queryFn: () => beneficiaryApi.get(id),
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ["enrollments", id],
    queryFn: () => enrollmentApi.listByBeneficiary(id),
  });

  const { data: metaFields = [] } = useQuery<MetaFieldDefinition[]>({
    queryKey: ["meta-field-schemas", "beneficiary"],
    queryFn: () => metaFieldSchemaApi.get("beneficiary"),
  });

  if (isLoading) return <PageLayout className="p-4"><p>Loading...</p></PageLayout>;
  if (!beneficiary) return <PageLayout className="p-4"><p>Not found</p></PageLayout>;

  return (
    <PageLayout className="p-4">
      <h1 className="text-2xl font-bold mb-1">{beneficiary.name}</h1>
      <p className="text-gray-500 mb-4">{beneficiary.case_number}</p>

      {beneficiary.meta && Object.keys(beneficiary.meta).length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <MetaFieldDisplay
              fields={metaFields}
              values={beneficiary.meta}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Enrollments</CardTitle>
        </CardHeader>
        <CardContent>
          {enrollments.length === 0 ? (
            <p className="text-gray-500 text-sm">No enrollments</p>
          ) : (
            <div className="space-y-2">
              {enrollments.map((e) => (
                <div
                  key={e.id}
                  className="flex justify-between items-center p-2 border rounded"
                >
                  <div>
                    <p className="font-medium text-sm">
                      {e.programme_name} - {e.center_name}
                    </p>
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
