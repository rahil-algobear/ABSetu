"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/services/auth";
import { usePermissions, Can } from "@/components/Auth/Permissions";
import { useQuery } from "@tanstack/react-query";
import { organizationApi, dimensionApi, entityTypeApi } from "@/services/api";
import { useVocabulary } from "@/hooks/useVocabulary";
import { cn } from "@/utils/cn";
import {
  LayoutDashboard,
  CalendarDays,
  Layers,
  Users,
  ClipboardList,
  UserCheck,
  Shield,
  SlidersHorizontal,
  Link2,
  LogOut,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";

/* ── Collapsible Section ── */

function SidebarSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors"
      >
        {title}
        <ChevronDown
          size={12}
          className={cn("transition-transform", !open && "-rotate-90")}
        />
      </button>
      {open && <div className="space-y-0.5">{children}</div>}
    </div>
  );
}

/* ── Nav Item ── */

function NavItem({
  href,
  icon: Icon,
  label,
  pathname,
  onClick,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  pathname: string;
  onClick?: () => void;
}) {
  const active =
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors mx-2",
        active
          ? "text-purple-700 bg-purple-50"
          : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
      )}
    >
      <Icon size={16} />
      {label}
    </Link>
  );
}

/* ── Main Sidebar ── */

export default function Sidebar() {
  const { logout, isAuthenticated } = useAuth();
  const { userProfile, can } = usePermissions();
  const pathname = usePathname();
  const router = useRouter();
  const { vPlural, vDim } = useVocabulary();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: org } = useQuery({
    queryKey: ["organization"],
    queryFn: organizationApi.get,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  const { data: dimensions = [] } = useQuery({
    queryKey: ["dimensions"],
    queryFn: dimensionApi.list,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  const { data: entityTypes = [] } = useQuery({
    queryKey: ["entity-types"],
    queryFn: entityTypeApi.list,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  const closeMobileSidebar = () => setMobileOpen(false);

  if (!isAuthenticated) return null;

  const firstName = userProfile?.first_name || "";
  const lastName = userProfile?.last_name || "";
  const initials =
    [firstName?.[0], lastName?.[0]].filter(Boolean).join("").toUpperCase() ||
    "?";
  const fullName =
    [firstName, lastName].filter(Boolean).join(" ") || "User";

  const handleSignout = () => {
    const currentUrl = pathname + (window.location.search || "");
    logout();
    router.push(`/login?redirect=${encodeURIComponent(currentUrl)}`);
  };

  // Dynamic dimension tabs (non-system dimensions)
  const dimensionItems = dimensions
    .filter((d) => !d.is_system)
    .map((d) => ({
      href: `/admin/dimensions/${d.key}`,
      label: vDim(d),
      icon: Layers,
      permission: "dimension:view",
    }));

  // Dynamic entity type tabs
  const entityItems = entityTypes.map((et) => ({
    href: `/admin/entities/${et.key}`,
    label: et.name,
    icon: Users,
    permission: "entity:view",
  }));

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo + org name */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 min-w-0"
        >
          {org?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={org.logo_url}
              alt={org.name}
              className="h-8 w-8 rounded-lg object-contain shrink-0"
            />
          ) : (
            <Image
              src="/logo.png"
              alt="Logo"
              width={32}
              height={32}
              className="rounded-lg shrink-0"
              priority
            />
          )}
          <span className="text-sm font-bold text-gray-900 truncate">
            {org?.name || "ABSetu"}
          </span>
        </Link>
        {/* Desktop collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex items-center justify-center w-7 h-7 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
        >
          {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {/* Scrollable nav */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-4">
        {/* Main */}
        <div className="space-y-0.5">
          <NavItem
            href="/dashboard"
            icon={LayoutDashboard}
            label="Dashboard"
            pathname={pathname}
            onClick={closeMobileSidebar}
          />
          <Can permission="activity:view">
            <NavItem
              href="/activities"
              icon={CalendarDays}
              label={vPlural("activity")}
              pathname={pathname}
            />
          </Can>
        </div>

        {/* Dimensions */}
        {dimensionItems.length > 0 && can("dimension:view") && (
          <SidebarSection title="Dimensions">
            {dimensionItems.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                pathname={pathname}
                onClick={closeMobileSidebar}
              />
            ))}
          </SidebarSection>
        )}

        {/* Entities */}
        {entityItems.length > 0 && can("entity:view") && (
          <SidebarSection title="Entities">
            {entityItems.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                pathname={pathname}
                onClick={closeMobileSidebar}
              />
            ))}
          </SidebarSection>
        )}

        {/* Activities */}
        {can("activity_type:view") && (
          <SidebarSection title="Activities">
            <NavItem
              href="/admin/activity-categories"
              icon={ClipboardList}
              label={vPlural("activity_category")}
              pathname={pathname}
            />
            <NavItem
              href="/admin/activity-types"
              icon={ClipboardList}
              label={vPlural("activity_type")}
              pathname={pathname}
            />
          </SidebarSection>
        )}

        {/* Configuration — collapsed by default */}
        <SidebarSection title="Configuration" defaultOpen={false}>
          {can("dimension:manage") && (
            <NavItem
              href="/admin/manage-dimensions"
              icon={Layers}
              label="Dimensions"
              pathname={pathname}
            />
          )}
          {can("dimension:view") && (
            <NavItem
              href="/admin/dimension-linking"
              icon={Link2}
              label="Dimension Linking"
              pathname={pathname}
            />
          )}
          {can("entity_type:view") && (
            <NavItem
              href="/admin/entity-types"
              icon={UserCheck}
              label={vPlural("entity_type")}
              pathname={pathname}
            />
          )}
          {can("org:settings") && (
            <NavItem
              href="/admin/meta-fields"
              icon={SlidersHorizontal}
              label="Form Fields"
              pathname={pathname}
            />
          )}
        </SidebarSection>

        {/* Access — collapsed by default */}
        <SidebarSection title="Access" defaultOpen={false}>
          {can("role:view") && (
            <NavItem
              href="/admin/roles"
              icon={Shield}
              label="Roles"
              pathname={pathname}
            />
          )}
          {can("user:view") && (
            <NavItem
              href="/admin/users"
              icon={Users}
              label="Users"
              pathname={pathname}
            />
          )}
        </SidebarSection>
      </nav>

      {/* User section at bottom */}
      <div className="border-t border-gray-200 p-3 space-y-1">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 text-purple-700 text-sm font-semibold shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 truncate">
              {fullName}
            </p>
          </div>
        </div>
        <button
          onClick={handleSignout}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors w-full mx-2"
          style={{ width: "calc(100% - 16px)" }}
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile: hamburger button (fixed top-left) */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-3 left-3 z-50 flex items-center justify-center w-10 h-10 rounded-lg bg-white border border-gray-200 shadow-sm text-gray-600 hover:text-gray-900 transition-colors"
      >
        {mobileOpen ? (
          <PanelLeftClose size={18} />
        ) : (
          <PanelLeft size={18} />
        )}
      </button>

      {/* Mobile: overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/30"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:sticky top-0 left-0 z-40 h-screen bg-white border-r border-gray-200 transition-transform duration-200 flex flex-col",
          "w-64",
          // Mobile: slide in/out
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
