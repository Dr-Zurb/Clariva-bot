"use client";

import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import type { DropZone } from "@/lib/patient-profile/v3/foundation";
import { cn } from "@/lib/utils";
import { useCockpitDndState } from "./CockpitDndContext";

const ZONE_PREVIEW_CLASS: Record<Exclude<DropZone, "center">, string> = {
  west: "absolute inset-y-0 left-0 w-1/2 border border-primary/50 bg-primary/15",
  east: "absolute inset-y-0 right-0 w-1/2 border border-primary/50 bg-primary/15",
  north: "absolute inset-x-0 top-0 h-1/2 border border-primary/50 bg-primary/15",
  south: "absolute inset-x-0 bottom-0 h-1/2 border border-primary/50 bg-primary/15",
};

function ZonePreview({ zone }: { zone: Exclude<DropZone, "center"> }) {
  return (
    <div
      data-cockpit-drop-preview
      data-cockpit-drop-zone={zone}
      className={ZONE_PREVIEW_CLASS[zone]}
      aria-hidden
    />
  );
}

export interface CockpitDropOverlayProps {
  groupId: string;
}

/**
 * Single translucent body-half preview (cv3d-02 / v3-DL-4).
 * One droppable per group; zone geometry is resolved in CockpitDndContext.
 */
export default function CockpitDropOverlay({ groupId }: CockpitDropOverlayProps) {
  const { activeDragPaneId, pendingDrop } = useCockpitDndState();

  const { setNodeRef } = useDroppable({
    id: `drop-${groupId}`,
    data: { groupId },
    disabled: !activeDragPaneId,
  });

  if (!activeDragPaneId) return null;

  const showPreview =
    pendingDrop?.groupId === groupId && pendingDrop.zone !== "center";

  return (
    <div
      ref={setNodeRef}
      data-cockpit-drop-overlay={groupId}
      className="pointer-events-none absolute inset-0 z-20"
    >
      {showPreview ? (
        <ZonePreview zone={pendingDrop.zone as Exclude<DropZone, "center">} />
      ) : null}
    </div>
  );
}

export interface TabBarDroppableProps {
  groupId: string;
  children: ReactNode;
}

/** Tab bar droppable — resolves to `center` (cv3d-02). */
export function TabBarDroppable({ groupId, children }: TabBarDroppableProps) {
  const { activeDragPaneId, pendingDrop } = useCockpitDndState();

  const { setNodeRef } = useDroppable({
    id: `drop-tabbar-${groupId}`,
    data: { groupId, overTabBar: true },
    disabled: !activeDragPaneId,
  });

  const showCenterHighlight =
    Boolean(activeDragPaneId) &&
    pendingDrop?.groupId === groupId &&
    pendingDrop.zone === "center";

  return (
    <div
      ref={setNodeRef}
      data-cockpit-tabbar-droppable={groupId}
      className={cn(
        showCenterHighlight &&
          "rounded-t-md ring-2 ring-inset ring-primary/50 bg-primary/10",
      )}
    >
      {children}
    </div>
  );
}
