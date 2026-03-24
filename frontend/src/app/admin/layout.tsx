"use client";

import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/ui/page-layout";
import { usePermissions } from "@/components/Auth/Permissions";
import { dimensionApi, entityTypeApi } from "@/services/api";
import {
  Layers,
  ClipboardList,
  Columns,
  UserCheck,
  Users,
  Shield,
  SlidersHorizontal,
  Link2,
  ShieldAlert,
} from "lucide-react";

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

  // Build tabs for permission checking
  const dimensionTabs = dimensions.map((d) => ({
    href: `/admin/dimensions/${d.key}`,
    label: d.name,
    icon: Layers,
    permission: "dimension:view",
  }));

  const entityTypeTabs = entityTypes.map((et) => ({
    href: `/admin/entities/${et.key}`,
    label: et.name,
    icon: Users,
    permission: "entity:view",
  }));

  const mastersTabs = [
    ...dimensionTabs,
    ...entityTypeTabs,
    { href: "/admin/users", label: "Users", icon: Users, permission: "user:view" },
  ];

  const adminTabs = [
    { href: "/admin/meta-fields", label: "Form Fields", icon: SlidersHorizontal, permission: "org:settings" },
    { href: "/admin/roles", label: "Roles", icon: Shield, permission: "role:view" },
    { href: "/admin/manage-dimensions", label: "Dimensions", icon: Layers, permission: "dimension:manage" },
    { href: "/admin/dimension-linking", label: "Dimension Linking", icon: Link2, permission: "dimension:manage" },
    { href: "/admin/entity-types", label: "Entity Types", icon: UserCheck, permission: "entity_type:manage" },
    { href: "/admin/activity-types", label: "Activity Types", icon: ClipboardList, permission: "activity_type:manage" },
{ href: "/admin/list-settings", label: "List Settings", icon: Columns, permission: "org:settings" },
  ];

  const allTabs = [...mastersTabs, ...adminTabs];

  // Check if user has permission for the current page
  const currentTab = allTabs.find((tab) => pathname === tab.href || pathname.startsWith(tab.href + "/"));
  const hasAccess = !currentTab || can(currentTab.permission);

  return (
    <PageLayout>
      {!loading && !hasAccess ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 sm:px-6 text-gray-400">
          <ShieldAlert className="h-12 w-12 mb-3" />
          <p className="text-lg font-medium text-gray-600">Access Denied</p>
          <p className="text-sm mt-1">You don&apos;t have permission to view this page.</p>
        </div>
      ) : (
        children
      )}
    </PageLayout>
  );
}
