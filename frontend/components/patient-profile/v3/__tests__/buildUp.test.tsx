/**
 * Cockpit v3 build-up story (cv3c-03) — layout-engine mutations with synthetic panes.
 *
 * Production-path palette + blank-seed regression (buildCockpitTabs) lives in
 * `buildUp.production.test.tsx` (cv3t-02).
 */

import { describe, it, expect } from "vitest";
import {
  blankLayout,
  countVisibleStructuralLeaves,
  hasVisibleLeaves,
} from "@/lib/patient-profile/v3/blankLayout";
import {
  deserialiseTree,
  dropPaneIntoZone,
  extractFromTabsNode,
  serialiseTree,
  type PaneDefinition,
  type PaneTreeNode,
} from "@/lib/patient-profile/v3/foundation";

function makePanes(ids: string[]): PaneDefinition[] {
  return ids.map((id) => ({
    id,
    title: id,
    render: () => null,
  }));
}

function unhide(tree: PaneTreeNode, paneId: string): PaneTreeNode {
  function walk(n: PaneTreeNode): PaneTreeNode {
    if (!n.children?.length) {
      const ids = n.paneIds ?? [n.id];
      if (ids.includes(paneId)) return { ...n, hidden: false };
      return n;
    }
    return { ...n, children: n.children.map(walk) };
  }
  return walk(tree);
}

function hide(tree: PaneTreeNode, paneId: string): PaneTreeNode {
  function walk(n: PaneTreeNode): PaneTreeNode {
    if (!n.children?.length) {
      const ids = n.paneIds ?? [n.id];
      if (ids.includes(paneId)) return { ...n, hidden: true };
      return n;
    }
    return { ...n, children: n.children.map(walk) };
  }
  return walk(tree);
}

function visibleRootLeaves(tree: PaneTreeNode): PaneTreeNode[] {
  return (tree.children ?? []).filter((c) => !c.hidden && !c.children?.length);
}

describe("buildUp (cv3c-03)", () => {
  const panes = makePanes(["a", "b", "c"]);

  it("blank canvas has no visible leaves", () => {
    const layout = blankLayout(panes);
    expect(hasVisibleLeaves(layout.paneTree)).toBe(false);
    expect(countVisibleStructuralLeaves(layout.paneTree)).toBe(0);
  });

  it("adding 3 panes yields 3 visible root columns", () => {
    let tree = blankLayout(panes).paneTree;
    tree = unhide(tree, "a");
    tree = unhide(tree, "b");
    tree = unhide(tree, "c");

    expect(countVisibleStructuralLeaves(tree)).toBe(3);
    expect(visibleRootLeaves(tree)).toHaveLength(3);
    expect(visibleRootLeaves(tree).map((l) => l.paneIds?.[0])).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("splitting a leaf down creates a vertical 2-row group", () => {
    let tree = blankLayout(panes).paneTree;
    tree = unhide(unhide(unhide(tree, "a"), "b"), "c");

    const split = dropPaneIntoZone(tree, "c", "b", "south");
    expect(split.ok).toBe(true);
    if (!split.ok) return;

    const nestedVertical = split.tree.children?.find(
      (c) => c.direction === "vertical" && (c.children?.length ?? 0) === 2,
    );
    expect(nestedVertical).toBeDefined();
    expect(
      nestedVertical?.children?.map((c) => c.paneIds?.[0] ?? c.id).sort(),
    ).toEqual(["b", "c"]);
  });

  it("moving pane a into pane b as a tab creates a 2-tab leaf", () => {
    let tree = blankLayout(panes).paneTree;
    tree = unhide(unhide(tree, "a"), "b");

    const moved = dropPaneIntoZone(tree, "a", "b", "center");
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;

    const tabLeaf = moved.tree.children?.find(
      (c) => (c.paneIds?.length ?? 0) > 1,
    );
    expect(tabLeaf?.paneIds?.sort()).toEqual(["a", "b"]);
  });

  it("hiding all panes returns to empty canvas", () => {
    let tree = blankLayout(panes).paneTree;
    tree = unhide(unhide(unhide(tree, "a"), "b"), "c");
    tree = hide(hide(hide(tree, "a"), "b"), "c");

    expect(hasVisibleLeaves(tree)).toBe(false);
  });

  it("each build-up step round-trips through serialise/deserialise", () => {
    let tree = blankLayout(panes).paneTree;
    tree = unhide(unhide(tree, "a"), "b");

    const moved = dropPaneIntoZone(tree, "a", "b", "center");
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;

    const split = extractFromTabsNode(moved.tree, "b", "vertical");
    expect(split.ok).toBe(true);
    if (!split.ok) return;

    const roundTripped = deserialiseTree(serialiseTree(split.tree));
    expect(roundTripped).toEqual(split.tree);
  });
});
