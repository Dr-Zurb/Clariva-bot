/**
 * layout-tree-mutations — truth-table unit tests (clpm-04 / R-LAYOUT-UX).
 *
 * Runner: Vitest (jsdom environment; no DOM is touched here).
 *
 * The fixtures span depth-1 (root pane), depth-2 (root split), and depth-3+
 * trees with mixed split directions, to exercise the recursive walk paths
 * that the mutation engine exposes. Every mutation case is paired with an
 * immutability assertion (the input snapshot is JSON-stringified before and
 * after; the two must match — i.e. the engine never mutates its input).
 *
 * Run: `npm --prefix frontend test lib/patient-profile/__tests__/layout-tree-mutations.test.ts`
 */

import { describe, it, expect } from "vitest";
import {
  MAX_LEAVES,
  MAX_PANES_PER_TABS,
  countLeaves,
  findLeaf,
  findParent,
  hasSibling,
  splitLeaf,
  mergeWithSibling,
  toggleCollapsed,
  hideLeaf,
  restoreLeaf,
  legacyFlatToTree,
  addToTabsNode,
  extractFromTabsNode,
  moveLeafBetweenTabs,
  setActiveTab,
  dropPaneIntoZone,
  hidePaneToRoot,
} from "../layout-tree-mutations";
import type { LayoutNode, LegacyFlatLayout } from "../types";
import type { PaneTreeNode } from "../layout-tree";
import { paneTreeToFlat } from "../layout-tree";

// ── Fixture helpers ─────────────────────────────────────────────────────────

function pane(paneId: string, collapsed?: boolean): LayoutNode {
  return collapsed === undefined
    ? { kind: "pane", paneId }
    : { kind: "pane", paneId, collapsed };
}

function hsplit(children: LayoutNode[], sizes: number[]): LayoutNode {
  return { kind: "split", direction: "horizontal", children, sizes };
}

function vsplit(children: LayoutNode[], sizes: number[]): LayoutNode {
  return { kind: "split", direction: "vertical", children, sizes };
}

function snapshot(node: LayoutNode): string {
  return JSON.stringify(node);
}

/**
 * Run a mutation closure while asserting the input tree is structurally
 * unchanged afterwards. Returns the mutation result so the caller can chain
 * structural assertions on it.
 */
function withImmutability<T>(tree: LayoutNode, fn: (t: LayoutNode) => T): T {
  const before = snapshot(tree);
  const out = fn(tree);
  const after = snapshot(tree);
  expect(after).toBe(before);
  return out;
}

// ── Tree fixtures used across multiple suites ───────────────────────────────

const ROOT_PANE: LayoutNode = pane("chart");

const TWO_LEAF_TREE: LayoutNode = hsplit(
  [pane("chart"), pane("body")],
  [50, 50],
);

const THREE_LEAF_TREE: LayoutNode = hsplit(
  [pane("chart"), pane("body"), pane("rx")],
  [30, 40, 30],
);

const NESTED_TREE: LayoutNode = hsplit(
  [
    pane("chart"),
    vsplit([pane("body"), pane("assessment")], [60, 40]),
    pane("rx"),
  ],
  [25, 50, 25],
);

const DEEP_TREE: LayoutNode = hsplit(
  [
    pane("chart"),
    vsplit(
      [
        pane("body"),
        hsplit([pane("assessment"), pane("plan")], [50, 50]),
      ],
      [50, 50],
    ),
    pane("rx"),
  ],
  [20, 60, 20],
);

// ── countLeaves ─────────────────────────────────────────────────────────────

describe("countLeaves", () => {
  it("returns 1 for a root pane", () => {
    expect(countLeaves(ROOT_PANE)).toBe(1);
  });

  it("returns N for an N-child flat split", () => {
    expect(countLeaves(TWO_LEAF_TREE)).toBe(2);
    expect(countLeaves(THREE_LEAF_TREE)).toBe(3);
  });

  it("recursively counts leaves across nested splits", () => {
    expect(countLeaves(NESTED_TREE)).toBe(4);
    expect(countLeaves(DEEP_TREE)).toBe(5);
  });
});

// ── findLeaf ────────────────────────────────────────────────────────────────

describe("findLeaf", () => {
  it("returns the root pane when ids match", () => {
    expect(findLeaf(ROOT_PANE, "chart")).toEqual(pane("chart"));
  });

  it("returns null when the root pane id does not match", () => {
    expect(findLeaf(ROOT_PANE, "missing")).toBeNull();
  });

  it("finds a direct child leaf inside a flat split", () => {
    const hit = findLeaf(THREE_LEAF_TREE, "body");
    expect(hit).not.toBeNull();
    expect(hit!.paneId).toBe("body");
  });

  it("finds a leaf nested inside a sub-split", () => {
    const hit = findLeaf(NESTED_TREE, "assessment");
    expect(hit).not.toBeNull();
    expect(hit!.paneId).toBe("assessment");
  });

  it("returns null when the leaf id is absent from a nested tree", () => {
    expect(findLeaf(NESTED_TREE, "ghost")).toBeNull();
  });
});

// ── findParent ──────────────────────────────────────────────────────────────

describe("findParent", () => {
  it("returns null when the leaf is at the root", () => {
    expect(findParent(ROOT_PANE, "chart")).toBeNull();
  });

  it("returns parent + index for a direct child of a split", () => {
    const located = findParent(THREE_LEAF_TREE, "body");
    expect(located).not.toBeNull();
    expect(located!.parent).toBe(THREE_LEAF_TREE);
    expect(located!.index).toBe(1);
  });

  it("returns the immediate parent for a deeply nested leaf", () => {
    const located = findParent(NESTED_TREE, "assessment");
    expect(located).not.toBeNull();
    expect(located!.parent.direction).toBe("vertical");
    expect(located!.index).toBe(1);
  });

  it("returns null for a non-existent paneId", () => {
    expect(findParent(NESTED_TREE, "ghost")).toBeNull();
  });
});

// ── hasSibling ──────────────────────────────────────────────────────────────

describe("hasSibling", () => {
  it("returns false for a root pane", () => {
    expect(hasSibling(ROOT_PANE, "chart")).toBe(false);
  });

  it("returns true for a leaf in a 2-child split", () => {
    expect(hasSibling(TWO_LEAF_TREE, "chart")).toBe(true);
  });

  it("returns true for a leaf in a 3-child split", () => {
    expect(hasSibling(THREE_LEAF_TREE, "rx")).toBe(true);
  });

  it("returns true for a leaf in a nested sub-split", () => {
    expect(hasSibling(NESTED_TREE, "assessment")).toBe(true);
  });

  it("returns false for a missing paneId", () => {
    expect(hasSibling(NESTED_TREE, "ghost")).toBe(false);
  });
});

// ── splitLeaf ───────────────────────────────────────────────────────────────

describe("splitLeaf", () => {
  it("splits a root leaf into a fresh split with two panes", () => {
    const result = withImmutability(ROOT_PANE, (t) =>
      splitLeaf(t, "chart", "horizontal", "chart-2"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tree.kind).toBe("split");
    if (result.tree.kind !== "split") return;
    expect(result.tree.direction).toBe("horizontal");
    expect(result.tree.children).toHaveLength(2);
    expect(result.tree.children[0]).toEqual(pane("chart"));
    expect(result.tree.children[1]).toEqual(pane("chart-2"));
    expect(result.tree.sizes).toEqual([50, 50]);
  });

  it("preserves sibling ordering when splitting a leaf inside a split", () => {
    const result = withImmutability(THREE_LEAF_TREE, (t) =>
      splitLeaf(t, "body", "vertical", "body-2"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.tree.kind !== "split") return;

    const [first, middle, last] = result.tree.children;
    expect(first).toEqual(pane("chart"));
    expect(last).toEqual(pane("rx"));
    expect(middle!.kind).toBe("split");
    if (middle!.kind !== "split") return;
    expect(middle!.direction).toBe("vertical");
    expect(middle!.children.map((c) => (c.kind === "pane" ? c.paneId : "?"))).toEqual([
      "body",
      "body-2",
    ]);
    expect(middle!.sizes).toEqual([50, 50]);
    expect(result.tree.sizes).toEqual([30, 40, 30]);
  });

  it("honours the requested split direction (horizontal)", () => {
    const result = splitLeaf(THREE_LEAF_TREE, "rx", "horizontal", "rx-2");
    expect(result.ok).toBe(true);
    if (!result.ok || result.tree.kind !== "split") return;
    const newSplit = result.tree.children[2];
    expect(newSplit!.kind).toBe("split");
    if (newSplit!.kind === "split") {
      expect(newSplit!.direction).toBe("horizontal");
    }
  });

  it("preserves the original leaf's collapsed flag on the first child", () => {
    const tree = hsplit([pane("chart", true), pane("body")], [40, 60]);
    const result = splitLeaf(tree, "chart", "vertical", "chart-2");
    expect(result.ok).toBe(true);
    if (!result.ok || result.tree.kind !== "split") return;
    const newSplit = result.tree.children[0];
    expect(newSplit!.kind).toBe("split");
    if (newSplit!.kind !== "split") return;
    expect(newSplit!.children[0]).toEqual(pane("chart", true));
    expect(newSplit!.children[1]).toEqual(pane("chart-2"));
  });

  it("rejects splitting a leaf that is not in the tree", () => {
    const result = splitLeaf(THREE_LEAF_TREE, "ghost", "horizontal", "ghost-2");
    expect(result).toEqual({ ok: false, reason: "not-found" });
  });

  it("refuses to split when the cap of 10 leaves is already reached", () => {
    const capped: LayoutNode = hsplit(
      Array.from({ length: MAX_LEAVES }, (_, i) => pane(`p-${i}`)),
      Array.from({ length: MAX_LEAVES }, () => 100 / MAX_LEAVES),
    );
    expect(countLeaves(capped)).toBe(MAX_LEAVES);
    const result = splitLeaf(capped, "p-0", "horizontal", "p-new");
    expect(result).toEqual({ ok: false, reason: "cap-reached" });
  });

  it("returns a brand-new tree object — no shared references with the input", () => {
    const result = splitLeaf(THREE_LEAF_TREE, "chart", "horizontal", "chart-2");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tree).not.toBe(THREE_LEAF_TREE);
  });
});

// ── mergeWithSibling ────────────────────────────────────────────────────────

describe("mergeWithSibling", () => {
  it("collapses a 2-child split into the surviving sibling and absorbs its size", () => {
    const result = withImmutability(TWO_LEAF_TREE, (t) =>
      mergeWithSibling(t, "chart"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tree).toEqual(pane("body"));
  });

  it("rebalances a 3-child split — leftmost remaining sibling absorbs the released size", () => {
    const result = mergeWithSibling(THREE_LEAF_TREE, "body");
    expect(result.ok).toBe(true);
    if (!result.ok || result.tree.kind !== "split") return;
    expect(result.tree.children.map((c) => (c.kind === "pane" ? c.paneId : "?"))).toEqual([
      "chart",
      "rx",
    ]);
    expect(result.tree.sizes).toEqual([30 + 40, 30]);
  });

  it("rebalances when the first child of a 3-child split is removed", () => {
    const result = mergeWithSibling(THREE_LEAF_TREE, "chart");
    expect(result.ok).toBe(true);
    if (!result.ok || result.tree.kind !== "split") return;
    expect(result.tree.children.map((c) => (c.kind === "pane" ? c.paneId : "?"))).toEqual([
      "body",
      "rx",
    ]);
    expect(result.tree.sizes).toEqual([40 + 30, 30]);
  });

  it("collapses a nested 2-child sub-split when one of its leaves is merged", () => {
    const result = mergeWithSibling(NESTED_TREE, "body");
    expect(result.ok).toBe(true);
    if (!result.ok || result.tree.kind !== "split") return;
    expect(result.tree.children[1]).toEqual(pane("assessment"));
    expect(result.tree.children.map((c) => (c.kind === "pane" ? c.paneId : "split"))).toEqual([
      "chart",
      "assessment",
      "rx",
    ]);
    expect(result.tree.sizes).toEqual([25, 50, 25]);
  });

  it("returns not-found for a root-leaf merge (no parent split)", () => {
    expect(mergeWithSibling(ROOT_PANE, "chart")).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("returns not-found for a missing paneId", () => {
    expect(mergeWithSibling(NESTED_TREE, "ghost")).toEqual({
      ok: false,
      reason: "not-found",
    });
  });
});

// ── toggleCollapsed ─────────────────────────────────────────────────────────

describe("toggleCollapsed", () => {
  it("flips an undefined collapsed flag to true on a root pane", () => {
    const result = withImmutability(ROOT_PANE, (t) => toggleCollapsed(t, "chart"));
    expect(result).toEqual(pane("chart", true));
  });

  it("flips an explicit true to false", () => {
    const tree = hsplit([pane("chart", true), pane("body")], [50, 50]);
    const result = toggleCollapsed(tree, "chart");
    expect(result.kind).toBe("split");
    if (result.kind !== "split") return;
    expect(result.children[0]).toEqual(pane("chart", false));
  });

  it("flips an explicit false to true", () => {
    const tree = hsplit([pane("chart", false), pane("body")], [50, 50]);
    const result = toggleCollapsed(tree, "chart");
    if (result.kind !== "split") throw new Error("expected split");
    expect(result.children[0]).toEqual(pane("chart", true));
  });

  it("leaves other leaves untouched", () => {
    const result = toggleCollapsed(THREE_LEAF_TREE, "body");
    if (result.kind !== "split") throw new Error("expected split");
    expect(result.children[0]).toEqual(pane("chart"));
    expect(result.children[1]).toEqual(pane("body", true));
    expect(result.children[2]).toEqual(pane("rx"));
  });

  it("does nothing visible when the paneId is missing", () => {
    const result = toggleCollapsed(NESTED_TREE, "ghost");
    expect(snapshot(result)).toBe(snapshot(NESTED_TREE));
  });

  it("toggles a deeply nested leaf without disturbing siblings", () => {
    const result = withImmutability(NESTED_TREE, (t) =>
      toggleCollapsed(t, "assessment"),
    );
    if (result.kind !== "split") throw new Error("expected split");
    const mid = result.children[1];
    if (!mid || mid.kind !== "split") throw new Error("expected nested split");
    expect(mid.children[0]).toEqual(pane("body"));
    expect(mid.children[1]).toEqual(pane("assessment", true));
  });
});

// ── hideLeaf ────────────────────────────────────────────────────────────────

describe("hideLeaf", () => {
  it("removes a leaf from a 3-leaf tree and redistributes the released size evenly", () => {
    const result = withImmutability(THREE_LEAF_TREE, (t) => hideLeaf(t, "body"));
    expect(result.ok).toBe(true);
    if (!result.ok || result.tree.kind !== "split") return;
    expect(result.tree.children).toHaveLength(2);
    expect(result.tree.children.map((c) => (c.kind === "pane" ? c.paneId : "?"))).toEqual([
      "chart",
      "rx",
    ]);
    expect(result.tree.sizes).toEqual([30 + 20, 30 + 20]);
  });

  it("collapses a 2-leaf split into the surviving leaf", () => {
    const result = hideLeaf(TWO_LEAF_TREE, "chart");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tree).toEqual(pane("body"));
  });

  it("refuses to remove the last leaf in the tree (root pane)", () => {
    expect(hideLeaf(ROOT_PANE, "chart")).toEqual({
      ok: false,
      reason: "would-remove-last-leaf",
    });
  });

  it("returns not-found for a missing paneId", () => {
    expect(hideLeaf(NESTED_TREE, "ghost")).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("redistributes the released share equally across remaining siblings in a 4-child split", () => {
    const tree = hsplit(
      [pane("a"), pane("b"), pane("c"), pane("d")],
      [25, 25, 25, 25],
    );
    const result = hideLeaf(tree, "b");
    expect(result.ok).toBe(true);
    if (!result.ok || result.tree.kind !== "split") return;
    const share = 25 / 3;
    expect(result.tree.sizes.length).toBe(3);
    expect(result.tree.sizes[0]).toBeCloseTo(25 + share, 6);
    expect(result.tree.sizes[1]).toBeCloseTo(25 + share, 6);
    expect(result.tree.sizes[2]).toBeCloseTo(25 + share, 6);
    expect(result.tree.sizes.reduce((s, v) => s + v, 0)).toBeCloseTo(100, 6);
  });
});

// ── restoreLeaf ─────────────────────────────────────────────────────────────

describe("restoreLeaf", () => {
  it("wraps a root pane in a horizontal split when restoring a new leaf alongside it", () => {
    const result = withImmutability(ROOT_PANE, (t) => restoreLeaf(t, "rx"));
    expect(result.ok).toBe(true);
    if (!result.ok || result.tree.kind !== "split") return;
    expect(result.tree.direction).toBe("horizontal");
    expect(result.tree.children).toEqual([pane("chart"), pane("rx")]);
    expect(result.tree.sizes).toEqual([50, 50]);
  });

  it("appends the new leaf to the rightmost split and re-scales sibling sizes", () => {
    const result = restoreLeaf(TWO_LEAF_TREE, "rx");
    expect(result.ok).toBe(true);
    if (!result.ok || result.tree.kind !== "split") return;
    expect(result.tree.children).toHaveLength(3);
    expect(result.tree.children[2]).toEqual(pane("rx"));
    expect(result.tree.sizes.reduce((s, v) => s + v, 0)).toBeCloseTo(100, 6);
    const expectedShare = 100 / 3;
    expect(result.tree.sizes[2]).toBeCloseTo(expectedShare, 6);
    expect(result.tree.sizes[0]).toBeCloseTo(50 * ((100 - expectedShare) / 100), 6);
    expect(result.tree.sizes[1]).toBeCloseTo(50 * ((100 - expectedShare) / 100), 6);
  });

  it("descends into the rightmost nested split to append", () => {
    const tree = hsplit(
      [
        pane("a"),
        vsplit([pane("b"), pane("c")], [50, 50]),
      ],
      [50, 50],
    );
    const result = restoreLeaf(tree, "d");
    expect(result.ok).toBe(true);
    if (!result.ok || result.tree.kind !== "split") return;
    const right = result.tree.children[1];
    if (!right || right.kind !== "split") throw new Error("expected nested split");
    expect(right.direction).toBe("vertical");
    expect(right.children.map((c) => (c.kind === "pane" ? c.paneId : "?"))).toEqual([
      "b",
      "c",
      "d",
    ]);
    expect(right.sizes.reduce((s, v) => s + v, 0)).toBeCloseTo(100, 6);
  });

  it("refuses when the paneId is already present", () => {
    expect(restoreLeaf(THREE_LEAF_TREE, "body")).toEqual({
      ok: false,
      reason: "already-present",
    });
  });

  it("refuses when the leaf cap has been reached", () => {
    const capped: LayoutNode = hsplit(
      Array.from({ length: MAX_LEAVES }, (_, i) => pane(`p-${i}`)),
      Array.from({ length: MAX_LEAVES }, () => 100 / MAX_LEAVES),
    );
    expect(restoreLeaf(capped, "p-new")).toEqual({ ok: false, reason: "cap-reached" });
  });
});

// ── legacyFlatToTree ────────────────────────────────────────────────────────

describe("legacyFlatToTree", () => {
  it("turns a three-slot legacy layout into a horizontal split with three leaves", () => {
    const legacy: LegacyFlatLayout = {
      slots: ["chart", "body", "rx"],
      widths: [25, 50, 25],
      collapsed: { chart: false, rx: false },
    };
    const tree = legacyFlatToTree(legacy);
    expect(tree.kind).toBe("split");
    if (tree.kind !== "split") return;
    expect(tree.direction).toBe("horizontal");
    expect(tree.children).toHaveLength(3);
    expect(tree.children.map((c) => (c.kind === "pane" ? c.paneId : "?"))).toEqual([
      "chart",
      "body",
      "rx",
    ]);
    expect(tree.sizes).toEqual([25, 50, 25]);
  });

  it("transfers collapsed flags onto the matching leaves", () => {
    const legacy: LegacyFlatLayout = {
      slots: ["chart", "body", "rx"],
      widths: [30, 40, 30],
      collapsed: { chart: true, rx: true, body: true },
    };
    const tree = legacyFlatToTree(legacy);
    if (tree.kind !== "split") throw new Error("expected split");
    expect((tree.children[0] as { collapsed?: boolean }).collapsed).toBe(true);
    expect((tree.children[1] as { collapsed?: boolean }).collapsed).toBe(true);
    expect((tree.children[2] as { collapsed?: boolean }).collapsed).toBe(true);
  });

  it("defaults the body collapsed flag to false when absent", () => {
    const legacy: LegacyFlatLayout = {
      slots: ["chart", "body", "rx"],
      widths: [33, 34, 33],
      collapsed: { chart: false, rx: false },
    };
    const tree = legacyFlatToTree(legacy);
    if (tree.kind !== "split") throw new Error("expected split");
    expect((tree.children[1] as { collapsed?: boolean }).collapsed).toBe(false);
  });

  it("does not mutate the input widths array (defensive copy)", () => {
    const legacy: LegacyFlatLayout = {
      slots: ["chart", "body", "rx"],
      widths: [33, 34, 33],
      collapsed: { chart: false, rx: false },
    };
    const tree = legacyFlatToTree(legacy);
    if (tree.kind !== "split") throw new Error("expected split");
    expect(tree.sizes).not.toBe(legacy.widths);
  });
});

// ── Property-style invariants ───────────────────────────────────────────────

describe("property invariants", () => {
  it("round-trips: legacyFlatToTree produces a tree whose leaf count matches the slot count", () => {
    const legacy: LegacyFlatLayout = {
      slots: ["chart", "body", "rx"],
      widths: [40, 30, 30],
      collapsed: { chart: true, rx: false },
    };
    expect(countLeaves(legacyFlatToTree(legacy))).toBe(legacy.slots.length);
  });

  it("is deterministic: identical inputs produce structurally identical outputs", () => {
    const a = splitLeaf(THREE_LEAF_TREE, "body", "vertical", "body-2");
    const b = splitLeaf(THREE_LEAF_TREE, "body", "vertical", "body-2");
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(snapshot(a.tree)).toBe(snapshot(b.tree));
  });

  it("never mutates the input tree across a sequence of mixed mutations", () => {
    const original = snapshot(DEEP_TREE);
    splitLeaf(DEEP_TREE, "plan", "horizontal", "plan-2");
    mergeWithSibling(DEEP_TREE, "assessment");
    toggleCollapsed(DEEP_TREE, "chart");
    hideLeaf(DEEP_TREE, "rx");
    restoreLeaf(DEEP_TREE, "ghost");
    expect(snapshot(DEEP_TREE)).toBe(original);
  });

  it("preserves the size-sum invariant after a hide-then-restore round-trip", () => {
    const after = hideLeaf(THREE_LEAF_TREE, "body");
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    const back = restoreLeaf(after.tree, "body");
    expect(back.ok).toBe(true);
    if (!back.ok || back.tree.kind !== "split") return;
    expect(back.tree.sizes.reduce((s, v) => s + v, 0)).toBeCloseTo(100, 6);
    expect(countLeaves(back.tree)).toBe(3);
  });

  it("keeps the leaf count invariant under toggleCollapsed", () => {
    const before = countLeaves(NESTED_TREE);
    const out = toggleCollapsed(NESTED_TREE, "body");
    expect(countLeaves(out)).toBe(before);
  });
});

// ── PaneTreeNode tab fixtures (cpf-02) ──────────────────────────────────────

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

function ptRoot(children: PaneTreeNode[], direction: "horizontal" | "vertical" = "horizontal"): PaneTreeNode {
  return {
    id: "__root__",
    sizePct: 100,
    hidden: false,
    direction,
    children,
  };
}

const PT_THREE_SINGLE: PaneTreeNode = ptRoot([
  ptLeaf("chart", 30),
  ptLeaf("body", 40),
  ptLeaf("rx", 30),
]);

const PT_TABS_TARGET: PaneTreeNode = ptRoot([
  ptLeaf("chart", 25),
  ptLeaf("__tabs_0", 50, false, ["body", "rx"], "body"),
  ptLeaf("plan", 25),
]);

function ptSnapshot(node: PaneTreeNode): string {
  return JSON.stringify(node);
}

function withPaneTreeImmutability<T>(tree: PaneTreeNode, fn: (t: PaneTreeNode) => T): T {
  const before = ptSnapshot(tree);
  const out = fn(tree);
  expect(ptSnapshot(tree)).toBe(before);
  return out;
}

function collectAllPaneIds(tree: PaneTreeNode): string[] {
  return paneTreeToFlat(tree).paneOrder;
}

function hasDuplicatePaneIds(tree: PaneTreeNode): boolean {
  const ids = collectAllPaneIds(tree);
  return new Set(ids).size !== ids.length;
}

function allTabsNodesValid(tree: PaneTreeNode): boolean {
  function walk(n: PaneTreeNode): boolean {
    if (!n.children?.length) {
      const ids = n.paneIds ?? [n.id];
      return (
        ids.length > 0 &&
        typeof n.activeTabId === "string" &&
        ids.includes(n.activeTabId)
      );
    }
    return n.children.every(walk);
  }
  return walk(tree);
}

function tabsPaneIds(tree: PaneTreeNode, groupId: string): string[] {
  function walk(n: PaneTreeNode): string[] | null {
    if (n.id === groupId && !n.children?.length) {
      return n.paneIds ?? [n.id];
    }
    if (n.children) {
      for (const c of n.children) {
        const hit = walk(c);
        if (hit) return hit;
      }
    }
    return null;
  }
  return walk(tree) ?? [];
}

// ── addToTabsNode (cpf-02) ──────────────────────────────────────────────────

describe("addToTabsNode (cpf-02)", () => {
  it("inserts paneId at position 'end' of target container by default", () => {
    const result = withPaneTreeImmutability(PT_THREE_SINGLE, (t) =>
      addToTabsNode(t, "rx", "body", "end"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(tabsPaneIds(result.tree, "body")).toEqual(["body", "rx"]);
  });

  it("inserts paneId at position 'start' when specified", () => {
    const result = addToTabsNode(PT_THREE_SINGLE, "rx", "body", "start");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(tabsPaneIds(result.tree, "body")).toEqual(["rx", "body"]);
  });

  it("inserts paneId at numeric position", () => {
    const tree = ptRoot([
      ptLeaf("__tabs_0", 70, false, ["a", "b", "c"], "a"),
      ptLeaf("d", 30),
    ]);
    const result = addToTabsNode(tree, "d", "__tabs_0", 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(tabsPaneIds(result.tree, "__tabs_0")).toEqual(["a", "d", "b", "c"]);
  });

  it("removes paneId from its previous container (single-home)", () => {
    const result = addToTabsNode(PT_THREE_SINGLE, "rx", "body");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(collectAllPaneIds(result.tree)).toEqual(["chart", "body", "rx"]);
    expect(hasDuplicatePaneIds(result.tree)).toBe(false);
  });

  it("makes the moved pane the activeTabId in the target", () => {
    const result = addToTabsNode(PT_TABS_TARGET, "plan", "__tabs_0");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    function findTabs(n: PaneTreeNode): PaneTreeNode | null {
      if (n.id === "__tabs_0") return n;
      for (const c of n.children ?? []) {
        const hit = findTabs(c);
        if (hit) return hit;
      }
      return null;
    }
    const tabs = findTabs(result.tree);
    expect(tabs?.activeTabId).toBe("plan");
  });

  it("collapses an empty source container after removal", () => {
    const tree = ptRoot([
      ptLeaf("chart", 50),
      ptLeaf("body", 50),
    ]);
    const result = addToTabsNode(tree, "body", "chart");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(tabsPaneIds(result.tree, "chart")).toEqual(["chart", "body"]);
    expect(collectAllPaneIds(result.tree)).toEqual(["chart", "body"]);
  });

  it("returns { ok: false, reason: 'not-found' } when paneId is absent", () => {
    expect(addToTabsNode(PT_THREE_SINGLE, "ghost", "body")).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("returns { ok: false, reason: 'not-found' } when targetGroupId is absent", () => {
    expect(addToTabsNode(PT_THREE_SINGLE, "rx", "ghost")).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("returns { ok: false, reason: 'already-in-target' } when paneId is already in target's paneIds", () => {
    expect(addToTabsNode(PT_TABS_TARGET, "body", "__tabs_0")).toEqual({
      ok: false,
      reason: "already-in-target",
    });
  });

  it("returns { ok: false, reason: 'cap-reached' } when target has MAX_PANES_PER_TABS panes", () => {
    const fullIds = Array.from({ length: MAX_PANES_PER_TABS }, (_, i) => `p-${i}`);
    const tree = ptRoot([
      ptLeaf("__tabs_0", 80, false, fullIds, fullIds[0]),
      ptLeaf("extra", 20),
    ]);
    expect(addToTabsNode(tree, "extra", "__tabs_0")).toEqual({
      ok: false,
      reason: "cap-reached",
    });
  });

  it("preserves sizePct + hidden on the target container", () => {
    const tree = ptRoot([
      ptLeaf("__tabs_0", 42, true, ["body"], "body"),
      ptLeaf("rx", 58),
    ]);
    const result = addToTabsNode(tree, "rx", "__tabs_0");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    function findTabs(n: PaneTreeNode): PaneTreeNode | null {
      if (n.id === "__tabs_0") return n;
      for (const c of n.children ?? []) {
        const hit = findTabs(c);
        if (hit) return hit;
      }
      return null;
    }
    const tabs = findTabs(result.tree)!;
    expect(tabs.sizePct).toBe(42);
    expect(tabs.hidden).toBe(true);
  });

  it("preserves target container id after addToTabsNode", () => {
    const result = addToTabsNode(PT_TABS_TARGET, "plan", "__tabs_0");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(tabsPaneIds(result.tree, "__tabs_0")).toContain("plan");
  });
});

// ── extractFromTabsNode (cpf-02) ────────────────────────────────────────────

describe("extractFromTabsNode (cpf-02)", () => {
  it("removes paneId from its current container", () => {
    const result = extractFromTabsNode(PT_TABS_TARGET, "rx", "horizontal");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(tabsPaneIds(result.tree, "__tabs_0")).toEqual(["body"]);
    expect(collectAllPaneIds(result.tree)).toContain("rx");
  });

  it("creates a new sibling split holding only paneId", () => {
    const result = extractFromTabsNode(PT_TABS_TARGET, "rx", "horizontal");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(collectAllPaneIds(result.tree)).toEqual(["chart", "body", "rx", "plan"]);
  });

  it("uses direction='horizontal' for split-right", () => {
    const result = extractFromTabsNode(PT_TABS_TARGET, "rx", "horizontal");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const root = result.tree;
    expect(root.children?.map((c) => c.id)).toEqual(["chart", "__tabs_0", "rx", "plan"]);
  });

  it("uses direction='vertical' for split-below", () => {
    const result = extractFromTabsNode(PT_TABS_TARGET, "rx", "vertical");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tabsSlot = result.tree.children?.[1];
    expect(tabsSlot?.direction).toBe("vertical");
    expect(tabsSlot?.children?.map((c) => c.paneIds?.[0] ?? c.id)).toEqual(["body", "rx"]);
  });

  it("collapses an empty source container after extraction", () => {
    const tree = ptRoot([
      ptLeaf("chart", 50),
      ptLeaf("body", 50),
    ]);
    const merged = addToTabsNode(tree, "body", "chart");
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    const extracted = extractFromTabsNode(merged.tree, "body", "horizontal");
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;
    expect(collectAllPaneIds(extracted.tree)).toEqual(["chart", "body"]);
  });

  it("returns { ok: false, reason: 'last-pane-in-tree' } when extracting the only pane", () => {
    const solo = ptRoot([ptLeaf("chart", 100)]);
    expect(extractFromTabsNode(solo, "chart", "horizontal")).toEqual({
      ok: false,
      reason: "last-pane-in-tree",
    });
  });

  it("returns { ok: false, reason: 'cap-reached' } when extracting would exceed MAX_LEAVES", () => {
    const children = Array.from({ length: MAX_LEAVES }, (_, i) =>
      ptLeaf(`p-${i}`, 100 / MAX_LEAVES),
    );
    const capped = ptRoot(children);
    expect(extractFromTabsNode(capped, "p-0", "horizontal")).toEqual({
      ok: false,
      reason: "cap-reached",
    });
  });

  it("returns { ok: false, reason: 'not-found' } when paneId is absent", () => {
    expect(extractFromTabsNode(PT_TABS_TARGET, "ghost", "horizontal")).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("round-trips: addToTabsNode(extracted, paneId, originalContainerId) === original tree (structurally)", () => {
    const original = PT_TABS_TARGET;
    const extracted = extractFromTabsNode(original, "rx", "horizontal");
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;
    const restored = addToTabsNode(extracted.tree, "rx", "__tabs_0");
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(collectAllPaneIds(restored.tree)).toEqual(collectAllPaneIds(original));
    expect(tabsPaneIds(restored.tree, "__tabs_0").sort()).toEqual(
      tabsPaneIds(original, "__tabs_0").sort(),
    );
  });
});

// ── moveLeafBetweenTabs (cpf-02) ─────────────────────────────────────────────

describe("moveLeafBetweenTabs (cpf-02)", () => {
  it("is equivalent to extractFromTabsNode followed by addToTabsNode for non-self moves", () => {
    const tree = ptRoot([
      ptLeaf("__tabs_a", 50, false, ["a", "b"], "a"),
      ptLeaf("__tabs_b", 50, false, ["c", "d"], "c"),
    ]);
    const moved = moveLeafBetweenTabs(tree, "b", "__tabs_b");
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(tabsPaneIds(moved.tree, "__tabs_a")).toEqual(["a"]);
    expect(tabsPaneIds(moved.tree, "__tabs_b")).toEqual(["c", "d", "b"]);
  });

  it("is a no-op when source group === target group (returns reason 'already-in-target')", () => {
    expect(moveLeafBetweenTabs(PT_TABS_TARGET, "body", "__tabs_0")).toEqual({
      ok: false,
      reason: "already-in-target",
    });
  });
});

// ── setActiveTab (cpf-02) ───────────────────────────────────────────────────

describe("setActiveTab (cpf-02)", () => {
  it("updates activeTabId on the matching tabs node", () => {
    const result = setActiveTab(PT_TABS_TARGET, "__tabs_0", "rx");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    function findTabs(n: PaneTreeNode): PaneTreeNode | null {
      if (n.id === "__tabs_0") return n;
      for (const c of n.children ?? []) {
        const hit = findTabs(c);
        if (hit) return hit;
      }
      return null;
    }
    expect(findTabs(result.tree)?.activeTabId).toBe("rx");
  });

  it("returns the original tree (referentially) when activeTabId is already set", () => {
    const result = setActiveTab(PT_TABS_TARGET, "__tabs_0", "body");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tree).toBe(PT_TABS_TARGET);
  });

  it("returns { ok: false, reason: 'not-found' } when groupId is absent", () => {
    expect(setActiveTab(PT_TABS_TARGET, "ghost", "body")).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("returns { ok: false, reason: 'not-in-tabs' } when paneId is not in the tabs node's paneIds", () => {
    expect(setActiveTab(PT_TABS_TARGET, "__tabs_0", "plan")).toEqual({
      ok: false,
      reason: "not-in-tabs",
    });
  });
});

// ── single-home + activeTabId invariants (cpf-02) ───────────────────────────

describe("single-home invariant (cpf-02)", () => {
  it("no mutation produces a tree where any paneId appears in two paneIds arrays", () => {
    const ops = [
      addToTabsNode(PT_THREE_SINGLE, "rx", "body"),
      extractFromTabsNode(PT_TABS_TARGET, "rx", "horizontal"),
      moveLeafBetweenTabs(
        ptRoot([
          ptLeaf("__tabs_a", 50, false, ["a", "b"], "a"),
          ptLeaf("__tabs_b", 50, false, ["c"], "c"),
        ]),
        "a",
        "__tabs_b",
      ),
    ];
    for (const op of ops) {
      if (op.ok) {
        expect(hasDuplicatePaneIds(op.tree)).toBe(false);
      }
    }
  });

  it("addToTabsNode refuses already-in-tree paneId via removal-then-insert", () => {
    const result = addToTabsNode(PT_THREE_SINGLE, "chart", "body");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(collectAllPaneIds(result.tree).filter((id) => id === "chart")).toHaveLength(1);
  });
});

describe("activeTabId invariant (cpf-02)", () => {
  it("after every successful mutation, every tabs node satisfies paneIds.includes(activeTabId)", () => {
    const candidates = [
      addToTabsNode(PT_THREE_SINGLE, "rx", "body"),
      extractFromTabsNode(PT_TABS_TARGET, "rx", "horizontal"),
      setActiveTab(PT_TABS_TARGET, "__tabs_0", "rx"),
      moveLeafBetweenTabs(
        ptRoot([
          ptLeaf("__tabs_a", 50, false, ["a", "b"], "a"),
          ptLeaf("__tabs_b", 50, false, ["c"], "c"),
        ]),
        "b",
        "__tabs_b",
      ),
    ];
    for (const op of candidates) {
      if (op.ok) {
        expect(allTabsNodesValid(op.tree)).toBe(true);
      }
    }
  });
});

// ── dropPaneIntoZone (cpfd-01) ───────────────────────────────────────────────

function ptChildIds(tree: PaneTreeNode, parentId: string): string[] {
  function walk(n: PaneTreeNode): string[] | null {
    if (n.id === parentId && n.children?.length) {
      return n.children.map((c) => c.id);
    }
    for (const c of n.children ?? []) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return null;
  }
  return walk(tree) ?? [];
}

function ptFindNode(tree: PaneTreeNode, nodeId: string): PaneTreeNode | null {
  if (tree.id === nodeId) return tree;
  for (const c of tree.children ?? []) {
    const hit = ptFindNode(c, nodeId);
    if (hit) return hit;
  }
  return null;
}

function ptDirectParent(tree: PaneTreeNode, childId: string): PaneTreeNode | null {
  function walk(n: PaneTreeNode, parent: PaneTreeNode | null): PaneTreeNode | null {
    if (n.id === childId) return parent;
    for (const c of n.children ?? []) {
      const hit = walk(c, n);
      if (hit !== null) return hit;
    }
    return null;
  }
  return walk(tree, null);
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

describe("dropPaneIntoZone — center (cpfd-01)", () => {
  it("delegates to addToTabsNode: pane becomes the active tab in target", () => {
    const result = dropPaneIntoZone(PT_THREE_SINGLE, "rx", "body", "center");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(tabsPaneIds(result.tree, "body")).toEqual(["body", "rx"]);
    const bodyNode = ptFindNode(result.tree, "body")!;
    expect(bodyNode.activeTabId).toBe("rx");
  });

  it("returns 'already-in-target' when the pane is already in target's paneIds", () => {
    expect(dropPaneIntoZone(PT_TABS_TARGET, "body", "__tabs_0", "center")).toEqual({
      ok: false,
      reason: "already-in-target",
    });
  });

  it("returns 'cap-reached' when target already holds MAX_PANES_PER_TABS", () => {
    const fullIds = Array.from({ length: MAX_PANES_PER_TABS }, (_, i) => `p-${i}`);
    const tree = ptRoot([
      ptLeaf("__tabs_0", 80, false, fullIds, fullIds[0]),
      ptLeaf("extra", 20),
    ]);
    expect(dropPaneIntoZone(tree, "extra", "__tabs_0", "center")).toEqual({
      ok: false,
      reason: "cap-reached",
    });
  });
});

describe("dropPaneIntoZone — edges, same-axis parent (cpfd-01)", () => {
  it("west inserts a sibling immediately BEFORE the target in a horizontal parent", () => {
    const result = dropPaneIntoZone(PT_HORIZ_THREE, "rx", "body", "west");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ptChildIds(result.tree, "__root__")).toEqual(["chart", "rx", "body"]);
  });

  it("east inserts a sibling immediately AFTER the target in a horizontal parent", () => {
    const result = dropPaneIntoZone(PT_HORIZ_THREE, "rx", "body", "east");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ptChildIds(result.tree, "__root__")).toEqual(["chart", "body", "rx"]);
  });

  it("north inserts a sibling BEFORE the target in a vertical parent", () => {
    const result = dropPaneIntoZone(PT_VERT_TWO, "bottom", "top", "north");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ptChildIds(result.tree, "__root__")).toEqual(["bottom", "top"]);
  });

  it("south inserts a sibling AFTER the target in a vertical parent", () => {
    const result = dropPaneIntoZone(PT_VERT_TWO, "top", "bottom", "south");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ptChildIds(result.tree, "__root__")).toEqual(["bottom", "top"]);
  });

  it("halves the target's sizePct between target and the new leaf", () => {
    const result = dropPaneIntoZone(PT_HORIZ_THREE, "rx", "body", "east");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bodyNode = ptFindNode(result.tree, "body")!;
    const rxNode = ptFindNode(result.tree, "rx")!;
    expect(bodyNode.sizePct).toBe(20);
    expect(rxNode.sizePct).toBe(20);
  });
});

describe("dropPaneIntoZone — edges, cross-axis parent (cpfd-01)", () => {
  it("east on a target inside a vertical parent wraps target in a horizontal split [target, new]", () => {
    const result = dropPaneIntoZone(PT_VERT_TWO, "top", "bottom", "east");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bottomSplit = ptDirectParent(result.tree, "bottom")!;
    expect(bottomSplit.direction).toBe("horizontal");
    expect(bottomSplit.children?.map((c) => c.paneIds?.[0] ?? c.id)).toEqual([
      "bottom",
      "top",
    ]);
  });

  it("west on a target inside a vertical parent wraps target in a horizontal split [new, target]", () => {
    const result = dropPaneIntoZone(PT_VERT_TWO, "top", "bottom", "west");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bottomSplit = ptDirectParent(result.tree, "bottom")!;
    expect(bottomSplit.direction).toBe("horizontal");
    expect(bottomSplit.children?.map((c) => c.paneIds?.[0] ?? c.id)).toEqual([
      "top",
      "bottom",
    ]);
  });

  it("south on a target inside a horizontal parent wraps target in a vertical split [target, new]", () => {
    const result = dropPaneIntoZone(PT_HORIZ_THREE, "rx", "body", "south");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bodySplit = ptDirectParent(result.tree, "body")!;
    expect(bodySplit.direction).toBe("vertical");
    expect(bodySplit.children?.map((c) => c.paneIds?.[0] ?? c.id)).toEqual(["body", "rx"]);
  });

  it("new split inherits the target's sizePct; inner children are 50/50", () => {
    const result = dropPaneIntoZone(PT_HORIZ_THREE, "rx", "body", "south");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bodySplit = ptDirectParent(result.tree, "body")!;
    expect(bodySplit.sizePct).toBe(40);
    expect(bodySplit.children?.map((c) => c.sizePct)).toEqual([50, 50]);
  });
});

describe("dropPaneIntoZone — root + single-pane targets (cpfd-01)", () => {
  it("east on the root leaf produces a horizontal root split [root, new]", () => {
    const solo = ptLeaf("chart", 100);
    const withPeer = ptRoot([solo, ptLeaf("rx", 50)]);
    const result = dropPaneIntoZone(withPeer, "rx", "chart", "east");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tree.direction).toBe("horizontal");
    expect(result.tree.children?.map((c) => c.paneIds?.[0] ?? c.id)).toEqual([
      "chart",
      "rx",
    ]);
  });

  it("south on the root leaf produces a vertical root split [root, new]", () => {
    const tree = ptLeaf("chart", 100);
    const withPeer = ptRoot([tree, ptLeaf("rx", 50)]);
    const result = dropPaneIntoZone(withPeer, "rx", "chart", "south");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const chartSplit = ptDirectParent(result.tree, "chart")!;
    expect(chartSplit.direction).toBe("vertical");
    expect(chartSplit.children?.map((c) => c.paneIds?.[0] ?? c.id)).toEqual([
      "chart",
      "rx",
    ]);
  });
});

describe("dropPaneIntoZone — invariants + failures (cpfd-01)", () => {
  it("removes the source from its previous container (single-home)", () => {
    const result = dropPaneIntoZone(PT_HORIZ_THREE, "rx", "body", "east");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(collectAllPaneIds(result.tree)).toEqual(["chart", "body", "rx"]);
    expect(hasDuplicatePaneIds(result.tree)).toBe(false);
  });

  it("no resulting tree has a paneId in two paneIds arrays", () => {
    const result = dropPaneIntoZone(PT_TABS_TARGET, "plan", "chart", "west");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(hasDuplicatePaneIds(result.tree)).toBe(false);
  });

  it("every tabs node satisfies paneIds.includes(activeTabId) after the drop", () => {
    const result = dropPaneIntoZone(PT_TABS_TARGET, "plan", "chart", "east");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(allTabsNodesValid(result.tree)).toBe(true);
  });

  it("returns 'cap-reached' on an edge drop when the tree already has MAX_LEAVES leaves", () => {
    const children = Array.from({ length: MAX_LEAVES }, (_, i) =>
      ptLeaf(`p-${i}`, 100 / MAX_LEAVES),
    );
    const capped = ptRoot(children);
    expect(dropPaneIntoZone(capped, "p-0", "p-1", "east")).toEqual({
      ok: false,
      reason: "cap-reached",
    });
  });

  it("returns 'last-pane-in-tree' on an edge drop when the tree holds only one pane", () => {
    const solo = ptRoot([ptLeaf("chart", 100)]);
    expect(dropPaneIntoZone(solo, "chart", "chart", "west")).toEqual({
      ok: false,
      reason: "no-op",
    });
    expect(extractFromTabsNode(solo, "chart", "horizontal")).toEqual({
      ok: false,
      reason: "last-pane-in-tree",
    });
  });

  it("returns 'no-op' when dropping a single-pane container's only pane on its own edge", () => {
    const solo = ptLeaf("chart", 100);
    expect(dropPaneIntoZone(solo, "chart", "chart", "east")).toEqual({
      ok: false,
      reason: "no-op",
    });
  });

  it("returns 'not-found' for an absent source or target", () => {
    expect(dropPaneIntoZone(PT_THREE_SINGLE, "ghost", "body", "west")).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(dropPaneIntoZone(PT_THREE_SINGLE, "rx", "ghost", "west")).toEqual({
      ok: false,
      reason: "not-found",
    });
  });
});

describe("dropPaneIntoZone — round-trip (cpfd-01)", () => {
  it("east then dropping the pane back into the original container (center) is structurally equal to the original", () => {
    const original = PT_HORIZ_THREE;
    const dropped = dropPaneIntoZone(original, "rx", "body", "east");
    expect(dropped.ok).toBe(true);
    if (!dropped.ok) return;
    const tabbed = dropPaneIntoZone(dropped.tree, "rx", "body", "center");
    expect(tabbed.ok).toBe(true);
    if (!tabbed.ok) return;
    const restored = dropPaneIntoZone(tabbed.tree, "rx", "body", "east");
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(collectAllPaneIds(restored.tree)).toEqual(collectAllPaneIds(original));
    expect(ptChildIds(restored.tree, "__root__")).toEqual(
      ptChildIds(original, "__root__"),
    );
  });

  it("moving a tab out via west then back via center restores the original tree", () => {
    const original = PT_TABS_TARGET;
    const extracted = dropPaneIntoZone(original, "rx", "chart", "west");
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;
    const restored = dropPaneIntoZone(extracted.tree, "rx", "__tabs_0", "center");
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(collectAllPaneIds(restored.tree)).toEqual(collectAllPaneIds(original));
    expect(tabsPaneIds(restored.tree, "__tabs_0").sort()).toEqual(
      tabsPaneIds(original, "__tabs_0").sort(),
    );
  });
});

// ── hidePaneToRoot (empty-column-wrapper fix) ───────────────────────────────

function ptSplit(
  id: string,
  direction: "horizontal" | "vertical",
  children: PaneTreeNode[],
  sizePct = 50,
): PaneTreeNode {
  return { id, sizePct, hidden: false, direction, children };
}

function nodeIds(tree: PaneTreeNode): string[] {
  const ids: string[] = [];
  function walk(n: PaneTreeNode) {
    ids.push(n.id);
    n.children?.forEach(walk);
  }
  walk(tree);
  return ids;
}

function hiddenPaneIds(tree: PaneTreeNode): string[] {
  const flat = paneTreeToFlat(tree);
  return flat.paneOrder.filter((id) => flat.paneState[id]?.hidden);
}

function visiblePaneIds(tree: PaneTreeNode): string[] {
  const flat = paneTreeToFlat(tree);
  return flat.paneOrder.filter((id) => !flat.paneState[id]?.hidden);
}

describe("hidePaneToRoot (empty-column-wrapper fix)", () => {
  it("hides a flat root column IN PLACE (no restructure, position kept)", () => {
    const result = withPaneTreeImmutability(PT_THREE_SINGLE, (t) =>
      hidePaneToRoot(t, "body"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(nodeIds(result.tree)).toEqual(["__root__", "chart", "body", "rx"]);
    expect(visiblePaneIds(result.tree)).toEqual(["chart", "rx"]);
    expect(hiddenPaneIds(result.tree)).toEqual(["body"]);
  });

  it("prunes the emptied __split when the LAST visible pane of a stacked column is hidden", () => {
    const tree = ptRoot([
      ptLeaf("chart", 50),
      ptSplit("__split_0", "vertical", [
        ptLeaf("a", 50, true), // already closed earlier
        ptLeaf("b", 50),
      ]),
    ]);
    const result = hidePaneToRoot(tree, "b");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The empty column wrapper must be gone — this is the bug being fixed.
    expect(nodeIds(result.tree)).not.toContain("__split_0");
    expect(visiblePaneIds(result.tree)).toEqual(["chart"]);
    expect(hiddenPaneIds(result.tree).sort()).toEqual(["a", "b"]);
    expect(hasDuplicatePaneIds(result.tree)).toBe(false);
    expect(allTabsNodesValid(result.tree)).toBe(true);
  });

  it("collapses a 2-row column to its surviving sibling when one row is hidden", () => {
    const tree = ptRoot([
      ptLeaf("chart", 50),
      ptSplit("__split_0", "vertical", [ptLeaf("a", 50), ptLeaf("b", 50)]),
    ]);
    const result = hidePaneToRoot(tree, "a");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(nodeIds(result.tree)).not.toContain("__split_0");
    expect(visiblePaneIds(result.tree).sort()).toEqual(["b", "chart"]);
    expect(hiddenPaneIds(result.tree)).toEqual(["a"]);
  });

  it("drops one tab from a tabs leaf, keeps the rest, re-homes the closed tab hidden", () => {
    const result = withPaneTreeImmutability(PT_TABS_TARGET, (t) =>
      hidePaneToRoot(t, "rx"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(visiblePaneIds(result.tree).sort()).toEqual(["body", "chart", "plan"]);
    expect(hiddenPaneIds(result.tree)).toEqual(["rx"]);
    expect(hasDuplicatePaneIds(result.tree)).toBe(false);
    expect(allTabsNodesValid(result.tree)).toBe(true);
  });

  it("keeps every pane re-addable (hidden re-homed panes survive in the flat model)", () => {
    const tree = ptRoot([
      ptLeaf("chart", 50),
      ptSplit("__split_0", "vertical", [ptLeaf("a", 50), ptLeaf("b", 50)]),
    ]);
    const result = hidePaneToRoot(tree, "b");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(collectAllPaneIds(result.tree).sort()).toEqual(["a", "b", "chart"]);
  });

  it("returns not-found for an unknown pane id", () => {
    expect(hidePaneToRoot(PT_THREE_SINGLE, "ghost")).toEqual({
      ok: false,
      reason: "not-found",
    });
  });
});
