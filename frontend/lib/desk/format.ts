export function formatDeskTime(iso: string, timezone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatDeskWeekday(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(now);
}

export function formatDeskDate(iso: string, timezone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    day: "numeric",
    month: "short",
  }).format(date);
}

/** Walk-ins need a future timestamp — booking rejects past dates. */
const WALK_IN_FUTURE_MS = 120_000;

export function walkInAppointmentIso(): string {
  return new Date(Date.now() + WALK_IN_FUTURE_MS).toISOString();
}

export function clinicYmd(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Wall-clock time in `timeZone` as a UTC ISO string. */
export function zonedLocalIso(
  ymd: string,
  hour: number,
  minute: number,
  timeZone: string
): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utc));
  const num = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    num("year"),
    num("month") - 1,
    num("day"),
    num("hour"),
    num("minute"),
    num("second")
  );
  return new Date(utc - (asUtc - utc)).toISOString();
}

/** Future timestamp on a clinic calendar day (today = now+2m; other days = noon). */
export function walkInAppointmentIsoOnDay(
  ymd: string,
  timezone: string,
  now = new Date()
): string {
  if (ymd === clinicYmd(timezone, now)) return walkInAppointmentIso();
  return zonedLocalIso(ymd, 12, 0, timezone);
}

export function formatDeskAmountMinor(minor: number, currency = "INR"): string {
  if (currency === "INR") {
    return `₹${Math.round(minor / 100).toLocaleString("en-IN")}`;
  }
  return `${(minor / 100).toFixed(2)} ${currency}`;
}
