/**
 * Local-calendar date helpers for mode-schedule settings UI (pdm-08).
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

/**
 * Parse YYYY-MM-DD as a local calendar date (noon local avoids DST edge flips).
 * Returns null when the string is not a valid calendar day.
 */
export function parseLocalIsoDate(value: string): Date | null {
  if (!ISO_DATE_RE.test(value)) return null;
  const [y, m, d] = value.split('-').map((x) => parseInt(x, 10));
  const date = new Date(y, m - 1, d, 12, 0, 0, 0);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}

/** Shift a YYYY-MM-DD by `deltaDays` on the local calendar. */
export function addLocalIsoDays(value: string, deltaDays: number): string {
  const base = parseLocalIsoDate(value) ?? new Date();
  base.setDate(base.getDate() + deltaDays);
  return formatLocalIsoDate(base);
}

/**
 * Short OPD toolbar label for a session date.
 * Examples: "Today · 11 Aug", "Yesterday · 10 Aug", "Tue, 12 Aug".
 */
export function formatOpdSessionDateLabel(
  value: string,
  now: Date = new Date(),
): string {
  const date = parseLocalIsoDate(value);
  if (!date) return value;

  const today = formatLocalIsoDate(now);
  const yesterday = addLocalIsoDays(today, -1);
  const tomorrow = addLocalIsoDays(today, 1);
  const short = date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });

  if (value === today) return `Today · ${short}`;
  if (value === yesterday) return `Yesterday · ${short}`;
  if (value === tomorrow) return `Tomorrow · ${short}`;

  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** Parse ?date= from OPD URLs; falls back to today (local). */
export function parseOpdSessionDateParam(
  value: string | null | undefined,
): string {
  if (value && ISO_DATE_RE.test(value)) return value;
  return todayLocalIso();
}

/** True when `date` (YYYY-MM-DD) is strictly before today (local). */
export function isPastDate(date: string): boolean {
  if (!ISO_DATE_RE.test(date)) return false;
  return date < todayLocalIso();
}
