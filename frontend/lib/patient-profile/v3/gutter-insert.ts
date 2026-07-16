import type { DropZone } from "@/lib/patient-profile/v3/foundation";

/**
 * gutter-insert — pure resolution for "drop a tab onto the separator between two
 * panels" (insert the pane as a new sibling BETWEEN them).
 *
 * The seam registers a dnd-kit droppable carrying {@link GutterDropData}. On
 * drop, {@link resolveGutterMoveTarget} maps that seam to a `(targetGroupId,
 * zone)` the existing `dropPaneIntoZone` engine understands. The zone is chosen
 * ALONG the group's axis so the engine inserts a flat sibling into the parent
 * (parentAxis === zoneAxis path) rather than nesting a fresh split.
 */

export interface GutterDropData {
  gutter: true;
  /** Split group whose two children the seam divides. */
  parentId: string;
  /** Child immediately before the seam (left column / top row). */
  leftChildId: string;
  /** Child immediately after the seam (right column / bottom row). */
  rightChildId: string;
  /** Parent group orientation: "horizontal" = columns, "vertical" = rows. */
  orientation: "horizontal" | "vertical";
}

/** Narrow an unknown dnd-kit `over.data.current` to a gutter droppable payload. */
export function isGutterDropData(over: unknown): over is GutterDropData {
  if (!over || typeof over !== "object") return false;
  const data = over as Record<string, unknown>;
  return (
    data.gutter === true &&
    typeof data.parentId === "string" &&
    typeof data.leftChildId === "string" &&
    typeof data.rightChildId === "string" &&
    (data.orientation === "horizontal" || data.orientation === "vertical")
  );
}

export interface GutterMoveTarget {
  targetGroupId: string;
  zone: DropZone;
}

/**
 * Resolve the `(targetGroupId, zone)` for inserting a pane into a seam.
 *
 *   - horizontal group → east of the left child  (new column between the two)
 *   - vertical group   → south of the top child   (new row between the two)
 *
 * `activeGroupId` is the leaf group the dragged tab currently lives in. When
 * that leaf is the seam's own left/right child, we target the OTHER side: the
 * engine is single-home (it removes the source first), so targeting the
 * source's own single-pane leaf would prune the target and no-op.
 */
export function resolveGutterMoveTarget(
  orientation: "horizontal" | "vertical",
  leftChildId: string,
  rightChildId: string,
  activeGroupId?: string | null,
): GutterMoveTarget {
  const targetLeftSide = activeGroupId == null || activeGroupId !== leftChildId;

  if (orientation === "horizontal") {
    return targetLeftSide
      ? { targetGroupId: leftChildId, zone: "east" }
      : { targetGroupId: rightChildId, zone: "west" };
  }

  return targetLeftSide
    ? { targetGroupId: leftChildId, zone: "south" }
    : { targetGroupId: rightChildId, zone: "north" };
}
