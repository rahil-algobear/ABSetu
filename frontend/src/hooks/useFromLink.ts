"use client";

import { useSearchParams } from "next/navigation";

interface UseFromLinkArgs {
  /** Where to send the user when no ?from is present (e.g. a deep link). */
  fallbackHref: string;
  /** Label to show when no ?from_label is present. */
  fallbackLabel: string;
}

export interface FromLink {
  href: string;
  label: string;
}

/**
 * Reads `?from` / `?from_label` from the current URL and returns a destination
 * for the back affordance. Falls back to the canonical parent if either is
 * missing — so the link is always meaningful, even for deep links.
 */
export function useFromLink({
  fallbackHref,
  fallbackLabel,
}: UseFromLinkArgs): FromLink {
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const fromLabel = searchParams.get("from_label");

  if (from) {
    return { href: from, label: fromLabel || fallbackLabel };
  }
  return { href: fallbackHref, label: fallbackLabel };
}

/** Append `from` + `from_label` query params to a detail-page URL. */
export function withFrom(
  href: string,
  fromUrl: string,
  fromLabel: string,
): string {
  const params = new URLSearchParams();
  params.set("from", fromUrl);
  params.set("from_label", fromLabel);
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}${params.toString()}`;
}
