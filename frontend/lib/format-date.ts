// Single source of truth for every date / time / currency render in the
// frontend. Pinned locales keep SSR (Node ICU) and CSR (browser ICU) output
// byte-identical, which prevents React 18 hydration mismatches like
// "Server: '6 May 2026, 9:00 am' / Client: 'May 6, 2026, 9:00 AM'".
//
// Do NOT call `toLocaleString` / `toLocaleDateString` / `toLocaleTimeString`
// (or the parameter-less / `undefined`-locale variants) directly anywhere
// else in `frontend/`. Always go through this module so we stay deterministic
// across runtimes.
//
// Background and history: see
// `docs/Work/deferred/deferred-date-locale-hydration-sweep-2026-04-28.md`.

// `en-GB` gives DD MMM YYYY — clinic-friendly and stable across Node + every
// browser locale. `en-IN` gives ₹ formatting with Indian digit grouping
// (lakhs / crores). `en-CA` gives ISO-style YYYY-MM-DD strings, useful for
// timezone-local date-bucket comparisons.
const DATE_LOCALE = "en-GB";
const CURRENCY_LOCALE = "en-IN";
const ISO_DATE_LOCALE = "en-CA";

type DateLike = string | number | Date;

function toDate(input: DateLike): Date | null {
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Format a date with `en-GB` (DD MMM YYYY by default). Pass `options` to
 * customise — they're forwarded to `Intl.DateTimeFormat`. Returns the raw
 * input as a string if it can't be parsed.
 */
export function formatDate(
  input: DateLike,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
): string {
  const d = toDate(input);
  if (!d) return String(input);
  return d.toLocaleDateString(DATE_LOCALE, options);
}

/**
 * Format a time with `en-GB` (HH:mm 24-hour by default). Pass `options` to
 * customise — they're forwarded to `Intl.DateTimeFormat`. Use this for
 * time-only renders; combine with {@link formatDateTime} for date+time.
 */
export function formatTime(
  input: DateLike,
  options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" },
): string {
  const d = toDate(input);
  if (!d) return String(input);
  return d.toLocaleTimeString(DATE_LOCALE, options);
}

/** Compact 24h clock, e.g. `"10:30"` — for slot-toolbar popover copy. */
export function formatTimeShort(input: DateLike): string {
  return formatTime(input, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Format a date+time with `en-GB`. Defaults to "6 May 2026, 09:00". Pass
 * `options` to customise; both `dateStyle`/`timeStyle` and granular fields
 * (`weekday`, `month`, `day`, `hour`, `minute`, …) are supported.
 */
export function formatDateTime(
  input: DateLike,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  },
): string {
  const d = toDate(input);
  if (!d) return String(input);
  return d.toLocaleString(DATE_LOCALE, options);
}

/** Convenience preset: "6 May 2026". */
export function formatDateMedium(input: DateLike): string {
  return formatDate(input);
}

/** Convenience preset: "06 May" (day + short month, no year). */
export function formatDateShort(input: DateLike): string {
  return formatDate(input, { day: "2-digit", month: "short" });
}

/**
 * Returns a "YYYY-MM-DD" string in the *local* timezone via `en-CA`.
 * Useful for comparing whether two timestamps fall on the same calendar
 * day without UTC-boundary drift. Do NOT use this for user-facing dates;
 * use {@link formatDate} instead.
 */
export function formatDateISO(input: DateLike): string {
  const d = toDate(input);
  if (!d) return String(input);
  return d.toLocaleDateString(ISO_DATE_LOCALE);
}

/**
 * Format an INR amount with the rupee symbol. `amount` is in rupees (not
 * paise). Pinned to `en-IN` so digit grouping is "1,23,456" rather than
 * "123,456".
 */
export function formatCurrencyINR(
  amount: number,
  options: Intl.NumberFormatOptions = {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  },
): string {
  return `₹${amount.toLocaleString(CURRENCY_LOCALE, options)}`;
}

/**
 * Format a plain number with `en-IN` digit grouping. Use for non-currency
 * numeric strings that need locale-aware grouping (counts, percentages, …).
 */
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return value.toLocaleString(CURRENCY_LOCALE, options);
}
