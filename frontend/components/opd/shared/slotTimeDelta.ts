/**
 * Relative distance between a slot's scheduled time and now, rendered as the
 * secondary line under the absolute time on the OPD board.
 *
 * The board shows the delta so the doctor never has to subtract the wall clock
 * from a slot time to know what's imminent.
 */

export type SlotDeltaTone = "late" | "due" | "future";

export interface SlotDelta {
  label: string;
  tone: SlotDeltaTone;
}

/** Minutes within which an upcoming slot counts as imminent. */
export const SLOT_DUE_SOON_MINUTES = 15;

function formatDurationShort(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function formatSlotDelta(
  scheduledAtIso: string,
  nowMs: number
): SlotDelta | null {
  const scheduledMs = new Date(scheduledAtIso).getTime();
  if (Number.isNaN(scheduledMs)) return null;

  const deltaMinutes = Math.round((scheduledMs - nowMs) / 60_000);

  if (deltaMinutes === 0) return { label: "now", tone: "due" };

  if (deltaMinutes > 0) {
    return {
      label: `in ${formatDurationShort(deltaMinutes)}`,
      tone: deltaMinutes <= SLOT_DUE_SOON_MINUTES ? "due" : "future",
    };
  }

  return {
    label: `${formatDurationShort(-deltaMinutes)} late`,
    tone: "late",
  };
}

export const SLOT_DELTA_TONE_CLASS: Record<SlotDeltaTone, string> = {
  late: "text-amber-700 dark:text-amber-300",
  due: "text-emerald-700 dark:text-emerald-300",
  future: "text-muted-foreground",
};
