"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/services/auth';
import HomePage from '@/components/HomePage';

export default function HomeClient() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const defaultAuthenticatedRoute = '/beneficiaries';

  useEffect(() => {
    if (isAuthenticated) {
      router.push(defaultAuthenticatedRoute);
    }
  }, [isAuthenticated, router, defaultAuthenticatedRoute]);

  return <HomePage />;
}
