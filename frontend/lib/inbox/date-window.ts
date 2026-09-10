/**
 * Inbox date window (ibi-16 / date policy).
 * Presets: 7d / 30d / 90d (default 30d). Custom: single day or range, max 365 days.
 * No "All time".
 */

export type InboxDatePreset = "7d" | "30d" | "90d" | "custom";

/** Max custom / lookback window for Inbox list queries. */
export const INBOX_MAX_RANGE_DAYS = 365;

export function inboxDateBounds(
  preset: InboxDatePreset,
  custom?: { dateFrom?: string; dateTo?: string }
): {
  dateFrom?: string;
  dateTo?: string;
} {
  if (preset === "custom") {
    return {
      dateFrom: custom?.dateFrom,
      dateTo: custom?.dateTo,
    };
  }
  const days = preset === "7d" ? 7 : preset === "90d" ? 90 : 30;
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    dateFrom: from.toISOString(),
    dateTo: to.toISOString(),
  };
}

/** Convert YYYY-MM-DD (local) → start-of-day ISO. */
export function localDateStartIso(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

/** Convert YYYY-MM-DD (local) → end-of-day ISO. */
export function localDateEndIso(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

/**
 * Resolve custom Inbox dates.
 * - Only `fromYmd` → that single day
 * - `fromYmd` + `toYmd` → inclusive range
 * Rejects spans / lookbacks over INBOX_MAX_RANGE_DAYS.
 */
export function resolveCustomInboxDates(
  fromYmd: string,
  toYmd?: string,
  now: Date = new Date()
): { dateFrom: string; dateTo: string } | { error: string } {
  if (!fromYmd) {
    return { error: "Pick a date." };
  }
  const dateFrom = localDateStartIso(fromYmd);
  const dateTo = toYmd ? localDateEndIso(toYmd) : localDateEndIso(fromYmd);
  const fromMs = Date.parse(dateFrom);
  const toMs = Date.parse(dateTo);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
    return { error: "Invalid date." };
  }
  if (toMs < fromMs) {
    return { error: "End date must be on or after the start date." };
  }
  const maxMs = INBOX_MAX_RANGE_DAYS * 24 * 60 * 60 * 1000;
  if (toMs - fromMs > maxMs) {
    return { error: `Pick a range up to ${INBOX_MAX_RANGE_DAYS} days.` };
  }
  // Lookback ceiling: cannot start more than 1 year before now (1-day slack).
  if (fromMs < now.getTime() - maxMs - 24 * 60 * 60 * 1000) {
    return { error: "Inbox only covers the last year." };
  }
  return { dateFrom, dateTo };
}
