import type { Metadata } from 'next';
import { createPageMetadata } from '@/utils/metadata';
import DashboardContent from '@/components/Dashboard/DashboardContent';

export const metadata: Metadata = createPageMetadata('Dashboard', 'Overview of your organization');

export default function DashboardPage() {
  return <DashboardContent />;
}
