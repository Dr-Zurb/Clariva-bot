import { describe, expect, it } from "vitest";
import {
  clonePaneTree,
  focusLeafInTree,
  listShowHereCandidates,
  narrowLeafInTree,
  peekLeafInTree,
  primaryLeafInTree,
  splitLeafByRatio,
  FOCUS_RAIL_ID,
  NARROW_FOCUS_PCT,
  PEEK_FOCUS_PCT,
  PRIMARY_FOCUS_PCT,
  SPLIT_RATIO_PCTS,
} from "@/lib/patient-profile/v3/focus-leaf";
import { getDefaultLayoutTree } from "@/lib/patient-profile/v3/default-layouts";
import {
  serialiseTree,
  type PaneTreeNode,
} from "@/lib/patient-profile/layout-tree";

function findNode(root: PaneTreeNode, id: string): PaneTreeNode | null {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const hit = findNode(child, id);
    if (hit) return hit;
  }
  return null;
}

function collectVisibleLeafIds(root: PaneTreeNode): string[] {
  const ids: string[] = [];
  function walk(n: PaneTreeNode, ancestorHidden: boolean): void {
    const hidden = ancestorHidden || n.hidden;
    if (!n.children?.length) {
      if (!hidden) {
        ids.push(...(n.paneIds?.length ? n.paneIds : [n.id]));
      }
      return;
    }
    for (const child of n.children) walk(child, hidden);
  }
  walk(root, false);
  return ids;
}

function visibleChildrenSizeSum(parent: PaneTreeNode): number {
  return (parent.children ?? [])
    .filter((c) => !c.hidden)
    .reduce((acc, c) => acc + c.sizePct, 0);
}

/** Ordered ids of the root's direct children. */
function rootChildIds(root: PaneTreeNode): string[] {
  return (root.children ?? []).map((c) => c.id);
}

/** Ordered ids of the companion rail rows (empty if no rail). */
function railRowIds(root: PaneTreeNode): string[] {
  const rail = findNode(root, FOCUS_RAIL_ID);
  return (rail?.children ?? []).map((c) => c.id);
}

/** Minimal single-pane leaf. */
function leaf(id: string, sizePct: number, hidden = false): PaneTreeNode {
  return { id, sizePct, hidden, paneIds: [id], activeTabId: id };
}

/** Horizontal root wrapping flat leaf columns. */
function flatRoot(...children: PaneTreeNode[]): PaneTreeNode {
  return {
    id: "__root__",
    sizePct: 100,
    hidden: false,
    direction: "horizontal",
    children,
  };
}

function tabsLeafTree(): PaneTreeNode {
  return {
    id: "__root__",
    sizePct: 100,
    hidden: false,
    direction: "horizontal",
    children: [
      {
        id: "col-notes",
        sizePct: 40,
        hidden: false,
        direction: "vertical",
        children: [
          {
            id: "__tabs_so",
            sizePct: 100,
            hidden: false,
            paneIds: ["subjective", "objective"],
            activeTabId: "subjective",
          },
        ],
      },
      {
        id: "col-plan",
        sizePct: 60,
        hidden: false,
        direction: "vertical",
        children: [
          {
            id: "plan",
            sizePct: 100,
            hidden: false,
            paneIds: ["plan"],
            activeTabId: "plan",
          },
        ],
      },
    ],
  };
}

describe("clonePaneTree", () => {
  it("deep-clones so mutations do not touch the original", () => {
    const original = getDefaultLayoutTree("consult");
    const cloned = clonePaneTree(original);
    expect(serialiseTree(cloned)).toBe(serialiseTree(original));
    expect(cloned).not.toBe(original);

    const plan = findNode(cloned, "plan");
    expect(plan).not.toBeNull();
    plan!.hidden = true;
    expect(findNode(original, "plan")!.hidden).toBe(false);
  });
});

describe("focusLeafInTree", () => {
  it("focuses plan on consult tree — only plan visible; ancestor sizes 100", () => {
    const consult = getDefaultLayoutTree("consult");
    const result = focusLeafInTree(consult, "plan");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(collectVisibleLeafIds(result.tree)).toEqual(["plan"]);

    const root = result.tree;
    expect(root.sizePct).toBe(100);
    expect(root.hidden).toBe(false);
    expect(visibleChildrenSizeSum(root)).toBe(100);

    const colMid = findNode(result.tree, "col-mid")!;
    expect(colMid.hidden).toBe(false);
    expect(colMid.sizePct).toBe(100);
    expect(visibleChildrenSizeSum(colMid)).toBe(100);

    const plan = findNode(result.tree, "plan")!;
    expect(plan.hidden).toBe(false);
    expect(plan.sizePct).toBe(100);
    expect(plan.paneIds).toEqual(["plan"]);
    expect(plan.activeTabId).toBe("plan");

    const colRight = findNode(result.tree, "col-right")!;
    expect(colRight.hidden).toBe(true);
    expect(findNode(result.tree, "body")!.hidden).toBe(true);
    expect(findNode(result.tree, "assessment")!.hidden).toBe(true);
    // Off-path leaves keep identity (not removed).
    expect(findNode(result.tree, "subjective")).not.toBeNull();
    expect(findNode(result.tree, "objective")).not.toBeNull();
  });

  it("does not mutate the input tree", () => {
    const consult = getDefaultLayoutTree("consult");
    const before = serialiseTree(consult);
    focusLeafInTree(consult, "plan");
    expect(serialiseTree(consult)).toBe(before);
  });

  it("restore via prior clone equals original serialisation", () => {
    const consult = getDefaultLayoutTree("consult");
    const prior = clonePaneTree(consult);
    const focused = focusLeafInTree(consult, "assessment");
    expect(focused.ok).toBe(true);
    expect(serialiseTree(focused.ok ? focused.tree : consult)).not.toBe(
      serialiseTree(prior),
    );
    // Restore = apply the prior clone (identity).
    expect(serialiseTree(prior)).toBe(serialiseTree(consult));
  });

  it("focuses a pane inside a tabs leaf; sets activeTabId when needed", () => {
    const tree = tabsLeafTree();
    const result = focusLeafInTree(tree, "objective");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const tabs = findNode(result.tree, "__tabs_so")!;
    expect(tabs.hidden).toBe(false);
    expect(tabs.paneIds).toEqual(["subjective", "objective"]);
    expect(tabs.activeTabId).toBe("objective");
    expect(collectVisibleLeafIds(result.tree)).toEqual([
      "subjective",
      "objective",
    ]);

    const planCol = findNode(result.tree, "col-plan")!;
    expect(planCol.hidden).toBe(true);
  });

  it("focusing tabs leaf id leaves activeTabId unchanged", () => {
    const tree = tabsLeafTree();
    const result = focusLeafInTree(tree, "__tabs_so");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const tabs = findNode(result.tree, "__tabs_so")!;
    expect(tabs.activeTabId).toBe("subjective");
    expect(tabs.paneIds).toEqual(["subjective", "objective"]);
  });

  it("returns not-found for unknown id", () => {
    const consult = getDefaultLayoutTree("consult");
    expect(focusLeafInTree(consult, "ghost-pane")).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("is stable when focusing an already-focused tree (idempotent)", () => {
    const consult = getDefaultLayoutTree("consult");
    const first = focusLeafInTree(consult, "plan");
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = focusLeafInTree(first.tree, "plan");
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(serialiseTree(second.tree)).toBe(serialiseTree(first.tree));
  });

  it("focusing structural leaf id (body) hides sibling columns", () => {
    const consult = getDefaultLayoutTree("consult");
    const result = focusLeafInTree(consult, "body");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(collectVisibleLeafIds(result.tree)).toEqual(["body"]);
    expect(findNode(result.tree, "col-mid")!.sizePct).toBe(100);
    expect(findNode(result.tree, "col-right")!.hidden).toBe(true);
  });
});

describe("primaryLeafInTree (CTF-D23 snap rail)", () => {
  it("plan wide: plan is a root column at 67%; every other pane joins a 33% rail", () => {
    const consult = getDefaultLayoutTree("consult");
    const result = primaryLeafInTree(consult, "plan");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Nothing hidden — all five panes stay on screen.
    expect(collectVisibleLeafIds(result.tree).sort()).toEqual([
      "assessment",
      "body",
      "objective",
      "plan",
      "subjective",
    ]);

    // Focused leaf is lifted to a root-level column; old columns are gone.
    expect(rootChildIds(result.tree)).toEqual(["plan", FOCUS_RAIL_ID]);
    expect(findNode(result.tree, "col-mid")).toBeNull();
    expect(findNode(result.tree, "col-right")).toBeNull();

    const plan = findNode(result.tree, "plan")!;
    expect(plan.sizePct).toBe(PRIMARY_FOCUS_PCT);
    expect(plan.paneIds).toEqual(["plan"]);

    const rail = findNode(result.tree, FOCUS_RAIL_ID)!;
    expect(rail.sizePct).toBe(33);
    expect(rail.direction).toBe("vertical");
    // Rail rows follow original DFS order (minus the focused leaf).
    expect(railRowIds(result.tree)).toEqual([
      "body",
      "assessment",
      "subjective",
      "objective",
    ]);
    expect(rail.children!.every((c) => c.sizePct === 25)).toBe(true);
    expect(visibleChildrenSizeSum(rail)).toBe(100);
    expect(visibleChildrenSizeSum(result.tree)).toBe(100);
  });

  it("subjective wide: 67/33 with the rail carrying the other four panes", () => {
    const consult = getDefaultLayoutTree("consult");
    const result = primaryLeafInTree(consult, "subjective");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(rootChildIds(result.tree)).toEqual(["subjective", FOCUS_RAIL_ID]);
    expect(findNode(result.tree, "subjective")!.sizePct).toBe(
      PRIMARY_FOCUS_PCT,
    );
    expect(findNode(result.tree, FOCUS_RAIL_ID)!.sizePct).toBe(33);
    expect(railRowIds(result.tree)).toEqual([
      "body",
      "assessment",
      "plan",
      "objective",
    ]);
  });

  it("crowded flat layout: focused pane still gets a real 67% of the screen", () => {
    // Five flat columns — the crowded case the old local-share model choked on.
    const crowded = flatRoot(
      leaf("p1", 20),
      leaf("p2", 20),
      leaf("p3", 20),
      leaf("p4", 20),
      leaf("p5", 20),
    );
    const result = primaryLeafInTree(crowded, "p3");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(rootChildIds(result.tree)).toEqual(["p3", FOCUS_RAIL_ID]);
    expect(findNode(result.tree, "p3")!.sizePct).toBe(PRIMARY_FOCUS_PCT);
    expect(findNode(result.tree, FOCUS_RAIL_ID)!.sizePct).toBe(33);
    expect(railRowIds(result.tree)).toEqual(["p1", "p2", "p4", "p5"]);
  });

  it("single companion: clean two-column split, no rail wrapper", () => {
    const two = flatRoot(leaf("a", 60), leaf("b", 40));
    const result = primaryLeafInTree(two, "a");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(rootChildIds(result.tree)).toEqual(["a", "b"]);
    expect(findNode(result.tree, FOCUS_RAIL_ID)).toBeNull();
    expect(findNode(result.tree, "a")!.sizePct).toBe(PRIMARY_FOCUS_PCT);
    expect(findNode(result.tree, "b")!.sizePct).toBe(33);
  });

  it("preserves hidden panes as hidden root siblings (no data loss on discard)", () => {
    const withHidden = flatRoot(
      leaf("a", 40),
      leaf("b", 30),
      leaf("c", 30, true),
    );
    const result = primaryLeafInTree(withHidden, "a");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Only one visible companion (b) → two-column split, hidden c retained.
    expect(rootChildIds(result.tree)).toEqual(["a", "b", "c"]);
    expect(findNode(result.tree, "a")!.sizePct).toBe(PRIMARY_FOCUS_PCT);
    expect(findNode(result.tree, "b")!.sizePct).toBe(33);
    expect(findNode(result.tree, "c")!.hidden).toBe(true);
    expect(collectVisibleLeafIds(result.tree).sort()).toEqual(["a", "b"]);
  });

  it("falls back to Focus when sole visible sibling", () => {
    const sole: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      paneIds: ["plan"],
      activeTabId: "plan",
    };
    const primary = primaryLeafInTree(sole, "plan");
    const focused = focusLeafInTree(sole, "plan");
    expect(primary.ok && focused.ok).toBe(true);
    if (!primary.ok || !focused.ok) return;
    expect(serialiseTree(primary.tree)).toBe(serialiseTree(focused.tree));
  });

  it("preserves tabs metadata when focusing a pane inside a tabs leaf", () => {
    const tree = tabsLeafTree();
    const result = primaryLeafInTree(tree, "objective");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // One companion (plan) → two-column split; activeTabId still switches.
    expect(rootChildIds(result.tree)).toEqual(["__tabs_so", "plan"]);
    const tabs = findNode(result.tree, "__tabs_so")!;
    expect(tabs.paneIds).toEqual(["subjective", "objective"]);
    expect(tabs.activeTabId).toBe("objective");
    expect(tabs.sizePct).toBe(PRIMARY_FOCUS_PCT);
    expect(findNode(result.tree, "plan")!.sizePct).toBe(33);
  });

  it("is stable when applied twice (idempotent)", () => {
    const consult = getDefaultLayoutTree("consult");
    const first = primaryLeafInTree(consult, "plan");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = primaryLeafInTree(first.tree, "plan");
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(serialiseTree(second.tree)).toBe(serialiseTree(first.tree));
  });

  it("returns not-found for unknown leaf", () => {
    expect(primaryLeafInTree(getDefaultLayoutTree("consult"), "ghost")).toEqual(
      {
        ok: false,
        reason: "not-found",
      },
    );
  });
});

describe("peekLeafInTree (CTF-D23 snap rail)", () => {
  it("plan even: plan 50% root column; rail 50% carries the other four", () => {
    const consult = getDefaultLayoutTree("consult");
    const result = peekLeafInTree(consult, "plan");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(collectVisibleLeafIds(result.tree)).toHaveLength(5);
    expect(rootChildIds(result.tree)).toEqual(["plan", FOCUS_RAIL_ID]);
    expect(findNode(result.tree, "plan")!.sizePct).toBe(PEEK_FOCUS_PCT);
    expect(findNode(result.tree, FOCUS_RAIL_ID)!.sizePct).toBe(50);
    expect(railRowIds(result.tree)).toEqual([
      "body",
      "assessment",
      "subjective",
      "objective",
    ]);
  });

  it("subjective even: 50/50 split into the rail", () => {
    const consult = getDefaultLayoutTree("consult");
    const result = peekLeafInTree(consult, "subjective");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(findNode(result.tree, "subjective")!.sizePct).toBe(PEEK_FOCUS_PCT);
    expect(findNode(result.tree, FOCUS_RAIL_ID)!.sizePct).toBe(50);
    expect(railRowIds(result.tree)).toEqual([
      "body",
      "assessment",
      "plan",
      "objective",
    ]);
  });

  it("falls back to Focus when sole visible sibling", () => {
    const sole: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      paneIds: ["plan"],
      activeTabId: "plan",
    };
    const peeked = peekLeafInTree(sole, "plan");
    const focused = focusLeafInTree(sole, "plan");
    expect(peeked.ok && focused.ok).toBe(true);
    if (!peeked.ok || !focused.ok) return;
    expect(serialiseTree(peeked.tree)).toBe(serialiseTree(focused.tree));
  });

  it("differs from Wide sizes on the same leaf", () => {
    const consult = getDefaultLayoutTree("consult");
    const peek = peekLeafInTree(consult, "plan");
    const primary = primaryLeafInTree(consult, "plan");
    expect(peek.ok && primary.ok).toBe(true);
    if (!peek.ok || !primary.ok) return;
    expect(findNode(peek.tree, "plan")!.sizePct).toBe(50);
    expect(findNode(primary.tree, "plan")!.sizePct).toBe(PRIMARY_FOCUS_PCT);
    expect(serialiseTree(peek.tree)).not.toBe(serialiseTree(primary.tree));
  });
});

describe("narrowLeafInTree (CTF-D23 snap rail)", () => {
  it("plan narrow: plan 33% root column; rail 67% carries the other four", () => {
    const consult = getDefaultLayoutTree("consult");
    const result = narrowLeafInTree(consult, "plan");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(collectVisibleLeafIds(result.tree)).toHaveLength(5);
    expect(rootChildIds(result.tree)).toEqual(["plan", FOCUS_RAIL_ID]);
    expect(findNode(result.tree, "plan")!.sizePct).toBe(NARROW_FOCUS_PCT);
    expect(findNode(result.tree, FOCUS_RAIL_ID)!.sizePct).toBe(67);
  });

  it("subjective narrow: 33/67 into the rail", () => {
    const consult = getDefaultLayoutTree("consult");
    const result = narrowLeafInTree(consult, "subjective");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(findNode(result.tree, "subjective")!.sizePct).toBe(NARROW_FOCUS_PCT);
    expect(findNode(result.tree, FOCUS_RAIL_ID)!.sizePct).toBe(67);
    expect(railRowIds(result.tree)).toEqual([
      "body",
      "assessment",
      "plan",
      "objective",
    ]);
  });

  it("falls back to Focus when sole visible sibling", () => {
    const sole: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      paneIds: ["plan"],
      activeTabId: "plan",
    };
    const narrow = narrowLeafInTree(sole, "plan");
    const focused = focusLeafInTree(sole, "plan");
    expect(narrow.ok && focused.ok).toBe(true);
    if (!narrow.ok || !focused.ok) return;
    expect(serialiseTree(narrow.tree)).toBe(serialiseTree(focused.tree));
  });

  it("differs from Wide and Even sizes on the same leaf", () => {
    const consult = getDefaultLayoutTree("consult");
    const narrow = narrowLeafInTree(consult, "plan");
    const primary = primaryLeafInTree(consult, "plan");
    const peek = peekLeafInTree(consult, "plan");
    expect(narrow.ok && primary.ok && peek.ok).toBe(true);
    if (!narrow.ok || !primary.ok || !peek.ok) return;
    expect(findNode(narrow.tree, "plan")!.sizePct).toBe(NARROW_FOCUS_PCT);
    expect(findNode(primary.tree, "plan")!.sizePct).toBe(PRIMARY_FOCUS_PCT);
    expect(findNode(peek.tree, "plan")!.sizePct).toBe(PEEK_FOCUS_PCT);
    expect(serialiseTree(narrow.tree)).not.toBe(serialiseTree(primary.tree));
    expect(serialiseTree(narrow.tree)).not.toBe(serialiseTree(peek.tree));
  });

  it("splitLeafByRatio('narrow') matches narrowLeafInTree", () => {
    const consult = getDefaultLayoutTree("consult");
    const a = narrowLeafInTree(consult, "plan");
    const b = splitLeafByRatio(consult, "plan", "narrow");
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(serialiseTree(a.tree)).toBe(serialiseTree(b.tree));
    expect(SPLIT_RATIO_PCTS.narrow.focusPct).toBe(NARROW_FOCUS_PCT);
  });
});

describe("listShowHereCandidates (CTF-D18)", () => {
  it("includes other hosts + Consult/body for assessment", () => {
    const consult = getDefaultLayoutTree("consult");
    const candidates = listShowHereCandidates(consult, "assessment");
    expect(candidates).toContain("body");
    expect(candidates).toContain("plan");
    expect(candidates).toContain("subjective");
    expect(candidates).not.toContain("assessment");
  });

  it("includes sibling tabs on the same multi-tab leaf", () => {
    const tree: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      direction: "horizontal",
      children: [
        {
          id: "__tabs_so",
          sizePct: 50,
          hidden: false,
          paneIds: ["subjective", "objective"],
          activeTabId: "subjective",
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
    const candidates = listShowHereCandidates(tree, "subjective");
    expect(candidates[0]).toBe("objective");
    expect(candidates).toContain("plan");
    expect(candidates).not.toContain("subjective");
  });
});
