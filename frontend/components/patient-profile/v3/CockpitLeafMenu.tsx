"use client";

import { useMemo } from "react";
import PaneContextMenu, {
  type PaneContextMenuMoveOption,
  type PaneContextMenuMoveTarget,
} from "@/components/patient-profile/PaneContextMenu";
import {
  listTabsContainers,
  resolveMoveSourcePaneId,
  type PaneDefinition,
  type PaneTreeNode,
} from "@/lib/patient-profile/v3/foundation";
import type { CockpitV3Layout } from "@/lib/patient-profile/v3/useCockpitV3Layout";
import { toastOnCapRejection } from "@/lib/patient-profile/v3/cockpit-cap-toast";

export interface CockpitLeafMenuProps {
  groupId: string;
  activePaneId: string;
  paneTree: PaneTreeNode;
  paneById: Record<string, PaneDefinition>;
  layout: CockpitV3Layout;
  children: React.ReactNode;
}

export default function CockpitLeafMenu({
  groupId,
  activePaneId,
  paneTree,
  paneById,
  layout,
  children,
}: CockpitLeafMenuProps) {
  const moveTargets = useMemo((): PaneContextMenuMoveOption[] => {
    const tabIntoTargets: PaneContextMenuMoveTarget[] = listTabsContainers(
      paneTree,
      (id) => paneById[id]?.title ?? id,
    )
      .filter((c) => c.id !== groupId)
      .map((c) => ({
        kind: "tab-into" as const,
        groupId: c.id,
        label: c.label,
      }));

    return [
      ...tabIntoTargets,
      { kind: "split-horizontal" },
      { kind: "split-vertical" },
    ];
  }, [groupId, paneById, paneTree]);

  const handleMove = (target: PaneContextMenuMoveOption) => {
    const sourcePaneId = resolveMoveSourcePaneId(paneTree, activePaneId);
    if (target.kind === "tab-into") {
      toastOnCapRejection(
        layout.movePane(sourcePaneId, target.groupId, "center"),
      );
      return;
    }
    if (target.kind === "split-horizontal") {
      toastOnCapRejection(
        layout.movePane(sourcePaneId, groupId, "east"),
      );
      return;
    }
    toastOnCapRejection(layout.movePane(sourcePaneId, groupId, "south"));
  };

  return (
    <PaneContextMenu
      paneId={activePaneId}
      isCollapsed={false}
      canMerge={false}
      onSplitHorizontal={() => {
        toastOnCapRejection(layout.splitLeafDir(groupId, "row"));
      }}
      onSplitVertical={() => {
        toastOnCapRejection(layout.splitLeafDir(groupId, "column"));
      }}
      onMerge={() => {}}
      onToggleCollapsed={() => {}}
      onHide={() => {
        toastOnCapRejection(layout.closeTab(groupId, activePaneId));
      }}
      moveTargets={moveTargets}
      onMove={handleMove}
    >
      {children}
    </PaneContextMenu>
  );
}
