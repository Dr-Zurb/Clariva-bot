import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  dropPaneIntoZone,
  swapPaneTreeNodes,
  addToTabsNode,
  setActiveTab,
  paneTreeToFlat,
  serialiseTree,
  deserialiseTree,
  isValidTreeNode,
  MAX_LEAVES,
  type PaneTreeNode,
} from "@/lib/patient-profile/v3/foundation";

const leaf = (id: string, sizePct = 50): PaneTreeNode => ({
  id,
  sizePct,
  hidden: false,
  paneIds: [id],
  activeTabId: id,
});

const root = (
  children: PaneTreeNode[],
  direction: "horizontal" | "vertical" = "horizontal",
): PaneTreeNode => ({
  id: "__root__",
  sizePct: 100,
  hidden: false,
  direction,
  children,
});

describe("cv3s-02: kept engine runs in isolation (v3-DL-1)", () => {
  it("edge-drop splits a 2-tab group into two columns", () => {
    const tree: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      paneIds: ["a", "b"],
      activeTabId: "a",
    };
    const r = dropPaneIntoZone(tree, "b", "__root__", "east");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tree.children?.length).toBe(2);
      expect(paneTreeToFlat(r.tree).paneOrder.sort()).toEqual(["a", "b"]);
    }
  });

  it("center-drop / addToTabsNode stacks a pane as a tab", () => {
    const tree = root([leaf("a"), leaf("b")]);
    const r = addToTabsNode(tree, "b", "a", "end");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(paneTreeToFlat(r.tree).paneOrder.sort()).toEqual(["a", "b"]);
    }
  });

  it("setActiveTab switches the active tab", () => {
    const tree: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      paneIds: ["a", "b"],
      activeTabId: "a",
    };
    const r = setActiveTab(tree, "__root__", "b");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tree.activeTabId).toBe("b");
  });

  it("refuses an edge split that would exceed MAX_LEAVES", () => {
    const cols = Array.from({ length: MAX_LEAVES }, (_, i) => leaf(`p${i}`));
    const tree = root(cols);
    const r = dropPaneIntoZone(tree, "p0", "p1", "east");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("cap-reached");
  });

  it("round-trips through serialise / deserialise", () => {
    const tree = root([leaf("a"), leaf("b")]);
    expect(isValidTreeNode(tree)).toBe(true);
    expect(deserialiseTree(serialiseTree(tree))).toEqual(tree);
  });
});

describe("cv3d-swap: swapPaneTreeNodes", () => {
  it("swaps leaf positions, keeping id↔pane bound and each slot's sizePct", () => {
    const tree = root([leaf("a", 30), leaf("b", 20), leaf("c", 50)]);
    const r = swapPaneTreeNodes(tree, "a", "c");
    expect(r.ok).toBe(true);
    if (r.ok) {
      const kids = r.tree.children!;
      // Nodes trade position (id follows its pane); slot sizes stay put so
      // panel dimensions do not jump.
      expect(kids.map((n) => n.id)).toEqual(["c", "b", "a"]);
      expect(kids.map((n) => n.sizePct)).toEqual([30, 20, 50]);
      // Each leaf's id still matches the pane it hosts (naming invariant).
      expect(kids[0]!.paneIds).toEqual(["c"]);
      expect(kids[0]!.activeTabId).toBe("c");
      expect(kids[2]!.paneIds).toEqual(["a"]);
      expect(kids[2]!.activeTabId).toBe("a");
      expect(paneTreeToFlat(r.tree).paneOrder.sort()).toEqual(["a", "b", "c"]);
    }
  });

  it("swaps leaves across different parents, id following its pane", () => {
    const tree = root([
      leaf("a", 40),
      {
        id: "col",
        sizePct: 60,
        hidden: false,
        direction: "vertical",
        children: [leaf("b", 70), leaf("c", 30)],
      },
    ]);
    const r = swapPaneTreeNodes(tree, "a", "c");
    expect(r.ok).toBe(true);
    if (r.ok) {
      // "c" takes "a"'s slot at "a"'s size; "a" takes "c"'s slot at "c"'s size.
      expect(r.tree.children![0]!.id).toBe("c");
      expect(r.tree.children![0]!.sizePct).toBe(40);
      expect(r.tree.children![0]!.paneIds).toEqual(["c"]);
      const col = r.tree.children![1]!;
      expect(col.children!.map((n) => n.id)).toEqual(["b", "a"]);
      expect(col.children![1]!.sizePct).toBe(30);
      expect(col.children![1]!.paneIds).toEqual(["a"]);
    }
  });

  it("inherits slot geometry when swapping with a hidden leaf (Show here)", () => {
    const tree = root([
      leaf("assessment", 8),
      { ...leaf("body", 42), hidden: true },
      leaf("plan", 50),
    ]);
    const beforeSizes = tree.children!.map((n) => n.sizePct);
    const r = swapPaneTreeNodes(tree, "assessment", "body");
    expect(r.ok).toBe(true);
    if (r.ok) {
      const kids = r.tree.children!;
      // body moves into the visible slot (stays visible); assessment moves into
      // the hidden slot. Each id still matches its pane.
      expect(kids.map((n) => n.id)).toEqual(["body", "assessment", "plan"]);
      expect(kids.map((n) => n.sizePct)).toEqual(beforeSizes);
      expect(kids.map((n) => n.hidden)).toEqual([false, true, false]);
      expect(kids[0]!.paneIds).toEqual(["body"]);
      expect(kids[0]!.activeTabId).toBe("body");
      expect(kids[1]!.paneIds).toEqual(["assessment"]);
      // Visible child count unchanged — no rebalance collapse.
      expect(kids.filter((n) => !n.hidden)).toHaveLength(2);
    }
  });

  it("swaps multi-tab leaf identities as a unit", () => {
    const tabsA: PaneTreeNode = {
      id: "__tabs_a",
      sizePct: 40,
      hidden: false,
      paneIds: ["a", "x"],
      activeTabId: "x",
    };
    const tabsB: PaneTreeNode = {
      id: "__tabs_b",
      sizePct: 60,
      hidden: false,
      paneIds: ["b"],
      activeTabId: "b",
    };
    const r = swapPaneTreeNodes(root([tabsA, tabsB]), "__tabs_a", "__tabs_b");
    expect(r.ok).toBe(true);
    if (r.ok) {
      const [a, b] = r.tree.children!;
      // Each tabs node keeps its id + tabs, trading position/size only.
      expect(a!.id).toBe("__tabs_b");
      expect(a!.sizePct).toBe(40);
      expect(a!.paneIds).toEqual(["b"]);
      expect(a!.activeTabId).toBe("b");
      expect(b!.id).toBe("__tabs_a");
      expect(b!.sizePct).toBe(60);
      expect(b!.paneIds).toEqual(["a", "x"]);
      expect(b!.activeTabId).toBe("x");
    }
  });

  it("keeps ids pane-bound so a later single-pane insert cannot collide", () => {
    // Regression for the "Panel ids must be unique; id X used more than once"
    // crash: a slot-preserving swap that PINNED ids used to park pane "c" in a
    // slot still named "a". A subsequent edge drop then minted
    // makeSinglePaneLeaf("a"), colliding with that mis-named slot → two nodes
    // share id "a" → react-resizable-panels throws on render.
    const tree = root([leaf("a", 50), leaf("b", 25), leaf("c", 25)]);
    const swapped = swapPaneTreeNodes(tree, "a", "c");
    expect(swapped.ok).toBe(true);
    if (!swapped.ok) return;
    // Pop pane "a" out to a new east slot (mints makeSinglePaneLeaf("a")).
    const dropped = dropPaneIntoZone(swapped.tree, "a", "b", "east");
    expect(dropped.ok).toBe(true);
    if (!dropped.ok) return;
    const nodeIds: string[] = [];
    const walk = (n: PaneTreeNode) => {
      nodeIds.push(n.id);
      for (const c of n.children ?? []) walk(c);
    };
    walk(dropped.tree);
    // No two structural nodes share an id (would map to duplicate panel ids).
    expect(new Set(nodeIds).size).toBe(nodeIds.length);
  });

  it("pins panelKey to the geometric slot so DOM panel ids stay put", () => {
    const tree = root([leaf("a", 30), leaf("b", 20), leaf("c", 50)]);
    const r = swapPaneTreeNodes(tree, "a", "c");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const kids = r.tree.children!;
    // Content moved; swapped slots pin panelKey from the prior id there.
    // Untouched sibling "b" has no panelKey yet (DOM id falls back to node id).
    expect(kids.map((n) => n.id)).toEqual(["c", "b", "a"]);
    expect(kids.map((n) => n.panelKey)).toEqual(["a", undefined, "c"]);
    expect(kids.map((n) => n.panelKey ?? n.id)).toEqual(["a", "b", "c"]);
    // Second swap keeps the same slot keys (no remount churn).
    const r2 = swapPaneTreeNodes(r.tree, "c", "a");
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.tree.children!.map((n) => n.panelKey ?? n.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(r2.tree.children!.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  it("same id → no-op", () => {
    const tree = root([leaf("a"), leaf("b")]);
    const r = swapPaneTreeNodes(tree, "a", "a");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no-op");
  });

  it("missing id → not-found", () => {
    const tree = root([leaf("a"), leaf("b")]);
    const r = swapPaneTreeNodes(tree, "a", "zzz");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not-found");
  });

  it("refuses swapping a node with its own ancestor", () => {
    const tree = root([
      leaf("a", 40),
      {
        id: "col",
        sizePct: 60,
        hidden: false,
        direction: "vertical",
        children: [leaf("b", 70), leaf("c", 30)],
      },
    ]);
    const r = swapPaneTreeNodes(tree, "col", "b");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no-op");
  });
});

describe("cv3s-02: foundation.ts forbidden imports (P0-DL-4)", () => {
  const foundationPath = path.resolve(__dirname, "../foundation.ts");

  const forbiddenImportPatterns = [
    /from\s+["']@\/components\/patient-profile\/Shell/,
    /from\s+["'][^"']*customize-mode-context/,
    /from\s+["'][^"']*CustomizeBar/,
    /from\s+["'][^"']*PaneDropOverlay/,
  ];

  it("foundation.ts does not import forbidden modules", () => {
    const source = fs.readFileSync(foundationPath, "utf8");
    for (const pattern of forbiddenImportPatterns) {
      expect(source).not.toMatch(pattern);
    }
    expect(source).not.toMatch(/^import\s+["']react["']/m);
  });
});
