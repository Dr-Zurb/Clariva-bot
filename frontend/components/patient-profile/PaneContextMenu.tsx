"use client";

import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from "@/components/ui/context-menu";
import { trackCockpitV2RLayoutUxContextMenuOpened } from "@/lib/patient-profile/telemetry";

export interface PaneContextMenuMoveTarget {
  /** A target leaf id (tabs container) to tab into. */
  kind: "tab-into";
  groupId: string;
  /** Display label — typically the active tab pane's title; fall back to first paneId's title. */
  label: string;
}

export interface PaneContextMenuSplitTarget {
  kind: "split-horizontal" | "split-vertical";
}

export type PaneContextMenuMoveOption =
  | PaneContextMenuMoveTarget
  | PaneContextMenuSplitTarget;

export interface PaneContextMenuProps {
  paneId: string;
  isCollapsed: boolean;
  canMerge: boolean;
  onSplitHorizontal: () => void;
  onSplitVertical: () => void;
  onMerge: () => void;
  onToggleCollapsed: () => void;
  onHide: () => void;
  children: React.ReactNode;
  /** Targets the doctor can move this pane into. Excludes the source's own container. */
  moveTargets?: PaneContextMenuMoveOption[];
  onMove?: (target: PaneContextMenuMoveOption) => void;
  /** When set, the entire Move submenu is disabled with a tooltip/reason. */
  moveDisabled?: { reason: string };
}

export default function PaneContextMenu(props: PaneContextMenuProps) {
  const tabIntoTargets =
    props.moveTargets?.filter(
      (t): t is PaneContextMenuMoveTarget => t.kind === "tab-into",
    ) ?? [];
  const showMoveSubmenu = Boolean(props.onMove && props.moveTargets !== undefined);

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open) {
          trackCockpitV2RLayoutUxContextMenuOpened({ paneId: props.paneId });
        }
      }}
    >
      <ContextMenuTrigger asChild>{props.children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={props.onSplitHorizontal}>
          Split horizontally
        </ContextMenuItem>
        <ContextMenuItem onSelect={props.onSplitVertical}>
          Split vertically
        </ContextMenuItem>
        <ContextMenuItem onSelect={props.onMerge} disabled={!props.canMerge}>
          Merge with sibling
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={props.onToggleCollapsed}>
          {props.isCollapsed ? "Expand pane" : "Collapse pane"}
        </ContextMenuItem>
        <ContextMenuItem onSelect={props.onHide}>Hide pane</ContextMenuItem>
        {showMoveSubmenu ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuSub>
              <ContextMenuSubTrigger
                disabled={Boolean(props.moveDisabled)}
                title={props.moveDisabled?.reason}
              >
                Move pane to…
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {tabIntoTargets.map((t) => (
                  <ContextMenuItem
                    key={`tab-${t.groupId}`}
                    onSelect={() => props.onMove?.(t)}
                  >
                    {t.label}
                  </ContextMenuItem>
                ))}
                <ContextMenuSeparator />
                <ContextMenuItem
                  onSelect={() =>
                    props.onMove?.({ kind: "split-horizontal" })
                  }
                >
                  New split — right
                </ContextMenuItem>
                <ContextMenuItem
                  onSelect={() => props.onMove?.({ kind: "split-vertical" })}
                >
                  New split — below
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}
