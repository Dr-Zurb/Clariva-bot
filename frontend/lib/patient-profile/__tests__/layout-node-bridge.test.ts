import { describe, it, expect } from "vitest";
import {
  collectLayoutPaneIds,
  layoutNodeToPaneTree,
  layoutTreesEqual,
  paneTreeToLayoutNode,
} from "../layout-node-bridge";
import type { LayoutNode } from "../types";

const SAMPLE: LayoutNode = {
  kind: "split",
  direction: "horizontal",
  children: [
    { kind: "pane", paneId: "chart" },
    {
      kind: "split",
      direction: "vertical",
      children: [
        { kind: "pane", paneId: "body" },
        { kind: "pane", paneId: "rx" },
      ],
      sizes: [60, 40],
    },
  ],
  sizes: [30, 70],
};

describe("layout-node-bridge", () => {
  it("collectLayoutPaneIds returns leaf ids in DFS order", () => {
    expect(collectLayoutPaneIds(SAMPLE)).toEqual(["chart", "body", "rx"]);
  });

  it("round-trips LayoutNode ↔ PaneTreeNode preserving leaf ids", () => {
    const paneTree = layoutNodeToPaneTree(SAMPLE);
    const back = paneTreeToLayoutNode(paneTree);
    expect(collectLayoutPaneIds(back)).toEqual(collectLayoutPaneIds(SAMPLE));
    expect(layoutTreesEqual(back, SAMPLE)).toBe(true);
  });
});
