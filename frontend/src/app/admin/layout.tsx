"use client";

import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/ui/page-layout";
import { usePermissions } from "@/components/Auth/Permissions";
import { dimensionApi, entityTypeApi } from "@/services/api";
import { useVocabulary } from "@/hooks/useVocabulary";
import {
  Layers,
  ClipboardList,
  UserCheck,
  Users,
  Shield,
  SlidersHorizontal,
  Link2,
  ShieldAlert,
  LayoutTemplate,
} from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { can, loading } = usePermissions();
  const { vPlural, vDim } = useVocabulary();

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
    label: vDim(d),
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
    { href: "/admin/dimension-linking", label: "Dimension Linking", icon: Link2, permission: "dimension:view" },
    { href: "/admin/entity-types", label: vPlural("entity_type"), icon: UserCheck, permission: "entity_type:view" },
    { href: "/admin/activity-categories", label: vPlural("activity_category"), icon: ClipboardList, permission: "activity_category:view" },
    { href: "/admin/form-builder", label: "Form Builder", icon: LayoutTemplate, permission: "activity_category:manage" },
  ];

  const allTabs = [...mastersTabs, ...adminTabs];

  // Check if user has permission for the current page
  const currentTab = allTabs.find((tab) => pathname === tab.href || pathname.startsWith(tab.href + "/"));
  const hasAccess = !currentTab || can(currentTab.permission);

  return (
    <PageLayout className="p-4">
      {!loading && !hasAccess ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
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
