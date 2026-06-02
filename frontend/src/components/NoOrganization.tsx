'use client';

import { Building2, Mail, Phone, RefreshCw, LogOut } from 'lucide-react';
import { useAuth } from '../services/auth';
import { usePermissions } from './Auth/Permissions';

/**
 * Shown to an authenticated user whose account isn't linked to any
 * organization. Self-registered users land here (registration creates a
 * user with no organization_id), since the rest of the app is org-scoped
 * and would otherwise show an empty, half-broken dashboard.
 */
export default function NoOrganization() {
  const { logout } = useAuth();
  const { userProfile } = usePermissions();
  const firstName = userProfile?.first_name?.trim();

  const handleSignout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <main className="relative flex min-h-[calc(100vh-200px)] items-center justify-center p-4">
      {/* Gradient blobs (consistent with login / homepage) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-[360px] w-[640px] -translate-x-1/2 rounded-full bg-violet-200/40 blur-3xl" />
        <div className="absolute -bottom-24 right-[-120px] h-[400px] w-[400px] rounded-full bg-indigo-200/35 blur-3xl" />
      </div>

      <div className="relative w-full max-w-lg">
        <div className="rounded-3xl border border-gray-200 bg-white/90 p-8 text-center shadow-lg backdrop-blur">
          <span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
            <Building2 size={30} />
          </span>

          <h1 className="text-2xl font-bold text-gray-900">
            {firstName ? `Welcome, ${firstName}!` : 'Welcome!'}
          </h1>
          <p className="mt-1 text-lg font-semibold text-violet-700">
            You&rsquo;re not part of an organization yet
          </p>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-gray-600">
            Your account is ready, but it hasn&rsquo;t been linked to an organization. An
            organization admin needs to add you before you can start tracking beneficiaries,
            sessions, and attendance.
          </p>

          {/* Contact CTA */}
          <div className="mt-6 rounded-2xl border border-violet-100 bg-violet-50/60 p-5 text-left">
            <p className="text-sm font-semibold text-gray-900">
              Want to set up a new organization?
            </p>
            <p className="mt-1 text-sm text-gray-600">
              Get in touch and we&rsquo;ll help you get started.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <a
                href="mailto:rahil@algobear.in"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-110"
              >
                <Mail size={16} />
                rahil@algobear.in
              </a>
              <a
                href="tel:+919322006489"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              >
                <Phone size={16} />
                +91-9322006489
              </a>
            </div>
          </div>

          {/* Secondary actions */}
          <div className="mt-6 flex items-center justify-center gap-4 text-sm">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 font-medium text-violet-700 transition-colors hover:text-violet-800"
            >
              <RefreshCw size={14} />
              I&rsquo;ve been added &mdash; refresh
            </button>
            <span className="text-gray-300">&middot;</span>
            <button
              onClick={handleSignout}
              className="inline-flex items-center gap-1.5 font-medium text-gray-500 transition-colors hover:text-gray-700"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
