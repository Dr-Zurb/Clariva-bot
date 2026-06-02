/**
 * Local-calendar date helpers for mode-schedule settings UI (pdm-08).
 */

/** Format any instant as YYYY-MM-DD in the browser's local timezone. */
export function formatLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Today's date in the browser's local timezone as YYYY-MM-DD. */
export function todayLocalIso(): string {
  return formatLocalIsoDate(new Date());
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse ?date= from OPD URLs; falls back to today (local). */
export function parseOpdSessionDateParam(
  value: string | null | undefined,
): string {
  if (value && ISO_DATE_RE.test(value)) return value;
  return todayLocalIso();
}

/** True when `date` (YYYY-MM-DD) is strictly before today (local). */
export function isPastDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return date < todayLocalIso();
}
