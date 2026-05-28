"use client";

import "../styles/globals.css";
import { usePathname } from 'next/navigation';
import { useAuth } from '../services/auth';
import Image from "next/image";
import { LayoutDashboard, CalendarDays, Mail, Phone } from "lucide-react";
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
      <div className={`flex-1 mx-auto w-full min-h-[calc(100vh-200px)] ${isAuthRoute ? '' : 'pb-4'}`}>
        {children}
      </div>
      <footer className="border-t border-gray-200 bg-white">
        <div className="px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-8">
            {/* Brand */}
            <div className="flex flex-col items-center sm:items-start gap-2.5">
              <div className="flex items-center gap-2.5">
                <Image src="/logo.png" alt="ABSetu" width={36} height={36} className="rounded-lg" />
                <span className="text-base font-bold text-gray-900">ABSetu</span>
              </div>
              <p className="text-sm text-gray-400">
                NGO outreach management platform
              </p>
            </div>

            {/* Links */}
            <div className="flex flex-col sm:flex-row gap-8 sm:gap-16 text-sm">
              <div className="flex flex-col items-center sm:items-start gap-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Product</p>
                <a href="/dashboard" className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 transition-colors"><LayoutDashboard size={14} />Dashboard</a>
                <a href="/sessions" className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 transition-colors"><CalendarDays size={14} />Sessions</a>
              </div>
              <div className="flex flex-col items-center sm:items-start gap-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact</p>
                <a href="mailto:rahil@algobear.in" className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 transition-colors"><Mail size={14} />rahil@algobear.in</a>
                <a href="tel:+919322006489" className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 transition-colors"><Phone size={14} />+91-9322006489</a>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar — full-bleed divider */}
        <div className="border-t border-gray-200">
          <div className="px-4 sm:px-6 py-4 text-center text-xs text-gray-400">
            &copy; {new Date().getFullYear()} Algobear Pvt Ltd. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
