"use client";

import { useState } from "react";
import { PageLayout } from "@/components/ui/page-layout";
import { SettingsSidebar, SidebarToggle } from "@/components/SettingsSidebar";
import { usePermissions } from "@/components/Auth/Permissions";

function getDefaultSidebarOpen() {
  if (typeof window === "undefined") return true;
  return window.innerWidth >= 1024;
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { loading } = usePermissions();
  const [sidebarOpen, setSidebarOpen] = useState(getDefaultSidebarOpen);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      <SettingsSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="flex-1 overflow-y-auto">
        <PageLayout className="p-4">
          {/* Header with toggle */}
          <div className="flex items-center gap-2 mb-4">
            {!sidebarOpen && (
              <SidebarToggle onClick={() => setSidebarOpen(true)} />
            )}
            <h1 className="text-2xl font-bold">Settings</h1>
          </div>

          {!loading && children}
        </PageLayout>
      </main>
    </div>
  );
}
