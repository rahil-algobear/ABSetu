import { format, parseISO } from "date-fns";

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
