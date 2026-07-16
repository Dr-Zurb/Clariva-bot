import type { DropZone } from "@/lib/patient-profile/v3/foundation";

/** Halves model (v3-DL-4). Tunable post-dogfood (V3-R6). */
export const EDGE = 0.5;

/**
 * Central "swap" pad half-extent (fraction of each axis from the midline).
 * A pointer within `|nx-0.5| < CENTER && |ny-0.5| < CENTER` targets the middle
 * of the body → swap the two panes (cv3d-swap). Edges remain insert zones.
 */
export const CENTER = 0.2;

export interface Rect {
  width: number;
  height: number;
}

export interface Point {
  /** Local to the group's top-left. */
  x: number;
  y: number;
}

/**
 * Resolve which drop zone the pointer targets within a group body or tab bar.
 * Pure, total, deterministic — truth-table in dropZoneGeometry.test.ts.
 */
export function resolveDropZoneFromPointer(
  rect: Rect,
  point: Point,
  opts?: { overTabBar?: boolean },
): DropZone {
  if (opts?.overTabBar) return "center";

  const { width: w, height: h } = rect;
  if (w <= 0 || h <= 0) return "center";

  const nx = point.x / w;
  const ny = point.y / h;
  const dx = Math.abs(nx - 0.5);
  const dy = Math.abs(ny - 0.5);

  // Central pad → swap (cv3d-swap). Checked before the edge split so the middle
  // of the body is a distinct target.
  if (dx < CENTER && dy < CENTER) return "center";

  // Dominant axis; exact ties → horizontal (west/east), nx/ny on center line → west/north.
  if (dx >= dy) {
    return nx <= 0.5 ? "west" : "east";
  }
  return ny <= 0.5 ? "north" : "south";
}
