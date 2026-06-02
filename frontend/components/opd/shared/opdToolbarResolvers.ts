import type { DoctorQueueSessionRow, SlotSessionRow } from "@/types/opd-doctor";

// ── Queue-mode resolvers (extracted from OpdQueueSessionToolbar.tsx) ─────

export function resolveQueueDelayTarget(
  active: DoctorQueueSessionRow[]
): DoctorQueueSessionRow | null {
  return (
    active.find((r) => r.queueStatus === "in_consultation") ??
    active.find((r) => r.queueStatus === "waiting") ??
    null
  );
}

export function resolveQueueEarlyJoinTarget(
  active: DoctorQueueSessionRow[]
): DoctorQueueSessionRow | null {
  return (
    active.find(
      (r) =>
        r.queueStatus === "waiting" &&
        (r.appointmentStatus === "pending" || r.appointmentStatus === "confirmed")
    ) ?? null
  );
}

// ── Slot-mode resolvers (sl-02) ─────────────────────────────────────────

/**
 * Delay target for slot mode (DL-5):
 *   1. The in-consultation slot (if any)
 *   2. else the next upcoming slot (smallest scheduledAt >= now)
 *   3. else null (disable popover)
 */
export function resolveSlotDelayTarget(
  entries: SlotSessionRow[],
  nowMs: number
): SlotSessionRow | null {
  const inConsult = entries.find((r) => r.slotStatus === "in_consultation");
  if (inConsult) return inConsult;

  const upcoming = entries
    .filter(
      (r) =>
        (r.slotStatus === "upcoming" || r.slotStatus === "grace") &&
        new Date(r.scheduledAt).getTime() >= nowMs
    )
    .sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    );

  return upcoming[0] ?? null;
}

/**
 * Early-join target for slot mode (DL-5 / §5.1b strict policy):
 *   - The next pending|confirmed appointment whose **preceding slot** (by
 *     chronological position) is `completed`.
 *   - "Preceding slot" = the most recent entry whose scheduledAt < target.scheduledAt.
 *   - Empty preceding slot (no entry before target) ⇒ early-join eligible
 *     (nothing to wait on).
 *   - Returns null when no such target exists.
 */
export function resolveSlotEarlyJoinTarget(
  entries: SlotSessionRow[]
): SlotSessionRow | null {
  const sorted = [...entries].sort(
    (a, b) =>
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  );

  for (let i = 0; i < sorted.length; i += 1) {
    const candidate = sorted[i];
    if (
      (candidate.slotStatus === "upcoming" || candidate.slotStatus === "grace") &&
      (candidate.appointmentStatus === "pending" ||
        candidate.appointmentStatus === "confirmed")
    ) {
      const preceding = sorted
        .slice(0, i)
        .filter((r) => r.slotStatus !== "cancelled" && r.slotStatus !== "overflow")
        .pop();
      if (!preceding || preceding.slotStatus === "completed") {
        return candidate;
      }
      return null;
    }
  }
  return null;
}
