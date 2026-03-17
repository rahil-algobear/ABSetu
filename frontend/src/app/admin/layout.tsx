"use client";

import { usePathname } from "next/navigation";
import { PageLayout } from "@/components/ui/page-layout";
import { usePermissions } from "@/components/Auth/Permissions";
import { dimensionApi, entityTypeApi } from "@/services/api";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { can, loading } = usePermissions();

  const { data: dimensions = [] } = useQuery({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
    staleTime: 5 * 60 * 1000,
  });

  const { data: entityTypes = [] } = useQuery({
    queryKey: ["entity-types"],
    queryFn: entityTypeApi.list,
    staleTime: 5 * 60 * 1000,
  });

  // Permission mapping for routes
  const allTabs = [
    ...dimensions
      .filter((d) => !d.is_system)
      .map((d) => ({
        href: `/admin/dimensions/${d.key}`,
        permission: "dimension:view",
      })),
    ...entityTypes.map((et) => ({
      href: `/admin/entities/${et.key}`,
      permission: "entity:view",
    })),
    { href: "/admin/manage-dimensions", permission: "dimension:manage" },
    { href: "/admin/dimension-linking", permission: "dimension:view" },
    { href: "/admin/entity-types", permission: "entity_type:view" },
    { href: "/admin/activity-categories", permission: "activity_type:view" },
    { href: "/admin/activity-types", permission: "activity_type:view" },
    { href: "/admin/roles", permission: "role:view" },
    { href: "/admin/users", permission: "user:view" },
    { href: "/admin/meta-fields", permission: "org:settings" },
  ];

  const currentTab = allTabs.find(
    (tab) => pathname === tab.href || pathname.startsWith(tab.href + "/")
  );
  const hasAccess = !currentTab || can(currentTab.permission);

  return (
    <PageLayout className="p-4">
      {!loading && !hasAccess ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <ShieldAlert className="h-12 w-12 mb-3" />
          <p className="text-lg font-medium text-gray-600">Access Denied</p>
          <p className="text-sm mt-1">
            You don&apos;t have permission to view this page.
          </p>
        </div>
      ) : (
        children
      )}
    </PageLayout>
  );
}
