/**
 * Keep the next-patient jump from running under an open Rx print dialog.
 *
 * Chrome dismisses the system preview as soon as the appointment route
 * changes. Finish still wraps up the visit; AdvanceToNextPatient waits
 * here until the dialog closes or the doctor clicks Next.
 */

export const RX_PRINT_ADVANCE_EVENT = "halo:rx-print-advance-gate";

let held = false;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(RX_PRINT_ADVANCE_EVENT));
}

export function beginPrintAdvanceHold(): void {
  held = true;
  emit();
}

export function endPrintAdvanceHold(): void {
  if (!held) return;
  held = false;
  emit();
}

export function isPrintAdvanceHeld(): boolean {
  return held;
}

export function subscribePrintAdvanceHold(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only: a leaked hold must not bleed into the next case. */
export function resetPrintAdvanceHoldForTests(): void {
  held = false;
  listeners.clear();
}
