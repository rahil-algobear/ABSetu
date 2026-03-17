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

  return (
    <div className="antialiased flex min-h-screen bg-gray-50">
      {!isAuthRoute && <Sidebar />}
      <div
        className={`flex-1 min-h-screen overflow-x-hidden ${
          isAuthRoute ? "" : "pb-4"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
