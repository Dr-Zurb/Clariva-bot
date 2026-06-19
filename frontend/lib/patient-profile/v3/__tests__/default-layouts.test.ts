import { describe, it, expect } from "vitest";
import {
  COCKPIT_TAB_ORDER,
} from "@/lib/patient-profile/v3/cockpit-tabs";
import {
  DEFAULT_LAYOUTS,
  DEFAULT_SEED_ID,
  getDefaultLayoutTree,
  type DefaultLayoutId,
} from "@/lib/patient-profile/v3/default-layouts";
import {
  isValidTreeNode,
  type PaneTreeNode,
} from "@/lib/patient-profile/v3/foundation";

const PANE_IDS = [...COCKPIT_TAB_ORDER];

const VISIBLE_BY_LAYOUT: Record<DefaultLayoutId, readonly string[]> = {
  consult: PANE_IDS,
  read: ["snapshot", "assessment", "history", "subjective", "objective"],
  document: [
    "snapshot",
    "assessment",
    "subjective",
    "objective",
    "investigations-orders",
    "plan",
  ],
  review: PANE_IDS,
};

const HIDDEN_BY_LAYOUT: Record<DefaultLayoutId, readonly string[]> = {
  consult: [],
  read: ["body", "investigations-orders", "plan"],
  document: ["body", "history"],
  review: [],
};

const STRUCTURAL_IDS = new Set([
  "__root__",
  "col-left",
  "col-mid",
  "c-mid-bottom",
  "col-right",
  "read-left",
  "read-center",
  "read-right",
  "doc-left",
  "doc-mid",
  "doc-right",
  "review-left",
  "review-mid",
  "review-right",
]);

function collectPaneIds(root: PaneTreeNode): string[] {
  const ids: string[] = [];
  function walk(n: PaneTreeNode): void {
    if (!n.children?.length) {
      const leafIds = n.paneIds?.length ? n.paneIds : [n.id];
      ids.push(...leafIds);
      return;
    }
    for (const child of n.children) walk(child);
  }
  walk(root);
  return ids;
}

function visiblePaneIds(root: PaneTreeNode): string[] {
  return collectPaneIds(root).filter((id) => {
    function findHidden(n: PaneTreeNode): boolean | null {
      if (!n.children?.length) {
        const leafIds = n.paneIds?.length ? n.paneIds : [n.id];
        if (leafIds.includes(id)) return n.hidden;
        return null;
      }
      for (const c of n.children) {
        const hit = findHidden(c);
        if (hit !== null) return hit;
      }
      return null;
    }
    return findHidden(root) === false;
  });
}

function hiddenPaneIds(root: PaneTreeNode): string[] {
  return collectPaneIds(root).filter((id) => {
    function findHidden(n: PaneTreeNode): boolean | null {
      if (!n.children?.length) {
        const leafIds = n.paneIds?.length ? n.paneIds : [n.id];
        if (leafIds.includes(id)) return n.hidden;
        return null;
      }
      for (const c of n.children) {
        const hit = findHidden(c);
        if (hit !== null) return hit;
      }
      return null;
    }
    return findHidden(root) === true;
  });
}

/** Split-node ids only (excludes pane leaves). */
function collectSplitIds(root: PaneTreeNode): string[] {
  const ids: string[] = [];
  function walk(n: PaneTreeNode): void {
    if (!n.children?.length) return;
    ids.push(n.id);
    for (const child of n.children) walk(child);
  }
  walk(root);
  return ids;
}

function assertLeafContracts(root: PaneTreeNode): void {
  function walk(n: PaneTreeNode): void {
    if (n.children?.length) {
      for (const c of n.children) walk(c);
      return;
    }
    expect(n.paneIds?.length).toBeGreaterThan(0);
    expect(n.activeTabId).toBeDefined();
    expect(n.paneIds).toContain(n.activeTabId!);
  }
  walk(root);
}

function visibleSiblingGroupsSum(root: PaneTreeNode): void {
  function walk(n: PaneTreeNode): void {
    if (!n.children?.length) return;
    const visible = n.children.filter((c) => !c.hidden);
    if (visible.length > 1) {
      const sum = visible.reduce((acc, c) => acc + c.sizePct, 0);
      expect(sum).toBeGreaterThanOrEqual(99);
      expect(sum).toBeLessThanOrEqual(101);
    }
    for (const c of n.children) walk(c);
  }
  walk(root);
}

describe("default-layouts (cv3l-01)", () => {
  it("exports DEFAULT_SEED_ID consult and four catalogue entries", () => {
    expect(DEFAULT_SEED_ID).toBe("consult");
    expect(DEFAULT_LAYOUTS.map((e) => e.id)).toEqual([
      "consult",
      "read",
      "document",
      "review",
    ]);
  });

  it.each(DEFAULT_LAYOUTS.map((e) => [e.id, e.tree] as const))(
    "%s tree passes validators and the eight-pane invariant",
    (id, tree) => {
      expect(isValidTreeNode(tree)).toBe(true);
      assertLeafContracts(tree);

      const paneIds = collectPaneIds(tree);
      expect(paneIds.sort()).toEqual([...PANE_IDS].sort());
      expect(new Set(paneIds).size).toBe(8);

      expect(visiblePaneIds(tree).sort()).toEqual(
        [...VISIBLE_BY_LAYOUT[id]].sort(),
      );
      expect(hiddenPaneIds(tree).sort()).toEqual(
        [...HIDDEN_BY_LAYOUT[id]].sort(),
      );

      for (const splitId of collectSplitIds(tree)) {
        if (splitId === "__root__") continue;
        expect(PANE_IDS).not.toContain(splitId);
        expect(STRUCTURAL_IDS.has(splitId) || splitId.startsWith("__")).toBe(true);
      }

      visibleSiblingGroupsSum(tree);
    },
  );

  it("getDefaultLayoutTree returns the consult seed tree", () => {
    expect(getDefaultLayoutTree("consult")).toBe(
      DEFAULT_LAYOUTS.find((e) => e.id === "consult")!.tree,
    );
  });
});
