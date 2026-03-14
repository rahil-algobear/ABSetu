import type { Metadata } from 'next';

// Brand name constant - override via environment variable per project
const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME || 'MyApp';

/**
 * Generates page title following the pattern: [Page Title] - [BRAND_NAME]
 * If no page title is provided, returns just BRAND_NAME
 */
export function generatePageTitle(pageTitle?: string): string {
  if (pageTitle) {
    return `${pageTitle} - ${BRAND_NAME}`;
  }
  return BRAND_NAME;
}

/**
 * Creates metadata object for Next.js pages with consistent title formatting
 */
export function createPageMetadata(
  pageTitle?: string,
  description?: string
): Metadata {
  return {
    title: generatePageTitle(pageTitle),
    description: description,
  };
}
