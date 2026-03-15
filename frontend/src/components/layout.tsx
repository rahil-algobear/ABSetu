"use client";

import "../styles/globals.css";
import { usePathname } from 'next/navigation';
import { useAuth } from '../services/auth';
import Image from "next/image";
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
      <div className={`flex-1 mx-auto w-full min-h-[calc(100vh-100px)] ${isAuthRoute ? '' : 'pb-4'}`}>
        {children}
      </div>
      <footer className="border-t border-gray-200 bg-white py-4">
        <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
          <span>Powered by</span>
          <Image src="/logo.png" alt="ABSetu" width={16} height={16} className="rounded" />
          <span className="font-semibold text-gray-500">ABSetu</span>
        </div>
      </footer>
    </div>
  );
}
