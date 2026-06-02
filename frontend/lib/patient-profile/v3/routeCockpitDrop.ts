import type { DropZone } from "@/lib/patient-profile/v3/foundation";

export interface CockpitDropActive {
  paneId: string;
  groupId: string;
}

export interface CockpitDropOver {
  groupId: string;
  overTabBar?: boolean;
  sortableTabId?: string;
}

export type CockpitDropRoute =
  | {
      kind: "move";
      sourcePaneId: string;
      targetGroupId: string;
      zone: DropZone;
    }
  | {
      kind: "reorder";
      groupId: string;
      sourcePaneId: string;
      beforePaneId: string;
    };

/**
 * Pure drop router for Cockpit v3 (cv3d-03).
 * `resolvedZone` comes from cv3d-02's pendingDrop channel (geometry over body droppables).
 */
export function routeCockpitDrop(
  active: CockpitDropActive | null | undefined,
  over: CockpitDropOver | null | undefined,
  resolvedZone: DropZone | null,
): CockpitDropRoute | null {
  if (!active?.paneId || !active.groupId) return null;
  if (!over?.groupId) return null;

  if (over.sortableTabId) {
    if (over.groupId === active.groupId) {
      if (over.sortableTabId === active.paneId) return null;
      return {
        kind: "reorder",
        groupId: active.groupId,
        sourcePaneId: active.paneId,
        beforePaneId: over.sortableTabId,
      };
    }
    return {
      kind: "move",
      sourcePaneId: active.paneId,
      targetGroupId: over.groupId,
      zone: "center",
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

  const over = overRaw?.groupId ? overRaw : null;

  return { active, over };
}
