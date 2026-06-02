"use client";

/**
 * `<PaneToggleBar>` — mini layout map for the patient-profile shell.
 *
 * Sits in the center of `<CockpitHeader>` on desktop (lg+). Renders one
 * compact icon button per pane in `paneOrder`. Clicking a button toggles
 * that pane's `hidden` bit; dragging reorders columns. The pane title is
 * surfaced via a Radix tooltip on hover/focus rather than an inline label
 * so the bar reads as a tight activity-bar (VS Code / Cursor inspired)
 * instead of a wide pill row.
 *
 * layout-ux-01 (2026-05-28): when `columnPanes` is supplied, leaf toggles
 * are grouped under column headers with a one-click column toggle.
 *
 * Mobile (< lg) hides the bar entirely — `<MobilePillBar>` owns
 * small-viewport layout.
 *
 * Implemented in ppr-15b. Wired into `<CockpitHeader>` in ppr-15c.
 * Redesigned (compact icon-only) in ppr-11 follow-up.
 */

import { useCallback, useMemo } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Columns2, LayoutGrid } from "lucide-react";
import type { PaneDefinition, PaneRuntimeState } from "@/lib/patient-profile/types";
import { collectPaneLeafIds } from "@/lib/patient-profile/types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface PaneToggleBarProps {
  /** All panes in the user's preferred order. Drives the icon order. */
  panes: PaneDefinition[];
  /** Top-level column groups — when set, leaf toggles render in clusters. */
  columnPanes?: PaneDefinition[];
  /** Live pane order from the shell — matches `panes.map(p => p.id)` after reorders. */
  paneOrder: string[];
  /** Live per-pane runtime state — used to compute `hidden` per pane. */
  paneState: Record<string, PaneRuntimeState>;
  /** Toggle a pane's hidden bit. Forwards to the shell's `setPaneHidden`. */
  onToggleHidden: (paneId: string) => void;
  /** Toggle every leaf in a column on/off. */
  onToggleColumn?: (columnId: string) => void;
  /** Reorder one pane onto another's slot. Forwards to the shell's `reorderPane`. */
  onReorder: (fromId: string, toId: string) => void;
  /** Optional className for the outer wrapper. */
  className?: string;
  /**
   * Optional hook fired BEFORE a toggle that would HIDE a pane. Returning
   * `false` cancels the toggle; returning `true` (or undefined) lets it proceed.
   * Used by ppr-15e to gate hiding the Consultation pane during a live call.
   */
  onBeforeHide?: (paneId: string) => boolean | undefined;
}

// ---------------------------------------------------------------------------
// Single toggle button — draggable + droppable + click-to-toggle
// ---------------------------------------------------------------------------

interface PaneToggleButtonProps {
  pane: PaneDefinition;
  hidden: boolean;
  onToggleHidden: (paneId: string) => void;
  onBeforeHide?: (paneId: string) => boolean | undefined;
}

function PaneToggleButton({
  pane,
  hidden,
  onToggleHidden,
  onBeforeHide,
}: PaneToggleButtonProps) {
  const draggableId = `toggle-drag-${pane.id}`;
  const droppableId = `toggle-drop-${pane.id}`;

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({ id: draggableId, data: { paneId: pane.id } });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: droppableId,
    data: { paneId: pane.id },
  });

  const handleClick = useCallback(() => {
    if (isDragging) return;
    if (!hidden && onBeforeHide?.(pane.id) === false) return;
    onToggleHidden(pane.id);
  }, [isDragging, hidden, onBeforeHide, onToggleHidden, pane.id]);

  const Icon = pane.icon ?? LayoutGrid;

  const setRef = useCallback(
    (el: HTMLButtonElement | null) => {
      setDragRef(el);
      setDropRef(el);
    },
    [setDragRef, setDropRef],
  );

  const tooltipLabel = hidden ? `Show ${pane.title}` : `Hide ${pane.title}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={setRef}
          type="button"
          onClick={handleClick}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded transition-colors",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            !hidden && "bg-primary/15 text-primary hover:bg-primary/25",
            hidden &&
              "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
            isDragging && "opacity-40",
            isOver && "ring-2 ring-primary",
          )}
          {...attributes}
          {...listeners}
          aria-pressed={!hidden}
          aria-label={tooltipLabel}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {tooltipLabel}
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Column toggle — show/hide every leaf in a top-level column
// ---------------------------------------------------------------------------

interface ColumnToggleButtonProps {
  column: PaneDefinition;
  anyLeafVisible: boolean;
  onToggleColumn?: (columnId: string) => void;
}

function ColumnToggleButton({
  column,
  anyLeafVisible,
  onToggleColumn,
}: ColumnToggleButtonProps) {
  const Icon = column.icon ?? Columns2;
  const tooltipLabel = anyLeafVisible
    ? `Hide ${column.title} column`
    : `Show ${column.title} column`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onToggleColumn?.(column.id)}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded border border-dashed transition-colors",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            anyLeafVisible
              ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
              : "border-border/60 bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          aria-pressed={anyLeafVisible}
          aria-label={tooltipLabel}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {tooltipLabel}
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PaneToggleBar({
  panes,
  columnPanes,
  paneOrder,
  paneState,
  onToggleHidden,
  onToggleColumn,
  onReorder,
  className,
  onBeforeHide,
}: PaneToggleBarProps): JSX.Element {
  const paneById = useMemo(
    () => new Map<string, PaneDefinition>(panes.map((p) => [p.id, p])),
    [panes],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const fromId = event.active.data.current?.paneId as string | undefined;
      const toId = event.over?.data.current?.paneId as string | undefined;
      if (!fromId || !toId || fromId === toId) return;
      onReorder(fromId, toId);
    },
    [onReorder],
  );

  const renderLeafButton = useCallback(
    (id: string) => {
      const pane = paneById.get(id);
      if (!pane) {
        console.warn(
          `[PaneToggleBar] paneOrder contains id "${id}" with no matching PaneDefinition — skipping.`,
        );
        return null;
      }
      const hidden = paneState[id]?.hidden ?? false;
      return (
        <PaneToggleButton
          key={id}
          pane={pane}
          hidden={hidden}
          onToggleHidden={onToggleHidden}
          onBeforeHide={onBeforeHide}
        />
      );
    },
    [onBeforeHide, onToggleHidden, paneById, paneState],
  );

  if (panes.length === 0) return <></>;

  const grouped =
    columnPanes && columnPanes.length > 0
      ? (() => {
          const groupedLeafIds = new Set(
            columnPanes.flatMap((col) => collectPaneLeafIds(col)),
          );
          const orphanIds = paneOrder.filter((id) => !groupedLeafIds.has(id));
          const clusters = columnPanes.map((column, idx) => {
            const leafIds = collectPaneLeafIds(column).filter((id) =>
              paneOrder.includes(id),
            );
            const anyLeafVisible = leafIds.some(
              (id) => !(paneState[id]?.hidden ?? false),
            );
            return (
              <div
                key={column.id}
                className={cn(
                  "inline-flex items-center gap-0.5",
                  idx > 0 && "border-l border-border/60 pl-1 ml-0.5",
                )}
              >
                <ColumnToggleButton
                  column={column}
                  anyLeafVisible={anyLeafVisible}
                  onToggleColumn={onToggleColumn}
                />
                {leafIds.map((id) => renderLeafButton(id))}
              </div>
            );
          });
          if (orphanIds.length > 0) {
            clusters.push(
              <div
                key="__orphan-leaves__"
                className="inline-flex items-center gap-0.5 border-l border-border/60 pl-1 ml-0.5"
              >
                {orphanIds.map((id) => renderLeafButton(id))}
              </div>,
            );
          }
          return clusters;
        })()
      : paneOrder.map((id) => renderLeafButton(id));

  return (
    <TooltipProvider delayDuration={150}>
      <div
        role="toolbar"
        aria-label="Pane visibility"
        className={cn(
          "hidden md:inline-flex items-center gap-0.5 rounded-md border border-border/60 bg-muted/50 p-0.5",
          className,
        )}
      >
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          {grouped}
        </DndContext>
      </div>
    </TooltipProvider>
  );
}
