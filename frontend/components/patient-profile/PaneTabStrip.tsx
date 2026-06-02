"use client";

import React, { useCallback } from "react";
import { useDraggable } from "@dnd-kit/core";
import { ChevronRight, MoreHorizontal } from "lucide-react";
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
import type { PaneDefinition } from "@/lib/patient-profile/types";
import { useCustomizeMode } from "@/components/patient-profile/customize-mode-context";
import { cn } from "@/lib/utils";

export const VISIBLE_TAB_LIMIT = 4;

function DraggableTab({
  paneId,
  draggable,
  children,
}: {
  paneId: string;
  draggable: boolean;
  children: React.ReactNode;
}) {
  const customizeMode = useCustomizeMode();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tab-drag-${paneId}`,
    data: { paneId },
    disabled: !customizeMode || !draggable,
  });
  return (
    <span
      ref={setNodeRef}
      className={cn("inline-flex", isDragging && "opacity-40")}
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
    >
      {children}
    </span>
  );
}

export interface PaneTabStripProps {
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
  /**
   * Optional context-menu opener for an individual tab. When provided, right-click
   * on a tab button invokes this (the shell's existing `PaneContextMenu` is the
   * intended consumer).
   */
  onContextMenuTab?: (paneId: string, event: React.MouseEvent) => void;
  /**
   * Optional render slot for wrapping each visible tab button — e.g. to attach
   * a context-menu trigger to each tab (cpf-04 "wrap-around-the-tab" path). The
   * strip calls this with the tab's `paneId` and the rendered tab element; the
   * returned ReactNode replaces the bare element in the strip's layout.
   */
  wrapTab?: (paneId: string, tab: React.ReactNode) => React.ReactNode;
  /**
   * cpfd-04 — false → that tab cannot be dragged (e.g. body during a live consult).
   * Defaults to draggable when omitted.
   */
  isTabDraggable?: (paneId: string) => boolean;
  /** Optional className for the outer strip. */
  className?: string;
}

export default function PaneTabStrip({
  groupId,
  paneIds,
  activeTabId,
  paneById,
  onActivateTab,
  onContextMenuTab,
  wrapTab,
  isTabDraggable,
  className,
}: PaneTabStripProps): React.JSX.Element | null {
  const visiblePaneIds = paneIds.slice(0, VISIBLE_TAB_LIMIT);
  const overflowPaneIds = paneIds.slice(VISIBLE_TAB_LIMIT);
  const isTabDraggableFn = isTabDraggable ?? (() => true);

  const handleContextMenu = useCallback(
    (paneId: string) => (e: React.MouseEvent) => {
      if (!onContextMenuTab) return;
      e.preventDefault();
      onContextMenuTab(paneId, e);
    },
    [onContextMenuTab],
  );

  if (paneIds.length === 0) {
    return null;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div
        role="tablist"
        aria-label="Pane tabs"
        data-pane-tabs-group-id={groupId}
        className={cn(
          "flex h-9 shrink-0 items-center gap-0.5 border-b border-border/60 bg-muted/30 px-1",
          className,
        )}
      >
        {visiblePaneIds.map((paneId) => {
          const pane = paneById[paneId];
          if (!pane) return null;
          const Icon = pane.icon;
          const isActive = paneId === activeTabId;
          const tabElement = (
            <Tooltip key={paneId}>
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
                    "inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium transition-colors",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                    isActive
                      ? "bg-background text-foreground shadow-sm border border-border/60"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {Icon ? (
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  ) : null}
                  <span className="truncate max-w-[140px]">{pane.title}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                {pane.title}
              </TooltipContent>
            </Tooltip>
          );
          const draggableTab = (
            <DraggableTab
              paneId={paneId}
              draggable={isTabDraggableFn(paneId)}
            >
              {tabElement}
            </DraggableTab>
          );
          if (wrapTab) {
            return (
              <React.Fragment key={paneId}>
                {wrapTab(paneId, draggableTab)}
              </React.Fragment>
            );
          }
          return <React.Fragment key={paneId}>{draggableTab}</React.Fragment>;
        })}
        {overflowPaneIds.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`${overflowPaneIds.length} more tabs`}
                className="inline-flex h-7 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
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
                  <DropdownMenuItem
                    key={paneId}
                    onSelect={() => onActivateTab(paneId)}
                    onContextMenu={handleContextMenu(paneId)}
                    className={isActive ? "font-medium" : undefined}
                  >
                    {Icon ? (
                      <Icon className="mr-2 h-4 w-4" aria-hidden />
                    ) : null}
                    {pane.title}
                    {isActive ? (
                      <ChevronRight
                        className="ml-auto h-3 w-3 opacity-60"
                        aria-hidden
                      />
                    ) : null}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
