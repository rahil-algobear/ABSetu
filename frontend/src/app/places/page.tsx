import type { Metadata } from 'next';
import { createPageMetadata } from '@/utils/metadata';
import PlacesClient from './PlacesClient';

export const metadata: Metadata = createPageMetadata('Places', 'View and manage your places');

export default function PlacesPage() {
  return <PlacesClient />;
}
