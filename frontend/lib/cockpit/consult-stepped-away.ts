/**
 * Client-local "doctor stepped away" marker for live consults.
 *
 * Set when the doctor chooses Leave — resume later from CockpitLeaveGuard.
 * Cleared when they re-enter that cockpit or finish the visit.
 *
 * OPD row labels use this to show "Incomplete consult" instead of "In consult".
 * Browser-local only (localStorage) — not a server status. Cross-device needs a
 * migration later.
 */

const STORAGE_PREFIX = "clariva.consultSteppedAway:";
export const CONSULT_STEPPED_AWAY_EVENT = "clariva-consult-stepped-away";

function storageKey(appointmentId: string): string {
  return `${STORAGE_PREFIX}${appointmentId}`;
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function emitChanged(appointmentId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CONSULT_STEPPED_AWAY_EVENT, { detail: { appointmentId } }),
  );
}

export function isConsultSteppedAway(appointmentId: string): boolean {
  if (!appointmentId || !canUseStorage()) return false;
  try {
    return window.localStorage.getItem(storageKey(appointmentId)) === "1";
  } catch {
    return false;
  }
}

export function markConsultSteppedAway(appointmentId: string): void {
  if (!appointmentId || !canUseStorage()) return;
  try {
    window.localStorage.setItem(storageKey(appointmentId), "1");
  } catch {
    return;
  }
  emitChanged(appointmentId);
}

export function clearConsultSteppedAway(appointmentId: string): void {
  if (!appointmentId || !canUseStorage()) return;
  try {
    window.localStorage.removeItem(storageKey(appointmentId));
  } catch {
    return;
  }
  emitChanged(appointmentId);
}

/** Short badge label for a live (`in_consultation`) OPD row. */
export function liveConsultStatusLabel(appointmentId: string): string {
  return isConsultSteppedAway(appointmentId) ? "Incomplete" : "In consult";
}
