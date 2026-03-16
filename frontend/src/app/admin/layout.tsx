"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/ui/page-layout";
import { usePermissions } from "@/components/Auth/Permissions";
import { dimensionApi } from "@/services/api";
import { cn } from "@/utils/cn";
import { useVocabulary } from "@/hooks/useVocabulary";
import {
  Layers,
  ClipboardList,
  UserCheck,
  Users,
  Shield,
  SlidersHorizontal,
  ShieldAlert,
} from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { can, loading } = usePermissions();
  const { vPlural } = useVocabulary();

  const { data: dimensions = [] } = useQuery({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
    staleTime: 5 * 60 * 1000,
  });

  // Build tabs: one per non-system dimension + static tabs
  const dimensionTabs = dimensions
    .filter((d) => !d.is_system)
    .map((d) => ({
      href: `/admin/dimensions/${d.key}`,
      label: d.name,
      icon: Layers,
      permission: "dimension:view",
    }));

  const staticTabs = [
    { href: "/admin/activity-types", label: vPlural("activity_type"), icon: ClipboardList, permission: "activity_type:view" },
    { href: "/admin/facilitators", label: vPlural("facilitator"), icon: UserCheck, permission: "facilitator:view" },
    { href: "/admin/beneficiaries", label: vPlural("beneficiary"), icon: Users, permission: "beneficiary:view" },
    { href: "/admin/roles", label: "Roles", icon: Shield, permission: "role:view" },
    { href: "/admin/users", label: "Users", icon: Users, permission: "user:view" },
    { href: "/admin/meta-fields", label: "Custom Fields", icon: SlidersHorizontal, permission: "org:settings" },
  ];

  const allTabs = [...dimensionTabs, ...staticTabs];
  const visibleTabs = allTabs.filter((tab) => can(tab.permission));

  // Check if user has permission for the current page
  const currentTab = allTabs.find((tab) => pathname === tab.href || pathname.startsWith(tab.href + "/"));
  const hasAccess = !currentTab || can(currentTab.permission);

  return (
    <PageLayout className="p-4">
      <h1 className="text-2xl font-bold mb-4">Settings</h1>

      {/* Scrollable tab bar — only show tabs the user has permission for */}
      <div className="flex overflow-x-auto gap-1 mb-6 border-b border-gray-200 pb-px -mx-4 px-4 no-scrollbar">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors shrink-0",
                active
                  ? "border-purple-600 text-purple-700"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              )}
            >
              <Icon size={14} />
              {tab.label}
            </Link>
          );
        })}
      </div>

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
