"use client";

import { useAuth } from '../services/auth';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { SparklesIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';

export default function Navigation() {
  const { logout, isAuthenticated } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    const currentUrl = pathname + (window.location.search || '');
    logout();
    router.push(`/login?redirect=${encodeURIComponent(currentUrl)}`);
  }

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isAuthenticated) {
      router.push('/places');
    } else {
      // Force a refresh of the home page
      window.location.href = '/';
    }
  };

  const navLinkClass = (href: string) =>
    `px-2 py-2 text-gray-800 font-medium transition hover:text-purple-700 ${
      pathname === href ? 'border-b-2 border-purple-700 text-purple-700 font-bold' : ''
    }`;

  return (
    <header className="fixed top-0 left-0 right-0 bg-white shadow-md z-10">
      <div className="mx-4 sm:mx-4 lg:mx-4">
        <div className="relative flex justify-between items-center h-16">
          {/* Centered logo on mobile, left on desktop */}
          <div className="absolute left-1/2 -translate-x-1/2 md:static md:translate-x-0 flex items-center">
            <Link href={
              isAuthenticated ? "/places" : "/"}  
              className="flex items-center space-x-2" 
              onClick={handleLogoClick}>
              <Image
                src="/logo.png"
                alt="Logo"
                width={50}
                height={50}
                className="rounded transition-transform hover:scale-105"
                priority={true}
              />
            </Link>
            {/* My Places link - visible on md+ and only if authenticated */}
            {isAuthenticated && (
              <>
                <Link
                  href="/places"
                  className={`ml-4 hidden md:block ${navLinkClass('/places')}`}
                >
                  My Places
                </Link>
                <Link
                  href="/places/ai-magic"
                  className={`ml-4 hidden md:flex items-center ${navLinkClass('/places/ai-magic')}`}
                >
                  <SparklesIcon className="h-5 w-5 mr-1" />
                  AI Magic
                </Link>
              </>
            )}
          </div>

          {/* Right: Logout (desktop) and Hamburger (mobile) */}
          <div className="flex items-center">
            {/* Logout button - visible on md+ */}
            {isAuthenticated && (
              <button
                onClick={handleLogout}
                className="hidden md:inline-block px-4 py-2 text-sm font-medium text-gray-500 hover:text-purple-700 rounded-md transition-all hover:scale-105 active:scale-95"
              >
                Logout
              </button>
            )}
            {/* Hamburger menu - visible on mobile */}
            {isAuthenticated && (
            <button
              className="md:hidden p-2 pl-0 rounded focus:outline-none hover:bg-gray-100"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Open menu"
            >
              <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            )}
          </div>
        </div>
        {/* Mobile Dropdown Menu */}
        {menuOpen && (
          <div className="md:hidden bg-white shadow-lg rounded-b-lg py-2 px-4 z-50 absolute left-0 right-0">
            {isAuthenticated && (
              <>
                <Link
                  href="/places"
                  className={navLinkClass('/places') + ' block'}
                  onClick={() => setMenuOpen(false)}
                >
                  My Places
                </Link>
                <Link
                  href="/places/ai-magic"
                  className={`${navLinkClass('/places/ai-magic')} block flex items-center`}
                  onClick={() => setMenuOpen(false)}
                >
                  AI Magic
                  <SparklesIcon className="ml-1 h-5 w-5" />
                </Link>
              </>
            )}
            {isAuthenticated && (
              <button
                onClick={handleLogout}
                className="block w-full text-left px-2 py-2 rounded text-gray-500 font-medium hover:text-purple-700 transition"
              >
                Logout
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
} 