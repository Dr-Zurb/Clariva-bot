"use client";

import { useDndContext, useDroppable } from "@dnd-kit/core";
import type { DropZone } from "@/lib/patient-profile/layout-tree-mutations";
import { cn } from "@/lib/utils";

export interface PaneDropOverlayProps {
  /** The leaf/container id this overlay covers (the tree node id). */
  groupId: string;
  /**
   * When false, the overlay refuses every zone (e.g. the dragged pane is the
   * guarded `body` during a live consult, or this container is the source's
   * own single-pane home). Zones render dimmed + non-interactive.
   */
  enabled?: boolean;
  /** Optional: hide the center zone (e.g. when a tab-into would be a no-op). */
  allowCenter?: boolean;
  className?: string;
}

const ZONES: DropZone[] = ["center", "north", "south", "east", "west"];

const ZONE_LABEL: Record<DropZone, string> = {
  center: "Add as tab",
  north: "Split up",
  south: "Split down",
  east: "Split right",
  west: "Split left",
};

/** Absolute-position class per zone. Center is an inset square; edges are strips. */
const ZONE_BOX: Record<DropZone, string> = {
  center: "inset-[28%]",
  north: "inset-x-[28%] top-0 h-[28%]",
  south: "inset-x-[28%] bottom-0 h-[28%]",
  west: "inset-y-[28%] left-0 w-[28%]",
  east: "inset-y-[28%] right-0 w-[28%]",
};

function ZoneTarget({
  groupId,
  zone,
  enabled,
}: {
  groupId: string;
  zone: DropZone;
  enabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop-${groupId}-${zone}`,
    data: { groupId, zone },
    disabled: !enabled,
  });
  return (
    <div
      ref={setNodeRef}
      data-drop-zone={zone}
      data-drop-group-id={groupId}
      className={cn(
        "absolute flex items-center justify-center rounded-md border border-dashed transition-colors",
        ZONE_BOX[zone],
        enabled
          ? isOver
            ? "border-primary bg-primary/20 text-primary"
            : "border-primary/40 bg-primary/5 text-transparent hover:text-primary/70"
          : "border-muted bg-muted/10 text-transparent",
      )}
      aria-hidden
    >
      <span className="pointer-events-none select-none text-[11px] font-medium">
        {ZONE_LABEL[zone]}
      </span>
    </div>
  );
}

export default function PaneDropOverlay({
  groupId,
  enabled = true,
  allowCenter = true,
  className,
}: PaneDropOverlayProps): React.JSX.Element | null {
  const { active } = useDndContext();
  // Only present while a drag is in progress (P2-DL-4).
  if (!active) return null;
  const zones = allowCenter ? ZONES : ZONES.filter((z) => z !== "center");
  return (
    <div
      data-pane-drop-overlay={groupId}
      className={cn(
        "pointer-events-none absolute inset-0 z-20",
        className,
      )}
    >
      {/* Children re-enable pointer events so each zone can receive the drop. */}
      <div className="pointer-events-auto absolute inset-0">
        {zones.map((zone) => (
          <ZoneTarget
            key={zone}
            groupId={groupId}
            zone={zone}
            enabled={enabled}
          />
        ))}
      </div>
    </div>
  );
}
