/**
 * rec-27a — charter metric #3 marks.
 *
 * Confirm and halt MUST be separate calls. Collocating them (as rec-24
 * first shipped) makes `performance.measure` always ~0 ms and cannot
 * report confirm → local track disabled.
 */

export type Rec24HaltIntent = "pause" | "stop";

export function rec24ConfirmMarkName(intent: Rec24HaltIntent): string {
  return `rec24-confirm-${intent}`;
}

export function rec24HaltMarkName(intent: Rec24HaltIntent): string {
  return `rec24-halt-${intent}`;
}

export function rec24MeasureName(intent: Rec24HaltIntent): string {
  return `rec24-confirm-to-halt-${intent}`;
}

function canMark(): boolean {
  return (
    typeof performance !== "undefined" &&
    typeof performance.mark === "function" &&
    typeof performance.measure === "function"
  );
}

/** First line of the confirm/pause handler, before state or network. */
export function markGrantHaltConfirm(intent: Rec24HaltIntent): void {
  if (!canMark()) return;
  try {
    performance.mark(rec24ConfirmMarkName(intent));
  } catch {
    // Best-effort — metric #3 is measured on a real device.
  }
}

/**
 * After the local video track has been told to stop producing frames
 * (`LocalVideoTrack.disable()` returned). Never call in the same
 * function body as `markGrantHaltConfirm` without the halt in between.
 */
export function markGrantHaltDone(intent: Rec24HaltIntent): void {
  if (!canMark()) return;
  try {
    performance.mark(rec24HaltMarkName(intent));
    performance.measure(
      rec24MeasureName(intent),
      rec24ConfirmMarkName(intent),
      rec24HaltMarkName(intent),
    );
  } catch {
    // Missing confirm mark, or measure unsupported.
  }
}
