import type { Metadata } from 'next';
import { createPageMetadata } from '@/utils/metadata';
import HomeClient from './HomeClient';

export const metadata: Metadata = createPageMetadata(undefined, 'Welcome to the app');

export default function RootPage() {
  return <HomeClient />;
}
