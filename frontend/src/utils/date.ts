import { format, formatISO, parseISO, startOfDay, isEqual } from "date-fns";

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
 * Format a date value for display.
 *
 * Accepts ISO date strings ("2026-03-20"), Date objects, or Unix timestamps
 * (seconds or milliseconds). Returns "—" for null/undefined.
 *
 * Default format is DISPLAY (dd-MMM-yyyy → "20-Mar-2026").
 * Pass any date-fns format string to override.
 */
export function formatDate(
  value: string | Date | number | null | undefined,
  fmt: string = DATE_FORMATS.DISPLAY
): string {
  if (value === null || value === undefined || value === "") return "—";

  let date: Date;
  if (typeof value === "string") {
    date = parseISO(value);
  } else if (typeof value === "number") {
    // Auto-detect seconds vs milliseconds
    date = new Date(value > 1e12 ? value : value * 1000);
  } else {
    date = value;
  }

  if (isNaN(date.getTime())) return "—";

  return format(date, fmt);
}

/**
 * Smart date/datetime formatter.
 * Shows "20-Mar-2026" for date-only values, "20-Mar-2026 at 2:30 PM" when time is present.
 */
export function formatDateTime(
  value: string | Date | number | null | undefined,
): string {
  if (value === null || value === undefined || value === "") return "—";

  let date: Date;
  if (typeof value === "string") {
    date = parseISO(value);
  } else if (typeof value === "number") {
    date = new Date(value > 1e12 ? value : value * 1000);
  } else {
    date = value;
  }

  if (isNaN(date.getTime())) return "—";

  // If the time is midnight, treat as date-only
  if (isEqual(date, startOfDay(date))) {
    return format(date, DATE_FORMATS.DISPLAY);
  }
  return format(date, DATE_FORMATS.DATETIME);
}

/**
 * Convert any date value (timestamp, ISO string, Date) to an ISO string
 * for use in form inputs (DateTimeInput).
 *
 * Returns "" for null/undefined/invalid.
 */
export function toISOValue(
  value: string | number | Date | null | undefined,
): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") return value; // already ISO

  let date: Date;
  if (typeof value === "number") {
    date = new Date(value > 1e12 ? value : value * 1000);
  } else {
    date = value;
  }

  if (isNaN(date.getTime())) return "";
  return formatISO(date);
}
