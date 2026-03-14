'use client';

import Link from 'next/link';
import { useAuth } from '../services/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  const handleStartPlanning = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isAuthenticated) {
      router.push('/places');
    } else {
      router.push('/login?redirect=/places');
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white">
      <div className="text-center space-y-8 px-4">
        <h1 className="text-5xl font-bold text-gray-900">
          Welcome to Trip Planner
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl">
          Plan your perfect trip by exploring and organizing your favorite destinations on an interactive map.
        </p>
        <button 
          onClick={handleStartPlanning}
          className="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          Start Planning
        </button>
      </div>
    </main>
  );
} 