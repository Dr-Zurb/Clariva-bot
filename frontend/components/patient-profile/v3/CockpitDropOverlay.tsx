"use client";

import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import type { DropZone } from "@/lib/patient-profile/v3/foundation";
import { cn } from "@/lib/utils";
import { useCockpitDndState } from "./CockpitDndContext";

type InsertZone = Exclude<DropZone, "center">;

const INSERT_ZONE_LABEL: Record<
  InsertZone,
  { title: string; hint: string; band: string; align: string }
> = {
  west: {
    title: "Insert left",
    hint: "Drop to place beside this pane",
    band: "absolute inset-y-0 left-0 w-1/2",
    align: "items-center justify-center",
  },
  east: {
    title: "Insert right",
    hint: "Drop to place beside this pane",
    band: "absolute inset-y-0 right-0 w-1/2",
    align: "items-center justify-center",
  },
  north: {
    title: "Insert above",
    hint: "Drop to stack above this pane",
    band: "absolute inset-x-0 top-0 h-1/2",
    align: "items-center justify-center",
  },
  south: {
    title: "Insert below",
    hint: "Drop to stack below this pane",
    band: "absolute inset-x-0 bottom-0 h-1/2",
    align: "items-center justify-center",
  },
};

function ZonePreview({ zone }: { zone: InsertZone }) {
  const copy = INSERT_ZONE_LABEL[zone];
  return (
    <div
      data-cockpit-drop-preview
      data-cockpit-drop-zone={zone}
      aria-hidden
      className="absolute inset-0 bg-background/55 backdrop-blur-[1px]"
    >
      <div
        className={cn(
          copy.band,
          "flex border-2 border-dashed border-primary bg-primary/15",
          copy.align,
        )}
      >
        <div className="mx-3 flex max-w-[11rem] flex-col items-center gap-1.5 rounded-lg border border-primary/40 bg-card/95 px-4 py-3 text-center shadow-elevated">
          <span className="rounded-full bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground shadow">
            {copy.title}
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            {copy.hint}
          </span>
        </div>
      </div>
    </div>
  );
}

export interface CockpitDropOverlayProps {
  groupId: string;
}

/**
 * Body drop previews (cv3d-02 / v3-DL-4 / cv3d-swap):
 * edge halves → insert left/right/above/below; centre pad → swap panes.
 */
export default function CockpitDropOverlay({ groupId }: CockpitDropOverlayProps) {
  const { activeDragPaneId, pendingDrop } = useCockpitDndState();

  const { setNodeRef } = useDroppable({
    id: `drop-${groupId}`,
    data: { groupId },
    disabled: !activeDragPaneId,
  });

  if (!activeDragPaneId) return null;

  const forThisGroup = pendingDrop?.groupId === groupId;
  const showPreview = forThisGroup && pendingDrop.zone !== "center";
  const showSwap =
    forThisGroup &&
    pendingDrop.zone === "center" &&
    pendingDrop.intent === "swap";

  return (
    <div
      ref={setNodeRef}
      data-cockpit-drop-overlay={groupId}
      className="pointer-events-none absolute inset-0 z-50"
    >
      {showPreview ? (
        <ZonePreview zone={pendingDrop.zone as InsertZone} />
      ) : null}
      {showSwap ? (
        <div
          data-cockpit-swap-preview
          aria-hidden
          className="absolute inset-0 flex items-center justify-center bg-background/75 backdrop-blur-[1px]"
        >
          <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-primary bg-card/95 px-5 py-4 shadow-elevated">
            <span className="rounded-full bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground shadow">
              Swap
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              Drop to exchange panes
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export interface TabBarDroppableProps {
  groupId: string;
  children: ReactNode;
}

/** Tab bar droppable — resolves to merge/tab-into (cv3d-02). */
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
    pendingDrop.zone === "center" &&
    pendingDrop.intent !== "swap";

  return (
    <div
      ref={setNodeRef}
      data-cockpit-tabbar-droppable={groupId}
      className={cn(
        showCenterHighlight &&
          "rounded-t-md ring-2 ring-inset ring-primary/50 bg-primary/10",
        "min-w-0",
      )}
    >
      {children}
    </div>
  );
}
