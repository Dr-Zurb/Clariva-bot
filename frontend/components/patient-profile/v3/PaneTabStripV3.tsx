"use client";

import React, { useCallback } from "react";
import { useSortable, SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
import { cn } from "@/lib/utils";

export const VISIBLE_TAB_LIMIT = 4;

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
  /** Fired when the user clicks a tab's close (×) button. */
  onCloseTab?: (paneId: string) => void;
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
   * When false for a pane id, that tab's drag source is disabled (e.g. body
   * during a live consult — v3-DL-6). Defaults to always draggable.
   */
  isTabDraggable?: (paneId: string) => boolean;
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
    id: `cockpit-v3-tab-${groupId}-${paneId}`,
    data: { paneId, groupId, sortableTabId: paneId },
    disabled: !draggable,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <span
      ref={setNodeRef}
      style={style}
      className={cn("inline-flex", isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
    >
      {children}
    </span>
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

export default function PaneTabStripV3({
  groupId,
  paneIds,
  activeTabId,
  paneById,
  onActivateTab,
  onCloseTab,
  onContextMenuTab,
  wrapTab,
  className,
  isTabDraggable = () => true,
}: PaneTabStripV3Props): React.JSX.Element | null {
  const visiblePaneIds = paneIds.slice(0, VISIBLE_TAB_LIMIT);
  const overflowPaneIds = paneIds.slice(VISIBLE_TAB_LIMIT);

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
      <SortableContext
        id={groupId}
        items={paneIds}
        strategy={horizontalListSortingStrategy}
      >
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
              <SortableTab
                key={paneId}
                paneId={paneId}
                groupId={groupId}
                draggable={isTabDraggable(paneId)}
              >
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
                      "inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium transition-colors",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                      isActive
                        ? "border border-border/60 bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {Icon ? (
                      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    ) : null}
                    <span className="max-w-[140px] truncate">{pane.title}</span>
                    {onCloseTab ? (
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
          if (wrapTab) {
            return (
              <React.Fragment key={paneId}>
                {wrapTab(paneId, tabElement)}
              </React.Fragment>
            );
          }
          return <React.Fragment key={paneId}>{tabElement}</React.Fragment>;
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
                      {onCloseTab ? (
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
        ) : null}
        </div>
      </SortableContext>
    </TooltipProvider>
  );
}
