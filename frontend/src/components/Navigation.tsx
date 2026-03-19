"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "../services/auth";
import { usePermissions, Can } from "./Auth/Permissions";
import { useQuery } from "@tanstack/react-query";
import { organizationApi, dimensionApi, entityTypeApi, activityTypeApi } from "@/services/api";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { clsx } from "clsx";
import { useVocabulary } from "@/hooks/useVocabulary";
import {
  LayoutDashboard,
  CalendarDays,
  Settings,
  Users,
  ChevronDown,
  LogOut,
  Menu,
  X,
  UserCog,
  Shield,
  Database,
  Layers,
  Link2,
  SlidersHorizontal,
  ClipboardList,
  LayoutTemplate,
} from "lucide-react";

/* ── NavDropdown ── */

function NavDropdown({
  label,
  icon: Icon,
  items,
  pathname,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  items: { href: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; permission: string }[];
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { can } = usePermissions();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const visibleItems = items.filter((i) => can(i.permission));
  if (visibleItems.length === 0) return null;

  const isActive = visibleItems.some((i) => pathname.startsWith(i.href));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={clsx(
          "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
          isActive
            ? "text-purple-700 bg-purple-50"
            : "text-gray-500 hover:text-gray-900 hover:bg-gray-100",
        )}
      >
        <Icon size={15} />
        {label}
        <ChevronDown
          size={14}
          className={clsx("transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-48 rounded-xl border border-gray-200 bg-white shadow-lg py-1 z-50">
          {visibleItems.map((item) => {
            const ItemIcon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={clsx(
                  "flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors",
                  active
                    ? "text-purple-700 bg-purple-50"
                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-50",
                )}
              >
                <ItemIcon size={15} />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── UserDropdown ── */

function UserDropdown({
  firstName,
  lastName,
  pathname,
  onSignout,
}: {
  firstName: string;
  lastName: string;
  pathname: string;
  onSignout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const initials = [firstName?.[0], lastName?.[0]]
    .filter(Boolean)
    .join("")
    .toUpperCase() || "?";

  const fullName = [firstName, lastName].filter(Boolean).join(" ") || "User";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={clsx(
          "flex items-center gap-2 rounded-lg py-1.5 px-2 transition-colors",
          open ? "bg-gray-100" : "hover:bg-gray-50",
        )}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 text-purple-700 text-sm font-semibold">
          {initials}
        </div>
        <ChevronDown
          size={12}
          className={clsx("text-gray-400 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 w-52 rounded-xl border border-gray-200 bg-white shadow-lg py-1 z-50">
          <div className="px-4 py-2.5 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-900 truncate">{fullName}</p>
          </div>

          <div className="border-t border-gray-100 mt-0 pt-1">
            <button
              onClick={() => {
                setOpen(false);
                onSignout();
              }}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors w-full"
            >
              <LogOut size={15} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── MobileSection (collapsible) ── */

type NavItem = { href: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; permission: string };

function MobileSection({
  label,
  icon: Icon,
  items,
  defaultOpen,
  pathname,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  items: NavItem[];
  defaultOpen: boolean;
  pathname: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { can } = usePermissions();

  const visibleItems = items.filter((i) => can(i.permission));
  if (visibleItems.length === 0) return null;

  return (
    <div className="pt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-1.5 group"
      >
        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          <Icon size={12} />
          {label}
        </span>
        <ChevronDown
          size={12}
          className={clsx(
            "text-gray-400 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="mt-1 space-y-0.5">
          {visibleItems.map((item) => {
            const ItemIcon = item.icon;
            const active = pathname.startsWith(item.href.split("?")[0]);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "text-purple-700 bg-purple-50"
                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-100",
                )}
              >
                <ItemIcon size={16} />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Main Navigation ── */

export default function Navigation() {
  const { logout, isAuthenticated } = useAuth();
  const { userProfile } = usePermissions();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { can } = usePermissions();
  const { vPlural, vDim } = useVocabulary();

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

  const { data: activityTypes = [] } = useQuery({
    queryKey: ["activity-types"],
    queryFn: activityTypeApi.list,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  // Activity types as top-level nav links
  const activityTypeLinks = activityTypes.map((cat) => ({
    href: `/activities?category=${cat.key}`,
    label: cat.name,
    icon: CalendarDays,
    permission: "activity:view",
  }));

  // People dropdown: one item per entity type
  const peopleItems = entityTypes.map((et) => ({
    href: `/admin/entities/${et.key}`,
    label: et.name,
    icon: Users,
    permission: "entity:view",
  }));

  // Settings dropdown: Users, dynamic dimensions
  const settingsItems = [
    { href: "/admin/users", label: "Users", icon: Users, permission: "user:view" },
    ...dimensions.map((d) => ({
      href: `/admin/dimensions/${d.key}`,
      label: vDim(d),
      icon: Layers,
      permission: "dimension:view",
    })),
  ];

  // Admin dropdown (formerly Settings)
  const adminItems = [
    { href: "/admin/meta-fields", label: "Form Fields", icon: SlidersHorizontal, permission: "org:settings" },
    { href: "/admin/roles", label: "Roles", icon: Shield, permission: "role:view" },
    { href: "/admin/manage-dimensions", label: "Dimensions", icon: Layers, permission: "dimension:manage" },
    { href: "/admin/dimension-linking", label: "Dimension Linking", icon: Link2, permission: "dimension:view" },
    { href: "/admin/entity-types", label: vPlural("entity_type"), icon: UserCog, permission: "entity_type:view" },
    { href: "/admin/activity-types", label: vPlural("activity_type"), icon: ClipboardList, permission: "activity_type:view" },
    { href: "/admin/form-builder", label: "Form Builder", icon: LayoutTemplate, permission: "activity_type:manage" },
  ];

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleSignout = () => {
    const currentUrl = pathname + (window.location.search || "");
    logout();
    router.push(`/login?redirect=${encodeURIComponent(currentUrl)}`);
  };

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isAuthenticated) {
      router.push("/dashboard");
    } else {
      window.location.href = "/";
    }
  };

  const firstName = userProfile?.first_name || "";
  const lastName = userProfile?.last_name || "";

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto px-4 sm:px-6">
        <div className="relative flex items-center justify-between h-16">
          {/* Mobile: hamburger on left */}
          {isAuthenticated && (
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          )}

          {/* Mobile: centered logo + org name */}
          <Link
            href={isAuthenticated ? "/dashboard" : "/"}
            className="absolute left-1/2 -translate-x-1/2 md:hidden flex items-center gap-2 shrink-0"
            onClick={handleLogoClick}
          >
            {org?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={org.logo_url}
                alt={org.name}
                className="h-9 w-9 rounded-lg object-contain transition-transform hover:scale-105"
              />
            ) : (
              <Image
                src="/logo.png"
                alt="Logo"
                width={36}
                height={36}
                className="rounded-lg transition-transform hover:scale-105"
                priority={true}
              />
            )}
            <span className="text-sm font-bold text-gray-900">
              {org?.name || "ABSetu"}
            </span>
          </Link>

          {/* Desktop: Logo + Nav Links */}
          <div className="hidden md:flex items-center gap-2">
            <Link
              href={isAuthenticated ? "/dashboard" : "/"}
              className="flex items-center gap-2 mr-4 shrink-0"
              onClick={handleLogoClick}
            >
              {org?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={org.logo_url}
                  alt={org.name}
                  className="h-9 w-9 rounded-lg object-contain transition-transform hover:scale-105"
                />
              ) : (
                <Image
                  src="/logo.png"
                  alt="Logo"
                  width={36}
                  height={36}
                  className="rounded-lg transition-transform hover:scale-105"
                  priority={true}
                />
              )}
              <span className="text-sm font-bold text-gray-900">
                {org?.name || "ABSetu"}
              </span>
            </Link>

            {isAuthenticated && (
              <nav className="flex items-center gap-0.5">
                <Link
                  href="/dashboard"
                  className={clsx(
                    "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    pathname === "/dashboard"
                      ? "text-purple-700 bg-purple-50"
                      : "text-gray-500 hover:text-gray-900 hover:bg-gray-100",
                  )}
                >
                  <LayoutDashboard size={15} />
                  Dashboard
                </Link>

                {/* Activity categories as top-level links */}
                {activityTypeLinks.map((item) => (
                  <Can key={item.href} permission={item.permission}>
                    <Link
                      href={item.href}
                      className={clsx(
                        "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                        pathname.startsWith(item.href.split("?")[0])
                          ? "text-purple-700 bg-purple-50"
                          : "text-gray-500 hover:text-gray-900 hover:bg-gray-100",
                      )}
                    >
                      <CalendarDays size={15} />
                      {item.label}
                    </Link>
                  </Can>
                ))}

                <NavDropdown
                  label="People"
                  icon={Users}
                  items={peopleItems}
                  pathname={pathname}
                />

                <NavDropdown
                  label="Settings"
                  icon={Settings}
                  items={settingsItems}
                  pathname={pathname}
                />

                <NavDropdown
                  label="Admin"
                  icon={Database}
                  items={adminItems}
                  pathname={pathname}
                />
              </nav>
            )}
          </div>

          {/* Desktop: User dropdown */}
          <div className="hidden md:flex items-center gap-2">
            {isAuthenticated && (
              <UserDropdown
                firstName={firstName}
                lastName={lastName}
                pathname={pathname}
                onSignout={handleSignout}
              />
            )}
          </div>

          {/* Mobile: spacer to balance hamburger */}
          <div className="w-9 md:hidden" />
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && isAuthenticated && (
        <div className="md:hidden border-t border-gray-200 bg-white">
          <nav className="px-4 py-3 space-y-1">
            {/* User info */}
            <div className="flex items-center gap-2.5 px-3 py-2.5 mb-2 rounded-lg bg-gray-50">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 text-purple-700 text-sm font-semibold shrink-0">
                {[firstName?.[0], lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?"}
              </div>
              <p className="text-sm font-medium text-gray-900 truncate">
                {[firstName, lastName].filter(Boolean).join(" ") || "User"}
              </p>
            </div>

            {/* Dashboard */}
            <Link
              href="/dashboard"
              className={clsx(
                "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                pathname === "/dashboard"
                  ? "text-purple-700 bg-purple-50"
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-100",
              )}
            >
              <LayoutDashboard size={16} />
              Dashboard
            </Link>

            {/* Activity categories as top-level links */}
            {activityTypeLinks.map((item) => {
              if (!can(item.permission)) return null;
              const active = pathname.startsWith(item.href.split("?")[0]);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    active
                      ? "text-purple-700 bg-purple-50"
                      : "text-gray-500 hover:text-gray-900 hover:bg-gray-100",
                  )}
                >
                  <CalendarDays size={16} />
                  {item.label}
                </Link>
              );
            })}

            {/* People — expanded by default */}
            <MobileSection
              label="People"
              icon={Users}
              items={peopleItems}
              defaultOpen={true}
              pathname={pathname}
            />

            {/* Settings — collapsed by default */}
            <MobileSection
              label="Settings"
              icon={Settings}
              items={settingsItems}
              defaultOpen={false}
              pathname={pathname}
            />

            {/* Admin — collapsed by default */}
            <MobileSection
              label="Admin"
              icon={Database}
              items={adminItems}
              defaultOpen={false}
              pathname={pathname}
            />

            {/* Sign out */}
            <div className="pt-2 mt-1 border-t border-gray-200">
              <button
                onClick={handleSignout}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors w-full"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
