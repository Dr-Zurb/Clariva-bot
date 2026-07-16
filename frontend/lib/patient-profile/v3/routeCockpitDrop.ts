import type { DropZone } from "@/lib/patient-profile/v3/foundation";
import {
  isGutterDropData,
  resolveGutterMoveTarget,
} from "@/lib/patient-profile/v3/gutter-insert";

export interface CockpitDropActive {
  paneId: string;
  groupId: string;
}

export interface CockpitDropOver {
  groupId?: string;
  overTabBar?: boolean;
  sortableTabId?: string;
  /**
   * Trailing empty space after the last tab in a strip — append after
   * `lastPaneId` (same-group reorder).
   */
  tabStripEnd?: true;
  /** Last pane in the strip when `tabStripEnd` is set. */
  lastPaneId?: string;
  /** Gutter (separator) drop — insert between two panels (see gutter-insert). */
  gutter?: true;
  parentId?: string;
  leftChildId?: string;
  rightChildId?: string;
  orientation?: "horizontal" | "vertical";
}

export type CockpitDropRoute =
  | {
      kind: "move";
      sourcePaneId: string;
      targetGroupId: string;
      zone: DropZone;
      /**
       * Present when the drop landed on a seam (gutter). Carries the seam's
       * parent + neighbours so the layout hook can REORDER an existing sibling
       * column between the two (geometry-preserving) instead of inserting a new
       * one via `(targetGroupId, zone)`, which are kept as the insert fallback.
       */
      gutter?: {
        parentId: string;
        leftChildId: string;
        rightChildId: string;
        orientation: "horizontal" | "vertical";
      };
    }
  | {
      kind: "reorder";
      groupId: string;
      sourcePaneId: string;
      /** Tab the pointer was over at drop. */
      overPaneId: string;
      /** Insert before or after `overPaneId` (after last ⇒ append to end). */
      place: "before" | "after";
    }
  | {
      kind: "swap";
      /** Leaf container the dragged pane came from. */
      sourceGroupId: string;
      /** Leaf container whose body centre received the drop. */
      targetGroupId: string;
      /** Dragged pane id — for the consult drag guard + telemetry. */
      sourcePaneId: string;
    };

export interface RouteCockpitDropOptions {
  /**
   * Within-strip tab insert side, from pointer X relative to the hovered tab.
   * Left half → before; right half → after (enables dropping past the last tab).
   */
  tabInsertPlace?: "before" | "after";
  /**
   * Body-centre drop → swap the dragged pane's leaf with the target leaf
   * (cv3d-swap). Set from the geometry-resolved "center" intent.
   */
  swap?: boolean;
}

/**
 * Pure drop router for Cockpit v3 (cv3d-03).
 * `resolvedZone` comes from cv3d-02's pendingDrop channel (geometry over body droppables).
 */
export function routeCockpitDrop(
  active: CockpitDropActive | null | undefined,
  over: CockpitDropOver | null | undefined,
  resolvedZone: DropZone | null,
  options?: RouteCockpitDropOptions,
): CockpitDropRoute | null {
  if (!active?.paneId || !active.groupId) return null;
  if (!over) return null;

  if (isGutterDropData(over)) {
    const { targetGroupId, zone } = resolveGutterMoveTarget(
      over.orientation,
      over.leftChildId,
      over.rightChildId,
      active.groupId,
    );
    return {
      kind: "move",
      sourcePaneId: active.paneId,
      targetGroupId,
      zone,
      gutter: {
        parentId: over.parentId,
        leftChildId: over.leftChildId,
        rightChildId: over.rightChildId,
        orientation: over.orientation,
      },
    };
  }

  if (!over.groupId) return null;

  if (over.tabStripEnd && over.lastPaneId) {
    if (over.groupId === active.groupId) {
      if (over.lastPaneId === active.paneId) return null;
      return {
        kind: "reorder",
        groupId: active.groupId,
        sourcePaneId: active.paneId,
        overPaneId: over.lastPaneId,
        place: "after",
      };
    }
    return {
      kind: "move",
      sourcePaneId: active.paneId,
      targetGroupId: over.groupId,
      zone: "center",
    };
  }

  if (over.sortableTabId) {
    if (over.groupId === active.groupId) {
      if (over.sortableTabId === active.paneId) return null;
      return {
        kind: "reorder",
        groupId: active.groupId,
        sourcePaneId: active.paneId,
        overPaneId: over.sortableTabId,
        place: options?.tabInsertPlace ?? "before",
      };
    }
    return {
      kind: "move",
      sourcePaneId: active.paneId,
      targetGroupId: over.groupId,
      zone: "center",
    };
  }

  // Body-centre swap (cv3d-swap). Only on a pane body — the tab bar keeps its
  // "merge into tabs" center semantics.
  if (options?.swap && !over.overTabBar) {
    if (over.groupId === active.groupId) return null;
    return {
      kind: "swap",
      sourceGroupId: active.groupId,
      targetGroupId: over.groupId,
      sourcePaneId: active.paneId,
    };
  }

  const zone: DropZone = over.overTabBar ? "center" : (resolvedZone ?? "center");

  return {
    kind: "move",
    sourcePaneId: active.paneId,
    targetGroupId: over.groupId,
    zone,
  };
}

/** Parse dnd-kit drag-end payloads into router inputs. */
export function parseCockpitDragEnd(
  activeData: unknown,
  overData: unknown,
): { active: CockpitDropActive | null; over: CockpitDropOver | null } {
  const activeRaw = activeData as
    | { paneId?: string; groupId?: string }
    | undefined;
  const overRaw = overData as CockpitDropOver | undefined;

  const active =
    activeRaw?.paneId && activeRaw.groupId
      ? { paneId: activeRaw.paneId, groupId: activeRaw.groupId }
      : null;

  const over =
    overRaw && (overRaw.groupId || isGutterDropData(overRaw)) ? overRaw : null;

  return { active, over };
}

/**
 * Left half of the hovered tab → before; right half → after.
 * When `previousPlace` is set, a dead-band around the midpoint keeps the
 * previous side so the insert indicator does not chatter.
 */
export function resolveTabInsertPlace(
  pointerX: number,
  tabLeft: number,
  tabWidth: number,
  previousPlace?: "before" | "after" | null,
): "before" | "after" {
  if (tabWidth <= 0) return previousPlace ?? "before";
  const mid = tabLeft + tabWidth / 2;
  if (previousPlace != null) {
    const band = Math.max(tabWidth * 0.15, 6);
    if (Math.abs(pointerX - mid) < band) return previousPlace;
  }
  return pointerX < mid ? "before" : "after";
}
