import { describe, it, expect } from "vitest";
import {
  isValidTreeNode,
  upgradeV4LeavesToV5,
  sanitizePaneTree,
  paneTreeToFlat,
  flatToPaneTree,
  listTabsContainers,
  describeLayoutShape,
  isLayoutCramped,
  CRAMPED_ROOT_SIBLINGS,
  type PaneTreeNode,
} from "../layout-tree";

/** Collect every structural node id (for uniqueness assertions). */
function nodeIds(root: PaneTreeNode): string[] {
  const out: string[] = [];
  const walk = (n: PaneTreeNode) => {
    out.push(n.id);
    for (const c of n.children ?? []) walk(c);
  };
  walk(root);
  return out;
}

describe("sanitizePaneTree — heals corrupted persisted trees", () => {
  it("re-mints duplicate node ids so panels never collide", () => {
    // Two root children both id "objective" (the crash from a buggy swap +
    // later insert). Renderer would throw "Panel ids must be unique".
    const corrupt: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      direction: "horizontal",
      children: [
        { id: "objective", sizePct: 50, hidden: false, paneIds: ["objective"], activeTabId: "objective" },
        { id: "objective", sizePct: 50, hidden: false, paneIds: ["body"], activeTabId: "body" },
      ],
    };
    const fixed = sanitizePaneTree(corrupt);
    const ids = nodeIds(fixed);
    expect(new Set(ids).size).toBe(ids.length);
    // Both panes survive (objective + body), each hosted exactly once.
    expect(paneTreeToFlat(fixed).paneOrder.sort()).toEqual(["body", "objective"]);
  });

  it("drops a pane duplicated across two leaves (keeps first host)", () => {
    const corrupt: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      direction: "horizontal",
      children: [
        { id: "a", sizePct: 40, hidden: false, paneIds: ["objective", "plan"], activeTabId: "objective" },
        { id: "objective", sizePct: 60, hidden: false, paneIds: ["objective"], activeTabId: "objective" },
      ],
    };
    const fixed = sanitizePaneTree(corrupt);
    const flat = paneTreeToFlat(fixed);
    // "objective" appears once total; the emptied second leaf is pruned.
    expect(flat.paneOrder.filter((p) => p === "objective")).toHaveLength(1);
    expect(nodeIds(fixed).length).toBe(new Set(nodeIds(fixed)).size);
  });

  it("keeps the outer __root__ id when a descendant also uses it", () => {
    const nested: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      direction: "vertical",
      children: [
        {
          id: "__root__",
          sizePct: 50,
          hidden: false,
          direction: "horizontal",
          children: [
            { id: "a", sizePct: 50, hidden: false, paneIds: ["a"], activeTabId: "a" },
            { id: "b", sizePct: 50, hidden: false, paneIds: ["b"], activeTabId: "b" },
          ],
        },
        { id: "plan", sizePct: 50, hidden: false, paneIds: ["plan"], activeTabId: "plan" },
      ],
    };
    const fixed = sanitizePaneTree(nested);
    expect(fixed.id).toBe("__root__");
    const ids = nodeIds(fixed);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is idempotent on a well-formed tree", () => {
    const clean: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      direction: "horizontal",
      children: [
        { id: "a", sizePct: 50, hidden: false, paneIds: ["a"], activeTabId: "a" },
        { id: "__tabs_1", sizePct: 50, hidden: false, paneIds: ["b", "c"], activeTabId: "b" },
      ],
    };
    const once = sanitizePaneTree(clean);
    const twice = sanitizePaneTree(once);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(clean));
  });
});

describe("PaneTreeNode v5 shape (cpf-01)", () => {
  it("isValidTreeNode accepts a v5 leaf with paneIds + activeTabId", () => {
    const leaf: PaneTreeNode = {
      id: "snapshot",
      sizePct: 40,
      hidden: false,
      paneIds: ["snapshot"],
      activeTabId: "snapshot",
    };
    expect(isValidTreeNode(leaf)).toBe(true);
  });

  it("isValidTreeNode rejects a leaf where activeTabId is not in paneIds", () => {
    expect(
      isValidTreeNode({
        id: "snapshot",
        sizePct: 40,
        hidden: false,
        paneIds: ["snapshot", "history"],
        activeTabId: "body",
      }),
    ).toBe(false);
  });

  it("isValidTreeNode rejects a leaf where paneIds is empty", () => {
    expect(
      isValidTreeNode({
        id: "snapshot",
        sizePct: 40,
        hidden: false,
        paneIds: [],
        activeTabId: "snapshot",
      }),
    ).toBe(false);
  });

  it("isValidTreeNode rejects a node with both children and paneIds", () => {
    expect(
      isValidTreeNode({
        id: "__root__",
        sizePct: 100,
        hidden: false,
        direction: "horizontal",
        paneIds: ["snapshot"],
        activeTabId: "snapshot",
        children: [
          { id: "snapshot", sizePct: 50, hidden: false },
        ],
      }),
    ).toBe(false);
  });
});

describe("upgradeV4LeavesToV5 (cpf-01)", () => {
  it("wraps a single-id v4 leaf into [id] paneIds + activeTabId = id", () => {
    const v4: PaneTreeNode = { id: "snapshot", sizePct: 40, hidden: false };
    const v5 = upgradeV4LeavesToV5(v4);
    expect(v5).toEqual({
      id: "snapshot",
      sizePct: 40,
      hidden: false,
      paneIds: ["snapshot"],
      activeTabId: "snapshot",
    });
  });

  it("is a no-op on an already-v5 leaf", () => {
    const v5: PaneTreeNode = {
      id: "snapshot",
      sizePct: 40,
      hidden: false,
      paneIds: ["snapshot"],
      activeTabId: "snapshot",
    };
    expect(upgradeV4LeavesToV5(v5)).toBe(v5);
  });

  it("recurses into split nodes", () => {
    const tree: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      direction: "horizontal",
      children: [
        { id: "chart", sizePct: 50, hidden: false },
        { id: "body", sizePct: 50, hidden: true },
      ],
    };
    const upgraded = upgradeV4LeavesToV5(tree);
    expect(upgraded.children![0]).toEqual({
      id: "chart",
      sizePct: 50,
      hidden: false,
      paneIds: ["chart"],
      activeTabId: "chart",
    });
    expect(upgraded.children![1]).toEqual({
      id: "body",
      sizePct: 50,
      hidden: true,
      paneIds: ["body"],
      activeTabId: "body",
    });
  });

  it("preserves sizePct + hidden + direction + id", () => {
    const tree: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      direction: "vertical",
      children: [{ id: "rx", sizePct: 33, hidden: true }],
    };
    const upgraded = upgradeV4LeavesToV5(tree);
    expect(upgraded.direction).toBe("vertical");
    expect(upgraded.id).toBe("__root__");
    expect(upgraded.children![0]!.sizePct).toBe(33);
    expect(upgraded.children![0]!.hidden).toBe(true);
    expect(upgraded.children![0]!.id).toBe("rx");
  });

  it("preserves referential identity for unchanged subtrees", () => {
    const leaf: PaneTreeNode = {
      id: "snapshot",
      sizePct: 40,
      hidden: false,
      paneIds: ["snapshot"],
      activeTabId: "snapshot",
    };
    const tree: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      direction: "horizontal",
      children: [leaf],
    };
    const upgraded = upgradeV4LeavesToV5(tree);
    expect(upgraded).toBe(tree);
    expect(upgraded.children![0]).toBe(leaf);
  });
});

describe("paneTreeToFlat with v5 leaves", () => {
  it("emits every paneId in a single-pane leaf (length 1)", () => {
    const tree = flatToPaneTree({
      paneOrder: ["snapshot"],
      paneState: { snapshot: { sizePct: 100, hidden: false } },
    });
    const flat = paneTreeToFlat(tree);
    expect(flat.paneOrder).toEqual(["snapshot"]);
    expect(flat.paneState.snapshot).toEqual({ sizePct: 100, hidden: false });
  });

  it("emits every paneId in a multi-pane leaf (length > 1)", () => {
    const multiLeaf: PaneTreeNode = {
      id: "__tabs_0",
      sizePct: 50,
      hidden: false,
      paneIds: ["snapshot", "history", "body"],
      activeTabId: "history",
    };
    const tree: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      direction: "horizontal",
      children: [multiLeaf],
    };
    const flat = paneTreeToFlat(tree);
    expect(flat.paneOrder).toEqual(["snapshot", "history", "body"]);
  });

  it("all paneIds in a multi-pane leaf share the leaf's sizePct + hidden", () => {
    const multiLeaf: PaneTreeNode = {
      id: "__tabs_0",
      sizePct: 42,
      hidden: true,
      paneIds: ["a", "b"],
      activeTabId: "a",
    };
    const tree: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      direction: "horizontal",
      children: [multiLeaf],
    };
    const flat = paneTreeToFlat(tree);
    expect(flat.paneState.a).toEqual({ sizePct: 42, hidden: true });
    expect(flat.paneState.b).toEqual({ sizePct: 42, hidden: true });
  });
});

describe("listTabsContainers (cpf-05)", () => {
  it("returns one entry per leaf with paneIds + activeTabId + label", () => {
    const tree: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      direction: "horizontal",
      children: [
        {
          id: "chart",
          sizePct: 33,
          hidden: false,
          paneIds: ["chart"],
          activeTabId: "chart",
        },
        {
          id: "__tabs_0",
          sizePct: 67,
          hidden: false,
          paneIds: ["body", "plan"],
          activeTabId: "plan",
        },
      ],
    };
    const containers = listTabsContainers(tree, (id) =>
      id === "plan" ? "Plan" : id,
    );
    expect(containers).toHaveLength(2);
    expect(containers[0]).toEqual({
      id: "chart",
      paneIds: ["chart"],
      activeTabId: "chart",
      label: "chart",
    });
    expect(containers[1]).toEqual({
      id: "__tabs_0",
      paneIds: ["body", "plan"],
      activeTabId: "plan",
      label: "Plan",
    });
  });

  it("uses labelFor callback when provided; falls back to paneId", () => {
    const tree: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      direction: "horizontal",
      children: [
        {
          id: "rx",
          sizePct: 100,
          hidden: false,
          paneIds: ["rx"],
          activeTabId: "rx",
        },
      ],
    };
    expect(listTabsContainers(tree)[0]!.label).toBe("rx");
    expect(listTabsContainers(tree, () => "Prescriptions")[0]!.label).toBe(
      "Prescriptions",
    );
  });

  it("returns no entries for an empty tree (defensive)", () => {
    const empty: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      direction: "horizontal",
      children: [],
    };
    expect(listTabsContainers(empty)).toEqual([]);
  });
});

describe("describeLayoutShape + isLayoutCramped (cpfc-04)", () => {
  function leaf(
    id: string,
    paneIds?: string[],
    sizePct = 100,
  ): PaneTreeNode {
    const ids = paneIds ?? [id];
    return {
      id,
      sizePct,
      hidden: false,
      paneIds: ids,
      activeTabId: ids[0]!,
    };
  }

  it("describes a single-leaf tree", () => {
    const tree = leaf("chart");
    expect(describeLayoutShape(tree)).toEqual({
      leafCount: 1,
      tabContainers: 0,
      maxRootSiblings: 1,
    });
    expect(isLayoutCramped(tree)).toBe(false);
  });

  it("describes a canonical 3-column horizontal root", () => {
    const tree: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      direction: "horizontal",
      children: [leaf("chart", undefined, 33), leaf("body", undefined, 34), leaf("rx", undefined, 33)],
    };
    expect(describeLayoutShape(tree)).toEqual({
      leafCount: 3,
      tabContainers: 0,
      maxRootSiblings: 3,
    });
    expect(isLayoutCramped(tree)).toBe(false);
  });

  it("flags a 6-wide horizontal root as cramped", () => {
    const tree: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      direction: "horizontal",
      children: Array.from({ length: 6 }, (_, i) => leaf(`pane-${i}`, undefined, 100 / 6)),
    };
    expect(describeLayoutShape(tree).maxRootSiblings).toBe(6);
    expect(isLayoutCramped(tree)).toBe(true);
  });

  it("treats a vertical root as maxRootSiblings 1 regardless of child count", () => {
    const tree: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      direction: "vertical",
      children: Array.from({ length: 6 }, (_, i) => leaf(`pane-${i}`, undefined, 100 / 6)),
    };
    expect(describeLayoutShape(tree).maxRootSiblings).toBe(1);
    expect(isLayoutCramped(tree)).toBe(false);
  });

  it("counts a multi-pane leaf as one tab container", () => {
    const tree: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      direction: "horizontal",
      children: [leaf("__tabs_0", ["a", "b"], 100)],
    };
    expect(describeLayoutShape(tree)).toEqual({
      leafCount: 1,
      tabContainers: 1,
      maxRootSiblings: 1,
    });
  });
});
