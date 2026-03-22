import { format, parseISO } from "date-fns";
import { toZonedTime } from "date-fns-tz";

export const DATE_FORMATS = {
  /** 20/03/2026 */
  DEFAULT: "dd/MM/yyyy",
  /** 20-Mar-2026 — readable format for tables */
  DISPLAY: "dd-MMM-yyyy",
  /** 20-Mar-2026 at 2:30 PM */
  DATETIME: "dd-MMM-yyyy 'at' h:mm a",
  /** 2026-03-20 — for HTML date inputs & API payloads */
  ISO: "yyyy-MM-dd",
} as const;

/**
 * Get the browser's IANA timezone (e.g. "Asia/Kolkata", "America/New_York").
 */
export function getBrowserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Get today's date as YYYY-MM-DD in the browser's local timezone.
 * Avoids the UTC midnight bug with toISOString().split("T")[0].
 */
export function getToday(): string {
  const now = new Date();
  const zoned = toZonedTime(now, getBrowserTimezone());
  return format(zoned, DATE_FORMATS.ISO);
}

/**
 * Format a date-only value (YYYY-MM-DD string) for display.
 * No timezone conversion — date-only values are timezone-agnostic.
 * Returns "—" for null/undefined/empty.
 */
export function formatDate(
  value: string | null | undefined,
  fmt: string = DATE_FORMATS.DISPLAY,
): string {
  if (value === null || value === undefined || value === "") return "—";

  try {
    const date = parseISO(value);
    if (isNaN(date.getTime())) return "—";
    return format(date, fmt);
  } catch {
    return "—";
  }
}

/**
 * Format a datetime value (ISO 8601 string) for display.
 * Converts from UTC to the browser's local timezone.
 * Expects timezone-aware strings (e.g. "2026-03-22T11:30:00+00:00").
 * Returns "—" for null/undefined/empty.
 */
export function formatDateTime(
  value: string | null | undefined,
  fmt: string = DATE_FORMATS.DATETIME,
): string {
  if (value === null || value === undefined || value === "") return "—";

  try {
    const date = parseISO(value);
    if (isNaN(date.getTime())) return "—";
    const zoned = toZonedTime(date, getBrowserTimezone());
    return format(zoned, fmt);
  } catch {
    return "—";
  }
}

/**
 * Smart formatter: shows date-only when value has no meaningful time,
 * or full datetime when a specific time was provided.
 *
 * Date-only: "2026-03-22" or "2026-03-22T00:00:00+00:00" → "22-Mar-2026"
 * With time: "2026-03-22T14:30:00+05:30" → "22-Mar-2026 at 2:30 PM"
 */
export function formatSmartDateTime(
  value: string | null | undefined,
): string {
  if (value === null || value === undefined || value === "") return "—";

  // Date-only string (no T) — display as date, no conversion
  if (!value.includes("T")) {
    return formatDate(value);
  }

  // Midnight UTC = came from a date-only input → show date only
  if (value.match(/T00:00:00([Zz]|\+00:?00)$/)) {
    return formatDate(value.split("T")[0]);
  }

  // Has a real time component — show full datetime
  return formatDateTime(value);
}
