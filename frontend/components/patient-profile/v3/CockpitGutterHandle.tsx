"use client";

import { useDroppable } from "@dnd-kit/core";
import { ResizableHandle } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { useCockpitDndState } from "./CockpitDndContext";

export interface CockpitGutterHandleProps {
  /** Split group whose two children this seam divides. */
  parentId: string;
  /** Child immediately before the seam (left column / top row). */
  leftChildId: string;
  /** Child immediately after the seam (right column / bottom row). */
  rightChildId: string;
  /** Parent group orientation: "horizontal" = columns, "vertical" = rows. */
  orientation: "horizontal" | "vertical";
  className?: string;
}

/**
 * A resizable separator that doubles as a drop target. Dragging a tab onto the
 * seam inserts it as a NEW panel between the two panels the seam divides — a new
 * column between columns (vertical seam) or a new row between rows (horizontal
 * seam).
 *
 * Resize keeps working: the droppable is a `pointer-events-none` hit-strip
 * rendered inside the seam, so react-resizable-panels' own pointer handling is
 * untouched. dnd-kit only measures the strip's rect for collision; it does not
 * need pointer events on the droppable node.
 */
export default function CockpitGutterHandle({
  parentId,
  leftChildId,
  rightChildId,
  orientation,
  className,
}: CockpitGutterHandleProps) {
  const { activeDragPaneId } = useCockpitDndState();
  const dragging = Boolean(activeDragPaneId);

  const { setNodeRef, isOver } = useDroppable({
    id: `gutter-${parentId}-${rightChildId}`,
    data: { gutter: true, parentId, leftChildId, rightChildId, orientation },
    disabled: !dragging,
  });

  return (
    <ResizableHandle
      withHandle
      orientation={orientation}
      data-cockpit-gutter={rightChildId}
      className={cn(
        "bg-transparent hover:bg-border/60 data-[separator=drag]:bg-primary/60 data-[separator=active]:bg-primary/60",
        // Faint "seams are droppable" hint while a tab drag is in progress.
        dragging && "bg-border/50",
        isOver && "bg-primary/60",
        className,
      )}
    >
      {dragging ? (
        <span
          ref={setNodeRef}
          aria-hidden
          data-testid="cockpit-gutter-dropzone"
          className={cn(
            // Widened hit-strip centred on the 1px seam. pointer-events-none so
            // it never steals a resize drag from the underlying separator.
            "pointer-events-none absolute z-20",
            orientation === "horizontal"
              ? "inset-y-0 left-1/2 w-4 -translate-x-1/2"
              : "inset-x-0 top-1/2 h-4 -translate-y-1/2",
          )}
        >
          {isOver ? (
            <span
              data-testid="cockpit-gutter-insert-indicator"
              className={cn(
                "absolute rounded-full bg-primary shadow-[0_0_0_1px_hsl(var(--background))]",
                orientation === "horizontal"
                  ? "inset-y-0 left-1/2 w-1 -translate-x-1/2"
                  : "inset-x-0 top-1/2 h-1 -translate-y-1/2",
              )}
            />
          ) : null}
        </span>
      ) : null}
    </ResizableHandle>
  );
}
