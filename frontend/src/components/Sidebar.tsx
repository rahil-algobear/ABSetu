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
  Menu,
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
      href: `/admin/dimensions/${d.id}`,
      label: vDim(d),
      icon: Layers,
      permission: "dimension:view",
    }));

  // Dynamic entity type tabs
  const entityItems = entityTypes.map((et) => ({
    href: `/admin/entities/${et.id}`,
    label: et.name,
    icon: Users,
    permission: "entity:view",
  }));

  const logo = org?.logo_url ? (
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
  );

  return (
    <>
      {/* ── Fixed Header ── */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3">
        {/* Sidebar toggle — hamburger on mobile, panel toggle on desktop */}
        <button
          onClick={() => {
            // On mobile, toggle mobile sidebar. On desktop, toggle collapse.
            if (window.innerWidth < 1024) {
              setMobileOpen(!mobileOpen);
            } else {
              setCollapsed(!collapsed);
            }
          }}
          className="flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors shrink-0"
        >
          {mobileOpen ? (
            <PanelLeftClose size={20} />
          ) : collapsed ? (
            <PanelLeft size={20} />
          ) : (
            <Menu size={20} />
          )}
        </button>

        {/* Logo + org name */}
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 min-w-0"
        >
          {logo}
          <span className="text-sm font-bold text-gray-900 truncate hidden sm:inline">
            {org?.name || "ABSetu"}
          </span>
        </Link>
      </header>

      {/* ── Mobile: overlay ── */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/30"
          style={{ top: "3.5rem" }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={cn(
          "fixed top-14 left-0 z-40 bg-white border-r border-gray-200 transition-all duration-200 flex flex-col",
          "h-[calc(100vh-3.5rem)]",
          // Desktop: show/hide based on collapsed
          collapsed
            ? "w-0 lg:w-0 overflow-hidden"
            : "w-64",
          // Mobile: slide in/out
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex flex-col h-full min-w-[16rem]">
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
                  onClick={closeMobileSidebar}
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
                  onClick={closeMobileSidebar}
                />
                <NavItem
                  href="/admin/activity-types"
                  icon={ClipboardList}
                  label={vPlural("activity_type")}
                  pathname={pathname}
                  onClick={closeMobileSidebar}
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
                  onClick={closeMobileSidebar}
                />
              )}
              {can("dimension:view") && (
                <NavItem
                  href="/admin/dimension-linking"
                  icon={Link2}
                  label="Dimension Linking"
                  pathname={pathname}
                  onClick={closeMobileSidebar}
                />
              )}
              {can("entity_type:view") && (
                <NavItem
                  href="/admin/entity-types"
                  icon={UserCheck}
                  label={vPlural("entity_type")}
                  pathname={pathname}
                  onClick={closeMobileSidebar}
                />
              )}
              {can("org:settings") && (
                <NavItem
                  href="/admin/meta-fields"
                  icon={SlidersHorizontal}
                  label="Form Fields"
                  pathname={pathname}
                  onClick={closeMobileSidebar}
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
                  onClick={closeMobileSidebar}
                />
              )}
              {can("user:view") && (
                <NavItem
                  href="/admin/users"
                  icon={Users}
                  label="Users"
                  pathname={pathname}
                  onClick={closeMobileSidebar}
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
      </aside>
    </>
  );
}
