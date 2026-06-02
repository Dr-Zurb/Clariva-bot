/**
 * Cockpit v3 drop parity — engine-as-oracle (cv3d-04).
 *
 * movePane is a thin wrapper over dropPaneIntoZone; this suite proves the
 * cv3d-03 route → commit path never drifts from the kept engine.
 */

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  dropPaneIntoZone,
  paneTreeToFlat,
  serialiseTree,
  listTabsContainers,
  type DropZone,
  type PaneTreeNode,
} from "@/lib/patient-profile/v3/foundation";
import { routeCockpitDrop } from "@/lib/patient-profile/v3/routeCockpitDrop";
import { useCockpitV3Layout } from "@/lib/patient-profile/v3/useCockpitV3Layout";
import { blankLayout, blankLayoutFlat } from "@/lib/patient-profile/v3/blankLayout";
import type { PaneDefinition } from "@/lib/patient-profile/v3/foundation";

function ptLeaf(
  id: string,
  sizePct: number,
  hidden = false,
  paneIds?: string[],
  activeTabId?: string,
): PaneTreeNode {
  const ids = paneIds ?? [id];
  return {
    id,
    sizePct,
    hidden,
    paneIds: ids,
    activeTabId: activeTabId ?? ids[0]!,
  };
}

function ptRoot(
  children: PaneTreeNode[],
  direction: "horizontal" | "vertical" = "horizontal",
): PaneTreeNode {
  return {
    id: "__root__",
    sizePct: 100,
    hidden: false,
    direction,
    children,
  };
}

const PT_HORIZ_THREE: PaneTreeNode = ptRoot([
  ptLeaf("chart", 30),
  ptLeaf("body", 40),
  ptLeaf("rx", 30),
]);

const PT_VERT_TWO: PaneTreeNode = ptRoot(
  [ptLeaf("top", 50), ptLeaf("bottom", 50)],
  "vertical",
);

function makePanes(ids: string[]): PaneDefinition[] {
  return ids.map((id) => ({
    id,
    title: id,
    render: () => null,
  }));
}

function expectSameLayout(a: PaneTreeNode, b: PaneTreeNode): void {
  expect(paneTreeToFlat(a)).toEqual(paneTreeToFlat(b));
}

function applyRoutedMove(
  tree: PaneTreeNode,
  sourcePaneId: string,
  sourceGroupId: string,
  targetGroupId: string,
  zone: DropZone,
  overTabBar = zone === "center",
): PaneTreeNode | null {
  const route = routeCockpitDrop(
    { paneId: sourcePaneId, groupId: sourceGroupId },
    overTabBar
      ? { groupId: targetGroupId, overTabBar: true }
      : { groupId: targetGroupId },
    overTabBar ? null : zone,
  );
  if (route?.kind !== "move") return null;
  const result = dropPaneIntoZone(
    tree,
    route.sourcePaneId,
    route.targetGroupId,
    route.zone,
  );
  if (!result.ok || !result.tree) return null;
  return result.tree;
}

describe("CockpitDnd parity (cv3d-04)", () => {
  describe("route → dropPaneIntoZone matches direct engine calls", () => {
    const zones: DropZone[] = ["west", "east", "north", "south", "center"];

    for (const zone of zones) {
      it(`horizontal tree — zone ${zone}`, () => {
        const viaEngine = dropPaneIntoZone(PT_HORIZ_THREE, "rx", "body", zone);
        expect(viaEngine.ok).toBe(true);
        if (!viaEngine.ok || !viaEngine.tree) return;

        const viaRoute = applyRoutedMove(
          PT_HORIZ_THREE,
          "rx",
          "rx",
          "body",
          zone,
        );
        expect(viaRoute).not.toBeNull();
        expectSameLayout(viaRoute!, viaEngine.tree);
      });
    }

    it("vertical tree — east cross-axis split", () => {
      const viaEngine = dropPaneIntoZone(PT_VERT_TWO, "top", "bottom", "east");
      expect(viaEngine.ok).toBe(true);
      if (!viaEngine.ok || !viaEngine.tree) return;

      const viaRoute = applyRoutedMove(PT_VERT_TWO, "top", "top", "bottom", "east");
      expectSameLayout(viaRoute!, viaEngine.tree);
    });
  });

  describe("useCockpitV3Layout.movePane matches engine", () => {
    it("movePane yields the same tree as dropPaneIntoZone for each zone", () => {
      const panes = makePanes(["chart", "body", "rx"]);
      const blankDefault = blankLayout(panes);
      const defaultFlat = blankLayoutFlat(panes);

      const { result } = renderHook(() =>
        useCockpitV3Layout({
          storageKey: "parity-move-pane",
          defaultPaneOrder: defaultFlat.paneOrder,
          defaultPaneState: defaultFlat.paneState,
          knownLeafIds: defaultFlat.paneOrder,
          blankDefaultTree: blankDefault.paneTree,
        }),
      );

      act(() => {
        result.current.addPane("chart");
        result.current.addPane("body");
        result.current.addPane("rx");
      });

      const treeBefore = result.current.paneTree;

      for (const zone of ["west", "east", "center"] as const) {
        const engine = dropPaneIntoZone(treeBefore, "rx", "body", zone);
        expect(engine.ok).toBe(true);
        if (!engine.ok || !engine.tree) continue;

        act(() => {
          result.current.applyLayout({ version: 5, paneTree: treeBefore });
        });

        act(() => {
          result.current.movePane("rx", "body", zone);
        });

        expectSameLayout(result.current.paneTree, engine.tree);
      }
    });
  });

  describe("round-trip", () => {
    it("split out and tab-back yields structurally equal tree", () => {
      let tree = PT_HORIZ_THREE;
      const out = dropPaneIntoZone(tree, "rx", "body", "east");
      expect(out.ok).toBe(true);
      if (!out.ok || !out.tree) return;
      tree = out.tree;

      const tabGroup = listTabsContainers(tree).find((c) =>
        c.paneIds.includes("body"),
      );
      expect(tabGroup).toBeDefined();

      const back = dropPaneIntoZone(tree, "rx", tabGroup!.id, "center");
      expect(back.ok).toBe(true);
      if (!back.ok || !back.tree) return;

      const originalIds = listTabsContainers(PT_HORIZ_THREE)
        .flatMap((c) => c.paneIds)
        .sort();
      const roundIds = listTabsContainers(back.tree)
        .flatMap((c) => c.paneIds)
        .sort();
      expect(roundIds).toEqual(originalIds);
    });
  });
});
