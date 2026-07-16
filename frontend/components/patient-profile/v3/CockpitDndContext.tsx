"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { getEventCoordinates } from "@dnd-kit/utilities";
import type { DropZone, PaneDefinition } from "@/lib/patient-profile/v3/foundation";
import { resolveDropZoneFromPointer } from "@/lib/patient-profile/v3/dropZoneGeometry";
import {
  parseCockpitDragEnd,
  resolveTabInsertPlace,
  routeCockpitDrop,
  type CockpitDropRoute,
} from "@/lib/patient-profile/v3/routeCockpitDrop";

export interface PendingDrop {
  groupId: string;
  zone: DropZone;
  /**
   * What a drop here means, so previews and routing stay unambiguous:
   *   - "insert" → body edge split (n/s/e/w)
   *   - "merge"  → tab bar centre (tab into the group)
   *   - "swap"   → body centre (swap the two panes — cv3d-swap)
   */
  intent?: "insert" | "merge" | "swap";
}

/** Within-strip reorder preview — where the dragged tab would land. */
export interface PendingTabReorder {
  groupId: string;
  overPaneId: string;
  place: "before" | "after";
  /** True when hovering the trailing empty strip after the last tab. */
  fromEndZone?: boolean;
}

export type CockpitDropMovePayload = Extract<CockpitDropRoute, { kind: "move" }>;
export type CockpitDropReorderPayload = Extract<
  CockpitDropRoute,
  { kind: "reorder" }
>;
export type CockpitDropSwapPayload = Extract<CockpitDropRoute, { kind: "swap" }>;

interface CockpitDndState {
  activeDragPaneId: string | null;
  /** Latest geometry-resolved drop target — cv3d-03 reads this on drag end. */
  pendingDrop: PendingDrop | null;
  /** Same-strip tab reorder insertion preview. */
  pendingTabReorder: PendingTabReorder | null;
}

const CockpitDndStateContext = createContext<CockpitDndState>({
  activeDragPaneId: null,
  pendingDrop: null,
  pendingTabReorder: null,
});

/** Active drag + pending drop target (cv3d-02 overlay / cv3d-03 commit). */
export function useCockpitDndState(): CockpitDndState {
  return useContext(CockpitDndStateContext);
}

/**
 * Prefer gutter seams, then tab-strip targets (tab chips + trailing end zone),
 * then body / tab-bar droppables. Nested tab-bar wrappers would otherwise steal
 * hits from empty space after the last tab.
 */
const cockpitCollisionDetection: CollisionDetection = (args) => {
  const gutters = args.droppableContainers.filter(
    (c) => c.data.current?.gutter === true,
  );
  if (gutters.length > 0) {
    const gutterHits = pointerWithin({
      ...args,
      droppableContainers: gutters,
    });
    if (gutterHits.length > 0) return gutterHits;
  }

  const tabTargets = args.droppableContainers.filter(
    (c) =>
      Boolean(c.data.current?.sortableTabId) ||
      c.data.current?.tabStripEnd === true,
  );
  if (tabTargets.length > 0) {
    const tabHits = pointerWithin({
      ...args,
      droppableContainers: tabTargets,
    });
    if (tabHits.length > 0) return tabHits;
  }

  const others = args.droppableContainers.filter(
    (c) =>
      c.data.current?.gutter !== true &&
      !c.data.current?.sortableTabId &&
      c.data.current?.tabStripEnd !== true,
  );
  return pointerWithin({ ...args, droppableContainers: others });
};

function pointerFromDragEvent(
  event: DragMoveEvent | DragOverEvent | DragEndEvent,
): { x: number; y: number } | null {
  const coords = getEventCoordinates(event.activatorEvent);
  if (!coords) return null;
  return { x: coords.x + event.delta.x, y: coords.y + event.delta.y };
}

function samePendingDrop(a: PendingDrop | null, b: PendingDrop | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.groupId === b.groupId && a.zone === b.zone && a.intent === b.intent
  );
}

function samePendingTabReorder(
  a: PendingTabReorder | null,
  b: PendingTabReorder | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.groupId === b.groupId &&
    a.overPaneId === b.overPaneId &&
    a.place === b.place &&
    Boolean(a.fromEndZone) === Boolean(b.fromEndZone)
  );
}

function resolvePendingDropFromDragEvent(
  event: DragMoveEvent | DragOverEvent,
): PendingDrop | null {
  const over = event.over;
  if (!over) return null;

  const data = over.data.current as
    | {
        groupId?: string;
        overTabBar?: boolean;
        sortableTabId?: string;
        tabStripEnd?: boolean;
      }
    | undefined;
  if (!data?.groupId) return null;

  if (data.sortableTabId) return null;
  if (data.tabStripEnd) return null;

  if (data.overTabBar) {
    return { groupId: data.groupId, zone: "center", intent: "merge" };
  }

  const pointer = pointerFromDragEvent(event);
  if (!pointer) return null;

  const rect = over.rect;
  const zone = resolveDropZoneFromPointer(
    { width: rect.width, height: rect.height },
    { x: pointer.x - rect.left, y: pointer.y - rect.top },
  );

  // A geometry-derived "center" is the body's central pad → swap.
  const intent = zone === "center" ? "swap" : "insert";
  return { groupId: data.groupId, zone, intent };
}

function resolvePendingTabReorderFromDragEvent(
  event: DragMoveEvent | DragOverEvent | DragEndEvent,
  activePaneId: string | null,
  previous: PendingTabReorder | null,
): PendingTabReorder | null {
  const over = event.over;
  if (!over || !activePaneId) return null;

  const data = over.data.current as
    | {
        groupId?: string;
        paneId?: string;
        sortableTabId?: string;
        tabStripEnd?: boolean;
        lastPaneId?: string;
      }
    | undefined;
  if (!data?.groupId) return null;

  // Same-group only — cross-group tab drops are "tab into", not reorder.
  const activeGroup = event.active.data.current?.groupId as string | undefined;
  if (!activeGroup || activeGroup !== data.groupId) return null;

  if (data.tabStripEnd && data.lastPaneId) {
    if (data.lastPaneId === activePaneId) return null;
    return {
      groupId: data.groupId,
      overPaneId: data.lastPaneId,
      place: "after",
      fromEndZone: true,
    };
  }

  if (!data.sortableTabId) return null;
  if (data.sortableTabId === activePaneId) return null;

  const pointer = pointerFromDragEvent(event);
  if (!pointer) return null;

  const previousPlace =
    previous?.overPaneId === data.sortableTabId && !previous.fromEndZone
      ? previous.place
      : null;

  const place = resolveTabInsertPlace(
    pointer.x,
    over.rect.left,
    over.rect.width,
    previousPlace,
  );

  return {
    groupId: data.groupId,
    overPaneId: data.sortableTabId,
    place,
  };
}

export interface CockpitDndContextProps {
  paneById: Record<string, PaneDefinition>;
  /** Cross-group / zone drop commit (cv3d-03). */
  onDrop?: (payload: CockpitDropMovePayload) => void;
  /** Within-strip tab reorder (cv3d-03). */
  onReorder?: (payload: CockpitDropReorderPayload) => void;
  /** Body-centre swap of two whole panes (cv3d-swap). */
  onSwap?: (payload: CockpitDropSwapPayload) => void;
  children: React.ReactNode;
}

/**
 * Single `<DndContext>` for Cockpit v3 desktop canvas (cv3d-01 / P2-DL-3).
 * Docks stay outside this wrapper (v3-DL-6).
 */
export default function CockpitDndContext({
  paneById,
  onDrop,
  onReorder,
  onSwap,
  children,
}: CockpitDndContextProps) {
  const [activeDragPaneId, setActiveDragPaneId] = useState<string | null>(null);
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  const [pendingTabReorder, setPendingTabReorder] =
    useState<PendingTabReorder | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragPaneId(
      (event.active.data.current?.paneId as string | undefined) ?? null,
    );
    setPendingDrop(null);
    setPendingTabReorder(null);
  }, []);

  const syncPendingFromEvent = useCallback(
    (event: DragMoveEvent | DragOverEvent) => {
      const paneId =
        (event.active.data.current?.paneId as string | undefined) ?? null;
      const nextDrop = resolvePendingDropFromDragEvent(event);
      setPendingDrop((prev) =>
        samePendingDrop(prev, nextDrop) ? prev : nextDrop,
      );
      setPendingTabReorder((prev) => {
        const next = resolvePendingTabReorderFromDragEvent(
          event,
          paneId,
          prev,
        );
        return samePendingTabReorder(prev, next) ? prev : next;
      });
    },
    [],
  );

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      syncPendingFromEvent(event);
    },
    [syncPendingFromEvent],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      syncPendingFromEvent(event);
    },
    [syncPendingFromEvent],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const resolvedZone = pendingDrop?.zone ?? null;
      const swap = pendingDrop?.intent === "swap";
      const paneId =
        (event.active.data.current?.paneId as string | undefined) ??
        activeDragPaneId;
      const tabReorder = resolvePendingTabReorderFromDragEvent(
        event,
        paneId,
        pendingTabReorder,
      );

      setActiveDragPaneId(null);
      setPendingDrop(null);
      setPendingTabReorder(null);

      const { active, over } = parseCockpitDragEnd(
        event.active.data.current,
        event.over?.data.current,
      );
      const route = routeCockpitDrop(active, over, resolvedZone, {
        tabInsertPlace: tabReorder?.place,
        swap,
      });
      if (!route) return;

      if (route.kind === "reorder") {
        onReorder?.(route);
        return;
      }
      if (route.kind === "swap") {
        onSwap?.(route);
        return;
      }
      onDrop?.(route);
    },
    [onDrop, onReorder, onSwap, pendingDrop, pendingTabReorder, activeDragPaneId],
  );

  const handleDragCancel = useCallback(() => {
    setActiveDragPaneId(null);
    setPendingDrop(null);
    setPendingTabReorder(null);
  }, []);

  const activePane = activeDragPaneId ? paneById[activeDragPaneId] : undefined;

  const dndState = useMemo(
    () => ({ activeDragPaneId, pendingDrop, pendingTabReorder }),
    [activeDragPaneId, pendingDrop, pendingTabReorder],
  );

  return (
    <CockpitDndStateContext.Provider value={dndState}>
      <DndContext
        sensors={sensors}
        collisionDetection={cockpitCollisionDetection}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div data-testid="p2-cockpit-v3-dnd-context" className="contents">
          {children}
        </div>
        <DragOverlay dropAnimation={null} style={{ zIndex: 10000 }}>
          {activePane ? (
            <div className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs font-medium shadow-md">
              {activePane.icon
                ? React.createElement(activePane.icon, {
                    className: "h-3.5 w-3.5",
                    "aria-hidden": true,
                  })
                : null}
              <span>{activePane.title}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </CockpitDndStateContext.Provider>
  );
}
