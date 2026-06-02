import type { Metadata } from 'next';
import { createPageMetadata } from '@/utils/metadata';
import HomeClient from './HomeClient';

export const metadata: Metadata = createPageMetadata(
  undefined,
  'ABSetu is the outreach management platform built for NGOs — track beneficiaries, run programmes across centers, and record sessions and attendance from any phone.',
);

export default function RootPage() {
  return <HomeClient />;
}
