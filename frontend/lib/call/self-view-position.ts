/**
 * Self-view corner / inline-side helpers (Speaker PiP + Gallery/Sidebar swap).
 *
 * Kept module-pure so unit tests cover the flip maps without mounting
 * `<VideoRoom>`.
 */

export type SelfViewPosition = "TL" | "TR" | "BL" | "BR";

export const SELF_VIEW_POSITIONS: readonly SelfViewPosition[] = [
  "TL",
  "TR",
  "BL",
  "BR",
];

/** Who fills the Speaker stage. The other tile is the PiP. */
export type FeaturedTile = "remote" | "self";

/** Movement (px) before a PiP pointer gesture counts as a drag, not a tap. */
export const PIP_DRAG_THRESHOLD_PX = 8;

/** Speaker PiP: legacy corner cycle (kept for tests / keyboard fallbacks). */
export const SELF_VIEW_NEXT_POSITION: Record<
  SelfViewPosition,
  SelfViewPosition
> = {
  BR: "BL",
  BL: "TL",
  TL: "TR",
  TR: "BR",
};

/**
 * Snap a point to the nearest Speaker PiP corner (quadrant of the stage).
 */
export function snapPipCorner(
  clientX: number,
  clientY: number,
  stage: { left: number; top: number; width: number; height: number }
): SelfViewPosition {
  const midX = stage.left + stage.width / 2;
  const midY = stage.top + stage.height / 2;
  const left = clientX < midX;
  const top = clientY < midY;
  if (top && left) return "TL";
  if (top && !left) return "TR";
  if (!top && left) return "BL";
  return "BR";
}

/**
 * Gallery / Sidebar: flip left ↔ right on tap (keeps top/bottom
 * preference for Speaker when returning to PiP).
 */
export const SELF_VIEW_FLIP_HORIZONTAL: Record<
  SelfViewPosition,
  SelfViewPosition
> = {
  BR: "BL",
  BL: "BR",
  TR: "TL",
  TL: "TR",
};

/** True when self should sit on the start edge (left / top). */
export function selfViewOnStart(position: SelfViewPosition): boolean {
  return position === "TL" || position === "BL";
}

/**
 * Prefer a top corner when the stage is a short header. The reflowed
 * chat-open stage uses the full box, so all four corners are valid;
 * this stays for callers that still want a top-biased default.
 */
export function pipCornerWhenChatOpen(
  position: SelfViewPosition
): SelfViewPosition {
  return selfViewOnStart(position) ? "TL" : "TR";
}
