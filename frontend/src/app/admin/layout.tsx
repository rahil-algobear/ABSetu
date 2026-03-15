"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageLayout } from "@/components/ui/page-layout";
import { cn } from "@/utils/cn";
import {
  Building2,
  BookOpen,
  Link2,
  ClipboardList,
  UserCheck,
  Users,
  SlidersHorizontal,
} from "lucide-react";

const tabs = [
  { href: "/admin/centres", label: "Centres", icon: Building2, permission: "center:view" },
  { href: "/admin/programmes", label: "Programmes", icon: BookOpen, permission: "programme:view" },
  { href: "/admin/programme-centres", label: "Programme-Centres", icon: Link2, permission: "programme:view" },
  { href: "/admin/session-templates", label: "Session Templates", icon: ClipboardList, permission: "session_template:view" },
  { href: "/admin/facilitators", label: "Facilitators", icon: UserCheck, permission: "facilitator:view" },
  { href: "/admin/beneficiaries", label: "Beneficiaries", icon: Users, permission: "beneficiary:view" },
  { href: "/admin/meta-fields", label: "Custom Fields", icon: SlidersHorizontal, permission: "org:settings" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <PageLayout className="p-4">
      <h1 className="text-2xl font-bold mb-4">Settings</h1>

      {/* Scrollable tab bar */}
      <div className="flex overflow-x-auto gap-1 mb-6 border-b border-gray-200 pb-px -mx-4 px-4 no-scrollbar">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = pathname === tab.href;
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

      {children}
    </PageLayout>
  );
}
