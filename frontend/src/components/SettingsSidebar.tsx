"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { dimensionApi, entityTypeApi } from "@/services/api";
import { usePermissions } from "@/components/Auth/Permissions";
import { useVocabulary } from "@/hooks/useVocabulary";
import { cn } from "@/utils/cn";
import {
  Layers,
  ClipboardList,
  UserCheck,
  Users,
  Shield,
  SlidersHorizontal,
  Link2,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
  X,
} from "lucide-react";

interface SidebarItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  permission: string;
}

interface SidebarSection {
  title: string;
  items: SidebarItem[];
}

export function SettingsSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { can } = usePermissions();
  const { vPlural, vDim } = useVocabulary();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // These queries are only needed for building sidebar links
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

  // Build dynamic sections
  const dimensionItems: SidebarItem[] = dimensions
    .filter((d) => !d.is_system)
    .map((d) => ({
      href: `/admin/dimensions/${d.key}`,
      label: vDim(d),
      icon: Layers,
      permission: "dimension:view",
    }));

  const entityItems: SidebarItem[] = entityTypes.map((et) => ({
    href: `/admin/entities/${et.key}`,
    label: et.name,
    icon: Users,
    permission: "entity:view",
  }));

  const sections: SidebarSection[] = [
    {
      title: "Dimensions",
      items: dimensionItems,
    },
    {
      title: "Entities",
      items: entityItems,
    },
    {
      title: "Activities",
      items: [
        { href: "/admin/activity-types", label: vPlural("activity_type"), icon: ClipboardList, permission: "activity_type:view" },
      ],
    },
    {
      title: "Configuration",
      items: [
        { href: "/admin/manage-dimensions", label: "Dimensions", icon: Layers, permission: "dimension:manage" },
        { href: "/admin/dimension-linking", label: "Dimension Linking", icon: Link2, permission: "dimension:view" },
        { href: "/admin/entity-types", label: vPlural("entity_type"), icon: UserCheck, permission: "entity_type:view" },
        { href: "/admin/activity-categories", label: vPlural("activity_category"), icon: ClipboardList, permission: "activity_type:view" },
        { href: "/admin/meta-fields", label: "Form Fields", icon: SlidersHorizontal, permission: "org:settings" },
      ],
    },
    {
      title: "Access",
      items: [
        { href: "/admin/roles", label: "Roles", icon: Shield, permission: "role:view" },
        { href: "/admin/users", label: "Users", icon: Users, permission: "user:view" },
      ],
    },
  ];

  // Filter sections to only show items the user has permission for
  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => can(item.permission)),
    }))
    .filter((section) => section.items.length > 0);

  const toggleSection = (title: string) => {
    setCollapsed((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  // Close sidebar on mobile when navigating
  useEffect(() => {
    // Only auto-close on mobile
    if (window.innerWidth < 1024) {
      onClose();
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const sidebarContent = (
    <nav className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-900">Settings</h2>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <X size={16} className="lg:hidden" />
          <PanelLeftClose size={16} className="hidden lg:block" />
        </button>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto py-2">
        {visibleSections.map((section) => (
          <div key={section.title} className="mb-1">
            <button
              onClick={() => toggleSection(section.title)}
              className="flex items-center justify-between w-full px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors"
            >
              {section.title}
              <ChevronDown
                size={12}
                className={cn(
                  "transition-transform",
                  collapsed[section.title] && "-rotate-90"
                )}
              />
            </button>

            {!collapsed[section.title] && (
              <div className="space-y-0.5 px-2">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                        active
                          ? "text-purple-700 bg-purple-50 font-medium"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                      )}
                    >
                      <Icon size={14} className="shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </nav>
  );

  return (
    <>
      {/* Mobile: overlay backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          // Mobile: slide-in drawer
          "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 shadow-lg transition-transform duration-200 ease-in-out lg:shadow-none",
          // Desktop: static positioned
          "lg:relative lg:z-0 lg:transition-none",
          // Visibility
          open
            ? "translate-x-0"
            : "-translate-x-full lg:-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}

/** Toggle button shown when sidebar is closed */
export function SidebarToggle({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
      title="Open settings menu"
    >
      <PanelLeft size={18} />
    </button>
  );
}
