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
