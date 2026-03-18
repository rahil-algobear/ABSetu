"use client";

import "../styles/globals.css";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const isAuthRoute = pathname === "/login";

  if (isAuthRoute) {
    return <div className="antialiased min-h-screen bg-gray-50">{children}</div>;
  }

  return (
    <div className="antialiased min-h-screen bg-gray-50 flex flex-col">
      {/* Sidebar renders the fixed header + sticky sidebar */}
      <Sidebar />
      {/* Main content: offset for fixed header (h-14 = 3.5rem) */}
      <div className="pt-14 flex-1 flex flex-col">
        <main className="flex-1 overflow-x-hidden pb-4">{children}</main>
        <footer className="border-t border-gray-200 bg-white px-6 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-400">
            <span>ABSetu &mdash; NGO Outreach Management</span>
            <span>&copy; {new Date().getFullYear()} ABSetu. All rights reserved.</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
