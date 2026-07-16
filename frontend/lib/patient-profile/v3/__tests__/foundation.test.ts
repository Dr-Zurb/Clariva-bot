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
  it("swaps two sibling leaves, preserving each slot's sizePct", () => {
    const tree = root([leaf("a", 30), leaf("b", 20), leaf("c", 50)]);
    const r = swapPaneTreeNodes(tree, "a", "c");
    expect(r.ok).toBe(true);
    if (r.ok) {
      const ids = r.tree.children!.map((n) => n.id);
      const sizes = r.tree.children!.map((n) => n.sizePct);
      // Contents traded places; slot widths (30/20/50) unchanged.
      expect(ids).toEqual(["c", "b", "a"]);
      expect(sizes).toEqual([30, 20, 50]);
      expect(paneTreeToFlat(r.tree).paneOrder.sort()).toEqual(["a", "b", "c"]);
    }
  });

  it("swaps leaves across different parents", () => {
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
      // "c" now sits in the root slot (keeps 40); "a" nests where "c" was (keeps 30).
      expect(r.tree.children![0]!.id).toBe("c");
      expect(r.tree.children![0]!.sizePct).toBe(40);
      const col = r.tree.children![1]!;
      expect(col.children!.map((n) => n.id)).toEqual(["b", "a"]);
      expect(col.children![1]!.sizePct).toBe(30);
    }
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
