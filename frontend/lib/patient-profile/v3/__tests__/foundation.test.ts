import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  dropPaneIntoZone,
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
