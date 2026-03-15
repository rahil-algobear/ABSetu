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
      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6">
            {/* Brand */}
            <div className="flex flex-col items-center sm:items-start gap-2">
              <div className="flex items-center gap-2">
                <Image src="/logo.png" alt="ABSetu" width={32} height={32} className="rounded-lg" />
                <span className="text-sm font-bold text-gray-900">ABSetu</span>
              </div>
              <p className="text-xs text-gray-400">
                NGO outreach management platform
              </p>
            </div>

            {/* Links */}
            <div className="flex gap-10 text-xs">
              <div className="flex flex-col gap-1.5">
                <p className="font-semibold text-gray-500 uppercase tracking-wider">Product</p>
                <a href="/dashboard" className="text-gray-400 hover:text-gray-600 transition-colors">Dashboard</a>
                <a href="/sessions" className="text-gray-400 hover:text-gray-600 transition-colors">Sessions</a>
              </div>
              <div className="flex flex-col gap-1.5">
                <p className="font-semibold text-gray-500 uppercase tracking-wider">Contact</p>
                <a href="mailto:rahil@algobear.in" className="text-gray-400 hover:text-gray-600 transition-colors">rahil@algobear.in</a>
                <a href="https://algobear.in" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-600 transition-colors">algobear.in</a>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-6 pt-4 border-t border-gray-100 text-center text-[11px] text-gray-400">
            &copy; {new Date().getFullYear()} Algobear Pvt Ltd. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
