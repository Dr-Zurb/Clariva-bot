"use client";

import { useMemo } from "react";
import type { PaneDefinition, PaneTreeNode } from "@/lib/patient-profile/v3/foundation";
import type { CockpitV3Layout } from "@/lib/patient-profile/v3/useCockpitV3Layout";
import { toastOnCapRejection } from "@/lib/patient-profile/v3/cockpit-cap-toast";
import CockpitLeafMenu from "./CockpitLeafMenu";
import CockpitDropOverlay, { TabBarDroppable } from "./CockpitDropOverlay";
import PaneTabStripV3 from "./PaneTabStripV3";

export interface CockpitLeafViewProps {
  node: PaneTreeNode;
  paneById: Map<string, PaneDefinition>;
  layout: CockpitV3Layout;
  canDragPane?: (paneId: string) => boolean;
}

export default function CockpitLeafView({
  node,
  paneById,
  layout,
  canDragPane = () => true,
}: CockpitLeafViewProps) {
  const paneIds = node.paneIds && node.paneIds.length > 0 ? node.paneIds : [node.id];
  const activeId = node.activeTabId ?? paneIds[0]!;
  const pane = paneById.get(activeId);
  const paneByIdRecord = useMemo(
    () => Object.fromEntries(paneById.entries()),
    [paneById],
  );

  return (
    <div className="flex h-full min-h-0 flex-col" data-cockpit-leaf={node.id}>
      <TabBarDroppable groupId={node.id}>
        <CockpitLeafMenu
          groupId={node.id}
          activePaneId={activeId}
          paneTree={layout.paneTree}
          paneById={paneByIdRecord}
          layout={layout}
        >
          <PaneTabStripV3
            groupId={node.id}
            paneIds={paneIds}
            activeTabId={activeId}
            paneById={paneByIdRecord}
            onActivateTab={(id) => layout.setActiveTab(node.id, id)}
            onCloseTab={(id) => {
              toastOnCapRejection(layout.closeTab(node.id, id));
            }}
            isTabDraggable={canDragPane}
          />
        </CockpitLeafMenu>
      </TabBarDroppable>
      <div
        id={`pane-body-${activeId}`}
        className="relative min-h-0 flex-1 overflow-auto"
      >
        {pane?.render()}
        <CockpitDropOverlay groupId={node.id} />
      </div>
    </div>
  );
}
