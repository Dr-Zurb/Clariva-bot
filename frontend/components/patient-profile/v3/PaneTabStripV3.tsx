"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useSortable, SortableContext, type SortingStrategy } from "@dnd-kit/sortable";
import { CSS as DndCSS } from "@dnd-kit/utilities";
import { ChevronRight, MoreHorizontal, X } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PaneDefinition } from "@/lib/patient-profile/v3/foundation";
import { useCockpitDndState } from "@/components/patient-profile/v3/CockpitDndContext";
import { cn } from "@/lib/utils";

export const VISIBLE_TAB_LIMIT = 4;

/** Must match `useSortable({ id })` — SortableContext items use the same ids. */
export function cockpitTabSortableId(groupId: string, paneId: string): string {
  return `cockpit-v3-tab-${groupId}-${paneId}`;
}

export function cockpitTabStripEndId(groupId: string): string {
  return `cockpit-v3-tab-end-${groupId}`;
}

/**
 * Tabs stay in DOM order while dragging. The insert indicator is the only
 * reorder preview — live sibling transforms fought the indicator and flickered.
 */
const tabStripNoLiveSortStrategy: SortingStrategy = () => null;

export interface PaneTabStripV3Props {
  /** Stable id of the tabs container (the leaf node's id in the tree). */
  groupId: string;
  /** Ordered pane ids living in this container. */
  paneIds: string[];
  /** Which paneId is the active tab. Invariant: paneIds.includes(activeTabId). */
  activeTabId: string;
  /** Lookup map for pane metadata (title + icon). */
  paneById: Record<string, PaneDefinition>;
  /** Fired when the user clicks a tab. */
  onActivateTab: (paneId: string) => void;
  /** Fired when the user clicks a tab's close (×) button (multi-tab leaves only). */
  onCloseTab?: (paneId: string) => void;
  /**
   * Fired when the user clicks the trailing leaf-close control. Closes the whole
   * pane slot (all tabs). Always shown when provided — single-tab leaves have no
   * per-tab × so this is their only close affordance.
   */
  onCloseLeaf?: () => void;
  /**
   * Optional context-menu opener for an individual tab. When provided, right-click
   * on a tab button invokes this (cv3c-03 palette / context menu).
   */
  onContextMenuTab?: (paneId: string, event: React.MouseEvent) => void;
  /**
   * Optional render slot for wrapping each visible tab button — e.g. to attach
   * a context-menu trigger to each tab (cpf-04 "wrap-around-the-tab" path).
   */
  wrapTab?: (paneId: string, tab: React.ReactNode) => React.ReactNode;
  /** Optional className for the outer strip. */
  className?: string;
  /**
   * When false for a pane id, that tab's drag source is disabled.
   * Defaults to always draggable (including Consult during live teleconsult).
   */
  isTabDraggable?: (paneId: string) => boolean;
  /**
   * Trailing chrome after tabs / overflow (e.g. Focus control — ctf-03).
   * Rendered once per leaf, not per tab chip.
   */
  trailingActions?: React.ReactNode;
}

function SortableTab({
  paneId,
  groupId,
  draggable,
  children,
}: {
  paneId: string;
  groupId: string;
  draggable: boolean;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: cockpitTabSortableId(groupId, paneId),
    data: { paneId, groupId, sortableTabId: paneId },
    disabled: !draggable,
    // Keep slot geometry stable under DragOverlay — no layout pop on pick-up.
    animateLayoutChanges: () => false,
  });
  const style = {
    // No live sibling shifts (null strategy); only clear any stale transform.
    transform: isDragging ? undefined : DndCSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
  };
  return (
    <span
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative inline-flex shrink-0",
        // Full hide under DragOverlay — faded duplicate caused flicker.
        isDragging && "opacity-0",
      )}
      {...attributes}
      {...listeners}
    >
      {children}
    </span>
  );
}

/** Vertical seam line showing where the dragged tab will land. */
function TabInsertIndicator({ side }: { side: "before" | "after" }) {
  return (
    <span
      aria-hidden
      data-testid="pane-tab-insert-indicator"
      data-insert-side={side}
      className={cn(
        "pointer-events-none absolute inset-y-1 z-30 w-0.5 rounded-full bg-primary",
        side === "before" ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2",
      )}
    />
  );
}

/**
 * Fills trailing empty space after the last tab so dropping there appends
 * to the end of the strip (not only the right half of the last chip).
 */
function TabStripEndDroppable({
  groupId,
  lastPaneId,
}: {
  groupId: string;
  lastPaneId: string;
}) {
  const { activeDragPaneId, pendingTabReorder } = useCockpitDndState();
  const { setNodeRef } = useDroppable({
    id: cockpitTabStripEndId(groupId),
    data: { groupId, tabStripEnd: true as const, lastPaneId },
    disabled: !activeDragPaneId,
  });

  const showIndicator =
    pendingTabReorder?.groupId === groupId &&
    pendingTabReorder.fromEndZone === true &&
    pendingTabReorder.place === "after";

  return (
    <div
      ref={setNodeRef}
      data-testid="pane-tab-strip-end-drop"
      data-pane-tabs-end={groupId}
      className="relative h-full min-h-[2rem] min-w-[1.5rem] flex-1"
    >
      {showIndicator ? (
        <span
          aria-hidden
          data-testid="pane-tab-insert-indicator"
          data-insert-side="after"
          className="pointer-events-none absolute inset-y-1 left-0 z-30 w-0.5 -translate-x-1/2 rounded-full bg-primary"
        />
      ) : null}
    </div>
  );
}

function TabCloseButton({
  paneId,
  onCloseTab,
}: {
  paneId: string;
  onCloseTab: (paneId: string) => void;
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`Close ${paneId} tab`}
      data-pane-tab-close={paneId}
      onClick={(e) => {
        e.stopPropagation();
        onCloseTab(paneId);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onCloseTab(paneId);
        }
      }}
      className={cn(
        "ml-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm",
        "text-muted-foreground hover:bg-muted hover:text-foreground",
        "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      )}
    >
      <X className="h-3 w-3" aria-hidden />
    </span>
  );
}

function LeafCloseButton({
  label,
  tooltip,
  onCloseLeaf,
}: {
  label: string;
  tooltip: string;
  onCloseLeaf: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-testid="pane-leaf-close-button"
          aria-label={label}
          onClick={onCloseLeaf}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground",
            "transition-colors hover:bg-accent hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <X className="h-3.5 w-3.5 stroke-[2.25]" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

interface ScrollHints {
  overflowing: boolean;
  canLeft: boolean;
  canRight: boolean;
  /** Custom thumb width as % of the track. */
  thumbWidthPct: number;
  /** Custom thumb left offset as % of the track. */
  thumbLeftPct: number;
}

const SCROLL_HINTS_IDLE: ScrollHints = {
  overflowing: false,
  canLeft: false,
  canRight: false,
  thumbWidthPct: 100,
  thumbLeftPct: 0,
};

function roundPct(n: number): number {
  return Math.round(n * 10) / 10;
}

function hintsEqual(a: ScrollHints, b: ScrollHints): boolean {
  return (
    a.overflowing === b.overflowing &&
    a.canLeft === b.canLeft &&
    a.canRight === b.canRight &&
    a.thumbWidthPct === b.thumbWidthPct &&
    a.thumbLeftPct === b.thumbLeftPct
  );
}

export default function PaneTabStripV3({
  groupId,
  paneIds,
  activeTabId,
  paneById,
  onActivateTab,
  onCloseTab,
  onCloseLeaf,
  onContextMenuTab,
  wrapTab,
  className,
  isTabDraggable = () => true,
  trailingActions,
}: PaneTabStripV3Props): React.JSX.Element | null {
  const visiblePaneIds = paneIds.slice(0, VISIBLE_TAB_LIMIT);
  const overflowPaneIds = paneIds.slice(VISIBLE_TAB_LIMIT);
  // Per-tab × only when the leaf hosts multiple tabs; single-tab leaves use the
  // trailing leaf-close control (window-chrome style).
  const showPerTabClose = Boolean(onCloseTab) && paneIds.length > 1;
  const activeTitle = paneById[activeTabId]?.title ?? activeTabId;
  const leafCloseLabel =
    paneIds.length > 1
      ? `Close all tabs in this pane`
      : `Close ${activeTitle}`;
  const leafCloseTooltip =
    paneIds.length > 1
      ? "Close this pane (all tabs)"
      : `Close ${activeTitle}`;
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
  } | null>(null);
  // Stable dependency for "which tabs are visible" without a new array each render.
  const visibleKey = visiblePaneIds.join(",");
  const [scrollHints, setScrollHints] = useState<ScrollHints>(SCROLL_HINTS_IDLE);
  const [draggingThumb, setDraggingThumb] = useState(false);
  const { pendingTabReorder } = useCockpitDndState();
  const insertForGroup =
    pendingTabReorder?.groupId === groupId ? pendingTabReorder : null;
  const sortableItems = paneIds.map((id) => cockpitTabSortableId(groupId, id));

  const handleContextMenu = useCallback(
    (paneId: string) => (e: React.MouseEvent) => {
      if (!onContextMenuTab) return;
      e.preventDefault();
      onContextMenuTab(paneId, e);
    },
    [onContextMenuTab],
  );

  const updateScrollHints = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      setScrollHints((prev) => (hintsEqual(prev, SCROLL_HINTS_IDLE) ? prev : SCROLL_HINTS_IDLE));
      return;
    }
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const overflowing = scrollWidth > clientWidth + 1;
    const thumbWidthPct = overflowing
      ? roundPct(Math.max((clientWidth / scrollWidth) * 100, 12))
      : 100;
    const maxLeftPct = Math.max(100 - thumbWidthPct, 0);
    const thumbLeftPct = overflowing
      ? roundPct(
          maxLeftPct === 0
            ? 0
            : (scrollLeft / (scrollWidth - clientWidth)) * maxLeftPct,
        )
      : 0;
    const next: ScrollHints = {
      overflowing,
      canLeft: overflowing && scrollLeft > 1,
      canRight: overflowing && scrollLeft + clientWidth < scrollWidth - 1,
      thumbWidthPct,
      thumbLeftPct,
    };
    setScrollHints((prev) => (hintsEqual(prev, next) ? prev : next));
  }, []);

  /**
   * Mouse wheels only emit deltaY; map that to horizontal scroll when the strip
   * overflows. Trackpad / shift+wheel already send deltaX — leave those alone.
   * Native non-passive listener so preventDefault can stop the pane body from
   * scrolling while the pointer is over the tab strip.
   */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Overflow + edge-fade + thumb metrics: resize, scroll, and tab-set changes.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateScrollHints();
    const ro = new ResizeObserver(() => updateScrollHints());
    ro.observe(el);
    el.addEventListener("scroll", updateScrollHints, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", updateScrollHints);
    };
  }, [updateScrollHints, visibleKey]);

  // Keep the active tab in view when the strip is narrower than its tabs
  // (multi-tab leaf in a squeezed column).
  useEffect(() => {
    const strip = scrollRef.current;
    if (!strip) return;
    const active = strip.querySelector<HTMLElement>(
      `[data-pane-tab-id="${CSS.escape(activeTabId)}"]`,
    );
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
    updateScrollHints();
  }, [activeTabId, visibleKey, updateScrollHints]);

  const endThumbDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
    const target = e.currentTarget;
    if (typeof target.releasePointerCapture === "function") {
      try {
        target.releasePointerCapture(e.pointerId);
      } catch {
        // Already released.
      }
    }
    dragRef.current = null;
    setDraggingThumb(false);
  }, []);

  const onThumbPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = scrollRef.current;
      if (!el || !scrollHints.overflowing) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.currentTarget.setPointerCapture === "function") {
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startScrollLeft: el.scrollLeft,
      };
      setDraggingThumb(true);
    },
    [scrollHints.overflowing],
  );

  const onThumbPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      const el = scrollRef.current;
      const track = trackRef.current;
      if (!drag || drag.pointerId !== e.pointerId || !el || !track) return;
      const trackWidth = track.clientWidth;
      if (trackWidth <= 0) return;
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (maxScroll <= 0) return;
      const thumbWidthPx = (scrollHints.thumbWidthPct / 100) * trackWidth;
      const maxThumbTravel = Math.max(trackWidth - thumbWidthPx, 1);
      const dx = e.clientX - drag.startX;
      el.scrollLeft = drag.startScrollLeft + (dx / maxThumbTravel) * maxScroll;
    },
    [scrollHints.thumbWidthPct],
  );

  /** Click the track (not the thumb) to jump the viewport. */
  const onTrackPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      const el = scrollRef.current;
      const track = trackRef.current;
      if (!el || !track || !scrollHints.overflowing) return;
      const rect = track.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const trackWidth = rect.width;
      const thumbWidthPx = (scrollHints.thumbWidthPct / 100) * trackWidth;
      const maxScroll = el.scrollWidth - el.clientWidth;
      const maxThumbTravel = Math.max(trackWidth - thumbWidthPx, 1);
      const targetThumbLeft = Math.min(
        Math.max(clickX - thumbWidthPx / 2, 0),
        maxThumbTravel,
      );
      el.scrollLeft = (targetThumbLeft / maxThumbTravel) * maxScroll;
    },
    [scrollHints.overflowing, scrollHints.thumbWidthPct],
  );

  if (paneIds.length === 0) {
    return null;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <SortableContext
        id={groupId}
        items={sortableItems}
        strategy={tabStripNoLiveSortStrategy}
      >
        <div
          data-pane-tabs-group-id={groupId}
          className={cn(
            "flex h-10 min-w-0 shrink-0 items-stretch overflow-hidden border-b border-border/60 bg-muted/40",
            className,
          )}
        >
          <div
            className="group/tabscroll relative z-10 min-w-0 flex-1 bg-muted/40"
            data-pane-tab-scroll
          >
            {scrollHints.canLeft ? (
              <div
                aria-hidden
                data-testid="pane-tab-strip-fade-left"
                className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-muted to-transparent"
              />
            ) : null}
            {scrollHints.canRight ? (
              <div
                aria-hidden
                data-testid="pane-tab-strip-fade-right"
                className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-muted to-transparent"
              />
            ) : null}
            <div
              ref={scrollRef}
              role="tablist"
              aria-label="Pane tabs"
              data-testid="pane-tab-strip-scroll"
              data-overflowing={scrollHints.overflowing ? "true" : "false"}
              className={cn(
                "flex h-full min-w-0 w-full flex-nowrap items-center gap-1.5 overflow-x-auto overflow-y-hidden px-2",
                // Always hide the native bar — we render a custom thumb instead.
                "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
              )}
            >
              {visiblePaneIds.map((paneId) => {
                const pane = paneById[paneId];
                if (!pane) return null;
                const Icon = pane.icon;
                const isActive = paneId === activeTabId;
                const showInsert =
                  insertForGroup &&
                  !insertForGroup.fromEndZone &&
                  insertForGroup.overPaneId === paneId
                    ? insertForGroup.place
                    : null;
                const tabElement = (
                  <SortableTab
                    paneId={paneId}
                    groupId={groupId}
                    draggable={isTabDraggable(paneId)}
                  >
                    {showInsert ? (
                      <TabInsertIndicator side={showInsert} />
                    ) : null}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          aria-controls={`pane-body-${paneId}`}
                          data-pane-tab-id={paneId}
                          onClick={() => onActivateTab(paneId)}
                          onContextMenu={handleContextMenu(paneId)}
                          className={cn(
                            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-card px-2.5 text-xs ring-1 ring-inset transition-[box-shadow,colors]",
                            "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                            isActive
                              ? "font-semibold text-foreground shadow ring-border/60"
                              : "font-medium text-muted-foreground shadow-sm ring-border/50 hover:bg-muted/40 hover:text-foreground hover:shadow",
                          )}
                        >
                          {Icon ? (
                            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          ) : null}
                          <span className="max-w-[140px] truncate">{pane.title}</span>
                          {showPerTabClose && onCloseTab ? (
                            <TabCloseButton paneId={paneId} onCloseTab={onCloseTab} />
                          ) : null}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" sideOffset={4}>
                        {pane.title}
                      </TooltipContent>
                    </Tooltip>
                  </SortableTab>
                );
                const tabNode = wrapTab ? wrapTab(paneId, tabElement) : tabElement;
                return <React.Fragment key={paneId}>{tabNode}</React.Fragment>;
              })}
              {paneIds.length > 0 ? (
                <TabStripEndDroppable
                  groupId={groupId}
                  lastPaneId={paneIds[paneIds.length - 1]!}
                />
              ) : null}
            </div>

            {scrollHints.overflowing ? (
              <div
                ref={trackRef}
                data-testid="pane-tab-strip-scrollbar"
                className={cn(
                  "absolute inset-x-2 bottom-0.5 z-20 h-1.5",
                  "opacity-0 transition-opacity duration-150",
                  "group-hover/tabscroll:opacity-100",
                  draggingThumb && "opacity-100",
                )}
                onPointerDown={onTrackPointerDown}
              >
                <div
                  role="scrollbar"
                  aria-orientation="horizontal"
                  aria-controls={`pane-body-${activeTabId}`}
                  aria-valuenow={Math.round(scrollHints.thumbLeftPct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  data-testid="pane-tab-strip-thumb"
                  className={cn(
                    "absolute top-0 h-full min-w-[1.25rem] cursor-grab rounded-full",
                    "bg-foreground/25 hover:bg-foreground/40 active:cursor-grabbing",
                    draggingThumb && "bg-foreground/45",
                  )}
                  style={{
                    width: `${scrollHints.thumbWidthPct}%`,
                    left: `${scrollHints.thumbLeftPct}%`,
                  }}
                  onPointerDown={onThumbPointerDown}
                  onPointerMove={onThumbPointerMove}
                  onPointerUp={endThumbDrag}
                  onPointerCancel={endThumbDrag}
                />
              </div>
            ) : null}
          </div>
          {overflowPaneIds.length > 0 ? (
            <div className="flex shrink-0 items-center border-l border-border/40 px-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${overflowPaneIds.length} more tabs`}
                    className="inline-flex h-8 items-center gap-1 rounded-md bg-card px-2 text-xs font-medium text-muted-foreground shadow-sm ring-1 ring-inset ring-border/50 hover:bg-muted/60 hover:text-foreground hover:shadow"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
                    <span>+{overflowPaneIds.length}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {overflowPaneIds.map((paneId) => {
                    const pane = paneById[paneId];
                    if (!pane) return null;
                    const Icon = pane.icon;
                    const isActive = paneId === activeTabId;
                    return (
                      <SortableTab
                        key={paneId}
                        paneId={paneId}
                        groupId={groupId}
                        draggable={isTabDraggable(paneId)}
                      >
                        <DropdownMenuItem
                          onSelect={() => onActivateTab(paneId)}
                          onContextMenu={handleContextMenu(paneId)}
                          className={cn(
                            "flex items-center gap-2",
                            isActive ? "font-medium" : undefined,
                          )}
                        >
                          {Icon ? (
                            <Icon className="h-4 w-4 shrink-0" aria-hidden />
                          ) : null}
                          <span className="min-w-0 flex-1 truncate">{pane.title}</span>
                          {showPerTabClose && onCloseTab ? (
                            <TabCloseButton paneId={paneId} onCloseTab={onCloseTab} />
                          ) : null}
                          {isActive ? (
                            <ChevronRight
                              className="ml-auto h-3 w-3 shrink-0 opacity-60"
                              aria-hidden
                            />
                          ) : null}
                        </DropdownMenuItem>
                      </SortableTab>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
          {trailingActions || onCloseLeaf ? (
            <div
              data-testid="pane-tab-strip-trailing-actions"
              className="relative z-0 flex min-w-0 shrink-0 items-center border-l border-border/40 bg-muted/40 px-1"
            >
              {trailingActions}
              {onCloseLeaf ? (
                <LeafCloseButton
                  label={leafCloseLabel}
                  tooltip={leafCloseTooltip}
                  onCloseLeaf={onCloseLeaf}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </SortableContext>
    </TooltipProvider>
  );
}
