/**
 * Compact relative / absolute time helpers for Inbox.
 */

export function formatInboxRelativeTime(
  iso: string,
  now: Date = new Date()
): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diffMs = Math.max(0, now.getTime() - then);
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

/** Full absolute timestamp for tooltips (locale-aware). */
export function formatInboxAbsoluteTime(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  return new Date(then).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Clock time on a message bubble (e.g. "4:07 PM"). */
export function formatInboxMessageClock(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  return new Date(then).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function isSameCalendarDay(aIso: string, bIso: string): boolean {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return startOfLocalDay(new Date(a)) === startOfLocalDay(new Date(b));
}

/** Day separator label: Today / Yesterday / Mon, 26 Jul. */
export function formatInboxDaySeparator(
  iso: string,
  now: Date = new Date()
): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const day = startOfLocalDay(new Date(then));
  const today = startOfLocalDay(now);
  const dayMs = 24 * 60 * 60 * 1000;
  if (day === today) return "Today";
  if (day === today - dayMs) return "Yesterday";
  return new Date(then).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
