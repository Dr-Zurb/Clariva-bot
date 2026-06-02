import type { DropZone } from "@/lib/patient-profile/v3/foundation";

/** Halves model (v3-DL-4). Tunable post-dogfood (V3-R6). */
export const EDGE = 0.5;

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

  // Dominant axis; exact ties → horizontal (west/east), nx/ny on center line → west/north.
  if (dx >= dy) {
    return nx <= 0.5 ? "west" : "east";
  }
  return ny <= 0.5 ? "north" : "south";
}
