"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "../services/auth";
import { usePermissions, Can } from "./Auth/Permissions";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  CalendarDays,
  Settings,
  Users,
  Building2,
  ChevronDown,
  LogOut,
  Menu,
  X,
  UserCog,
} from "lucide-react";

/* ── Settings dropdown items ── */

const settingsItems = [
  { href: "/admin/centres", label: "Centres", icon: Building2, permission: "center:view" },
  { href: "/admin/programmes", label: "Programmes", icon: Building2, permission: "programme:view" },
  { href: "/admin/facilitators", label: "Facilitators", icon: UserCog, permission: "facilitator:view" },
  { href: "/admin/beneficiaries", label: "Beneficiaries", icon: Users, permission: "beneficiary:view" },
];

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

/* ── Main Navigation ── */

export default function Navigation() {
  const { logout, isAuthenticated } = useAuth();
  const { userProfile } = usePermissions();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { can } = usePermissions();

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

          {/* Mobile: centered logo */}
          <Link
            href={isAuthenticated ? "/dashboard" : "/"}
            className="absolute left-1/2 -translate-x-1/2 md:hidden flex items-center shrink-0"
            onClick={handleLogoClick}
          >
            <Image
              src="/logo.png"
              alt="Logo"
              width={36}
              height={36}
              className="rounded-lg transition-transform hover:scale-105"
              priority={true}
            />
          </Link>

          {/* Desktop: Logo + Nav Links */}
          <div className="hidden md:flex items-center gap-2">
            <Link
              href={isAuthenticated ? "/dashboard" : "/"}
              className="flex items-center gap-2 mr-4 shrink-0"
              onClick={handleLogoClick}
            >
              <Image
                src="/logo.png"
                alt="Logo"
                width={36}
                height={36}
                className="rounded-lg transition-transform hover:scale-105"
                priority={true}
              />
              <span className="text-sm font-bold text-gray-900">
                ABSetu
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

                <Can permission="session:view">
                  <Link
                    href="/sessions"
                    className={clsx(
                      "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      pathname.startsWith("/sessions")
                        ? "text-purple-700 bg-purple-50"
                        : "text-gray-500 hover:text-gray-900 hover:bg-gray-100",
                    )}
                  >
                    <CalendarDays size={15} />
                    Sessions
                  </Link>
                </Can>

                <NavDropdown
                  label="Settings"
                  icon={Settings}
                  items={settingsItems}
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

            {/* Sessions */}
            <Can permission="session:view">
              <Link
                href="/sessions"
                className={clsx(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  pathname.startsWith("/sessions")
                    ? "text-purple-700 bg-purple-50"
                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-100",
                )}
              >
                <CalendarDays size={16} />
                Sessions
              </Link>
            </Can>

            {/* Settings section */}
            <div className="pt-2">
              <p className="px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Settings
              </p>
              {settingsItems.map((item) => {
                if (!can(item.permission)) return null;
                const ItemIcon = item.icon;
                const active = pathname.startsWith(item.href);
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
