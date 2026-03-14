"use client";

import "../styles/globals.css";
import { usePathname } from 'next/navigation';
import { useAuth } from '../services/auth';
import Navigation from "./Navigation";

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const isAuthRoute = pathname === '/login';

  return (
    <div className="antialiased flex flex-col min-h-screen bg-gray-50">
      <Navigation />
      <div className={`flex-1 mx-auto w-full min-h-[calc(100vh-100px)] ${isAuthRoute ? '' : 'pb-4'} pt-[64px]`}>
        {children}
      </div>
    </div>
  );
}
