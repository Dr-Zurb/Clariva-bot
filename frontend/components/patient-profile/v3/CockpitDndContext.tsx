"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
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
  routeCockpitDrop,
  type CockpitDropRoute,
} from "@/lib/patient-profile/v3/routeCockpitDrop";

export interface PendingDrop {
  groupId: string;
  zone: DropZone;
}

export type CockpitDropMovePayload = Extract<CockpitDropRoute, { kind: "move" }>;
export type CockpitDropReorderPayload = Extract<
  CockpitDropRoute,
  { kind: "reorder" }
>;

interface CockpitDndState {
  activeDragPaneId: string | null;
  /** Latest geometry-resolved drop target — cv3d-03 reads this on drag end. */
  pendingDrop: PendingDrop | null;
}

const CockpitDndStateContext = createContext<CockpitDndState>({
  activeDragPaneId: null,
  pendingDrop: null,
});

/** Active drag + pending drop target (cv3d-02 overlay / cv3d-03 commit). */
export function useCockpitDndState(): CockpitDndState {
  return useContext(CockpitDndStateContext);
}

function resolvePendingDropFromDragEvent(
  event: DragMoveEvent | DragOverEvent,
): PendingDrop | null {
  const over = event.over;
  if (!over) return null;

  const data = over.data.current as
    | { groupId?: string; overTabBar?: boolean; sortableTabId?: string }
    | undefined;
  if (!data?.groupId) return null;

  if (data.sortableTabId) return null;

  if (data.overTabBar) {
    return { groupId: data.groupId, zone: "center" };
  }

  const coords = getEventCoordinates(event.activatorEvent);
  if (!coords) return null;

  const pointerX = coords.x + event.delta.x;
  const pointerY = coords.y + event.delta.y;
  const rect = over.rect;
  const zone = resolveDropZoneFromPointer(
    { width: rect.width, height: rect.height },
    { x: pointerX - rect.left, y: pointerY - rect.top },
  );

  return { groupId: data.groupId, zone };
}

export interface CockpitDndContextProps {
  paneById: Record<string, PaneDefinition>;
  /** Cross-group / zone drop commit (cv3d-03). */
  onDrop?: (payload: CockpitDropMovePayload) => void;
  /** Within-strip tab reorder (cv3d-03). */
  onReorder?: (payload: CockpitDropReorderPayload) => void;
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
  children,
}: CockpitDndContextProps) {
  const [activeDragPaneId, setActiveDragPaneId] = useState<string | null>(null);
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragPaneId(
      (event.active.data.current?.paneId as string | undefined) ?? null,
    );
    setPendingDrop(null);
  }, []);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    setPendingDrop(resolvePendingDropFromDragEvent(event));
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    setPendingDrop(resolvePendingDropFromDragEvent(event));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const resolvedZone = pendingDrop?.zone ?? null;
      setActiveDragPaneId(null);
      setPendingDrop(null);

      const { active, over } = parseCockpitDragEnd(
        event.active.data.current,
        event.over?.data.current,
      );
      const route = routeCockpitDrop(active, over, resolvedZone);
      if (!route) return;

      if (route.kind === "reorder") {
        onReorder?.(route);
        return;
      }
      onDrop?.(route);
    },
    [onDrop, onReorder, pendingDrop],
  );

  const handleDragCancel = useCallback(() => {
    setActiveDragPaneId(null);
    setPendingDrop(null);
  }, []);

  const activePane = activeDragPaneId ? paneById[activeDragPaneId] : undefined;

  return (
    <CockpitDndStateContext.Provider value={{ activeDragPaneId, pendingDrop }}>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div data-testid="p2-cockpit-v3-dnd-context" className="contents">
          {children}
        </div>
        <DragOverlay dropAnimation={null}>
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
