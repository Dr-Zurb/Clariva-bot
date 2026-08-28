import { describe, expect, it } from "vitest";
import {
  pruneLayoutToKnownLeaves,
  prunePaneTreeToKnownLeaves,
} from "@/lib/patient-profile/v3/prune-layout-leaves";
import {
  isValidTreeNode,
  paneTreeToFlat,
  type PaneTreeNode,
} from "@/lib/patient-profile/layout-tree";
import type { PatientProfileLayout } from "@/lib/patient-profile/types";

const KNOWN = ["body", "subjective", "objective", "assessment", "plan"] as const;

function consultLikeWithChart(): PaneTreeNode {
  return {
    id: "__root__",
    sizePct: 100,
    hidden: false,
    direction: "horizontal",
    children: [
      {
        id: "col-left",
        sizePct: 22,
        hidden: false,
        direction: "vertical",
        children: [
          {
            id: "snapshot",
            sizePct: 40,
            hidden: false,
            paneIds: ["snapshot"],
            activeTabId: "snapshot",
          },
          {
            id: "history",
            sizePct: 60,
            hidden: false,
            paneIds: ["history"],
            activeTabId: "history",
          },
        ],
      },
      {
        id: "col-mid",
        sizePct: 56,
        hidden: false,
        direction: "vertical",
        children: [
          {
            id: "body",
            sizePct: 42,
            hidden: false,
            paneIds: ["body"],
            activeTabId: "body",
          },
          {
            id: "assessment",
            sizePct: 8,
            hidden: false,
            paneIds: ["assessment"],
            activeTabId: "assessment",
          },
          {
            id: "plan",
            sizePct: 50,
            hidden: false,
            paneIds: ["plan"],
            activeTabId: "plan",
          },
        ],
      },
      {
        id: "col-right",
        sizePct: 22,
        hidden: false,
        direction: "vertical",
        children: [
          {
            id: "subjective",
            sizePct: 50,
            hidden: false,
            paneIds: ["subjective"],
            activeTabId: "subjective",
          },
          {
            id: "objective",
            sizePct: 50,
            hidden: false,
            paneIds: ["objective"],
            activeTabId: "objective",
          },
        ],
      },
    ],
  };
}

describe("prunePaneTreeToKnownLeaves", () => {
  it("strips snapshot/history and keeps SOAP/consult panes", () => {
    const pruned = prunePaneTreeToKnownLeaves(consultLikeWithChart(), KNOWN);
    expect(pruned).not.toBeNull();
    expect(isValidTreeNode(pruned!)).toBe(true);
    const { paneOrder } = paneTreeToFlat(pruned!);
    expect(paneOrder.sort()).toEqual([...KNOWN].sort());
    expect(paneOrder).not.toContain("snapshot");
    expect(paneOrder).not.toContain("history");
  });

  it("appends missing known ids as hidden root leaves", () => {
    const tree: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      direction: "horizontal",
      children: [
        {
          id: "body",
          sizePct: 50,
          hidden: false,
          paneIds: ["body"],
          activeTabId: "body",
        },
        {
          id: "plan",
          sizePct: 50,
          hidden: false,
          paneIds: ["plan"],
          activeTabId: "plan",
        },
        {
          id: "snapshot",
          sizePct: 33,
          hidden: true,
          paneIds: ["snapshot"],
          activeTabId: "snapshot",
        },
      ],
    };
    const pruned = prunePaneTreeToKnownLeaves(tree, KNOWN);
    expect(pruned).not.toBeNull();
    const { paneOrder, paneState } = paneTreeToFlat(pruned!);
    expect(paneOrder.sort()).toEqual([...KNOWN].sort());
    expect(paneState.subjective?.hidden).toBe(true);
    expect(paneState.objective?.hidden).toBe(true);
    expect(paneState.assessment?.hidden).toBe(true);
  });

  it("returns null when the tree has no overlapping known panes", () => {
    const tree: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      direction: "horizontal",
      children: [
        {
          id: "snapshot",
          sizePct: 50,
          hidden: false,
          paneIds: ["snapshot"],
          activeTabId: "snapshot",
        },
        {
          id: "history",
          sizePct: 50,
          hidden: false,
          paneIds: ["history"],
          activeTabId: "history",
        },
      ],
    };
    expect(prunePaneTreeToKnownLeaves(tree, KNOWN)).toBeNull();
  });

  it("filters unknown ids out of a multi-pane tabs leaf", () => {
    const tree: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      direction: "horizontal",
      children: [
        {
          id: "__tabs_1",
          sizePct: 100,
          hidden: false,
          paneIds: ["snapshot", "body", "plan"],
          activeTabId: "snapshot",
        },
      ],
    };
    const pruned = prunePaneTreeToKnownLeaves(tree, KNOWN);
    expect(pruned).not.toBeNull();
    const { paneOrder } = paneTreeToFlat(pruned!);
    expect(paneOrder).toContain("body");
    expect(paneOrder).toContain("plan");
    expect(paneOrder).not.toContain("snapshot");
  });
});

describe("pruneLayoutToKnownLeaves", () => {
  it("returns an aligned layout after pruning chart panes", () => {
    const layout: PatientProfileLayout = {
      version: 5,
      paneTree: consultLikeWithChart(),
    };
    const next = pruneLayoutToKnownLeaves(layout, KNOWN);
    expect(next).not.toBeNull();
    const { paneOrder } = paneTreeToFlat(next!.paneTree);
    expect(paneOrder.sort()).toEqual([...KNOWN].sort());
  });
});
