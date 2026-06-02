/**
 * `findPaneTreeLeafMetadata` — unit tests (cpf-04).
 */

import { describe, it, expect } from "vitest";
import { findPaneTreeLeafMetadata } from "../find-pane-tree-leaf-metadata";
import type { PaneTreeNode } from "../layout-tree";

function makeMultiPaneTree(rootId = "root"): PaneTreeNode {
  return {
    id: rootId,
    sizePct: 100,
    hidden: false,
    direction: "horizontal",
    children: [
      {
        id: "snapshot",
        sizePct: 75,
        hidden: false,
        paneIds: ["snapshot", "history"],
        activeTabId: "snapshot",
      },
      {
        id: "plan",
        sizePct: 25,
        hidden: false,
        paneIds: ["plan"],
        activeTabId: "plan",
      },
    ],
  };
}

describe("findPaneTreeLeafMetadata", () => {
  it("returns paneIds + activeTabId for a multi-pane tabs leaf", () => {
    const meta = findPaneTreeLeafMetadata(makeMultiPaneTree(), "snapshot");
    expect(meta).toEqual({
      paneIds: ["snapshot", "history"],
      activeTabId: "snapshot",
    });
  });

  it("returns single-pane meta for a leaf whose paneIds has length 1", () => {
    const meta = findPaneTreeLeafMetadata(makeMultiPaneTree(), "plan");
    expect(meta).toEqual({ paneIds: ["plan"], activeTabId: "plan" });
  });

  it("returns null when no leaf in the tree has the given node id", () => {
    const tree = makeMultiPaneTree();
    // "history" is a paneId carried INSIDE the snapshot tabs leaf — not the
    // node id of any leaf in the tree.
    expect(findPaneTreeLeafMetadata(tree, "history")).toBeNull();
    expect(findPaneTreeLeafMetadata(tree, "ghost")).toBeNull();
  });

  it("falls back to [node.id] when paneIds is missing (v4-shape leaf)", () => {
    const v4Tree: PaneTreeNode = {
      id: "root",
      sizePct: 100,
      hidden: false,
      children: [{ id: "chart", sizePct: 100, hidden: false }],
    };
    expect(findPaneTreeLeafMetadata(v4Tree, "chart")).toEqual({
      paneIds: ["chart"],
      activeTabId: "chart",
    });
  });

  it("clamps activeTabId to paneIds[0] when activeTabId is not in paneIds", () => {
    const drifted: PaneTreeNode = {
      id: "root",
      sizePct: 100,
      hidden: false,
      children: [
        {
          id: "snapshot",
          sizePct: 100,
          hidden: false,
          paneIds: ["snapshot", "history"],
          activeTabId: "ghost",
        },
      ],
    };
    expect(findPaneTreeLeafMetadata(drifted, "snapshot")).toEqual({
      paneIds: ["snapshot", "history"],
      activeTabId: "snapshot",
    });
  });

  it("walks nested splits to find the leaf", () => {
    const nested: PaneTreeNode = {
      id: "root",
      sizePct: 100,
      hidden: false,
      direction: "horizontal",
      children: [
        {
          id: "split-A",
          sizePct: 50,
          hidden: false,
          direction: "vertical",
          children: [
            {
              id: "snapshot",
              sizePct: 100,
              hidden: false,
              paneIds: ["snapshot", "history"],
              activeTabId: "history",
            },
          ],
        },
        {
          id: "plan",
          sizePct: 50,
          hidden: false,
          paneIds: ["plan"],
          activeTabId: "plan",
        },
      ],
    };
    expect(findPaneTreeLeafMetadata(nested, "snapshot")).toEqual({
      paneIds: ["snapshot", "history"],
      activeTabId: "history",
    });
    expect(findPaneTreeLeafMetadata(nested, "plan")).toEqual({
      paneIds: ["plan"],
      activeTabId: "plan",
    });
  });
});
