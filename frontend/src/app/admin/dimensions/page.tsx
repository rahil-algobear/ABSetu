"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { dimensionApi } from "@/services/api";

export default function DimensionsIndexPage() {
  const router = useRouter();
  const { data: dimensions = [] } = useQuery({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
  });

  useEffect(() => {
    if (dimensions.length > 0) {
      router.replace(`/admin/dimensions/${dimensions[0].key}`);
    }
  }, [dimensions, router]);

  return (
    <p className="text-gray-500 text-sm">Loading dimensions...</p>
  );
}
