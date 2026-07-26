"use client";

import { useMemo } from "react";
import type { PaneDefinition, PaneTreeNode } from "@/lib/patient-profile/v3/foundation";
import type { CockpitV3Layout } from "@/lib/patient-profile/v3/useCockpitV3Layout";
import { toastOnCapRejection } from "@/lib/patient-profile/v3/cockpit-cap-toast";
import { listShowHereCandidates } from "@/lib/patient-profile/v3/focus-leaf";
import CockpitLeafMenu from "./CockpitLeafMenu";
import CockpitDropOverlay, { TabBarDroppable } from "./CockpitDropOverlay";
import PaneFocusButton, {
  isFocusTargetForLeaf,
} from "./PaneFocusButton";
import PaneShowHereButton from "./PaneShowHereButton";
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
  const paneTitle = pane?.title ?? activeId;
  const focusPressed = isFocusTargetForLeaf(
    layout.focusedLeafId,
    node.id,
    paneIds,
  );

  const showHereBase = layout.focusPrior ?? layout.paneTree;
  const showHereOptions = useMemo(
    () =>
      listShowHereCandidates(showHereBase, activeId).map((id) => ({
        id,
        title: paneById.get(id)?.title ?? id,
      })),
    [showHereBase, activeId, paneById],
  );

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      data-cockpit-leaf={node.id}
    >
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
            onCloseLeaf={() => {
              toastOnCapRejection(layout.closeLeaf(node.id));
            }}
            isTabDraggable={canDragPane}
            trailingActions={
              <>
                <PaneShowHereButton
                  currentTitle={paneTitle}
                  options={showHereOptions}
                  selectedId={activeId}
                  onSelect={(paneId) => {
                    toastOnCapRejection(layout.showPaneHere(node.id, paneId));
                  }}
                />
                <PaneFocusButton
                  paneTitle={paneTitle}
                  pressed={focusPressed}
                  ratio={focusPressed ? layout.ratio : null}
                  onSelectRatio={(ratio) => {
                    layout.enterSplit(activeId, ratio);
                  }}
                  onRestore={() => {
                    layout.exitFocus();
                  }}
                />
              </>
            }
          />
        </CockpitLeafMenu>
      </TabBarDroppable>
      <div className="relative min-h-0 flex-1">
        <div
          id={`pane-body-${activeId}`}
          className="absolute inset-0 overflow-auto bg-card"
        >
          {pane?.render()}
        </div>
        <CockpitDropOverlay groupId={node.id} />
      </div>
    </div>
  );
}
