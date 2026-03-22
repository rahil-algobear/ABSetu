import { format, formatISO, parseISO, startOfDay } from "date-fns";
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
 * Get today as midnight in the browser's local timezone, as a full ISO datetime.
 * e.g. "2026-03-22T00:00:00+05:30"
 */
export function getTodayDatetime(): string {
  return formatISO(startOfDay(new Date()));
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
