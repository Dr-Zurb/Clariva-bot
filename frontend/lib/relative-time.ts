export type Urgency = "overdue" | "soon" | "later";

function fmtSpan(totalMin: number): string {
  const min = Math.max(1, Math.round(totalMin));
  if (min < 60) return `${min}m`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

/** Time until a deadline, bucketed for SLA escalation. `nowMs` injected for tests. */
export function formatTimeUntil(
  deadlineIso: string,
  nowMs: number
): { label: string; urgency: Urgency } {
  const t = new Date(deadlineIso).getTime();
  if (Number.isNaN(t)) return { label: "—", urgency: "later" };
  const diffMin = Math.round((t - nowMs) / 60000);
  if (diffMin < 0) return { label: `Overdue ${fmtSpan(-diffMin)}`, urgency: "overdue" };
  return {
    label: `Due in ${fmtSpan(diffMin)}`,
    urgency: diffMin <= 60 ? "soon" : "later",
  };
}

/** "3h ago" / "12m ago" from a past timestamp. */
export function formatAgo(iso: string, nowMs: number): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diffMin = Math.round((nowMs - t) / 60000);
  if (diffMin < 0) return "—";
  if (diffMin < 1) return "just now";
  return `${fmtSpan(diffMin)} ago`;
}
