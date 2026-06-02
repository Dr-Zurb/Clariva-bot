/**
 * Bridge between R-LAYOUT-UX {@link LayoutNode} (preset / mutation shape) and
 * {@link PaneTreeNode} (shell persistence shape).
 */

import type { PaneTreeNode } from "./layout-tree";
import type { LayoutNode } from "./types";

function normalizeSizes(pcts: number[]): number[] {
  const sum = pcts.reduce((a, b) => a + b, 0) || 1;
  const raw = pcts.map((p) => (p / sum) * 100);
  const rounded = raw.map((v) => Math.round(v * 100) / 100);
  const drift = 100 - rounded.reduce((a, b) => a + b, 0);
  if (Math.abs(drift) > 0.01 && rounded.length > 0) {
    rounded[rounded.length - 1] =
      (rounded[rounded.length - 1] ?? 0) + drift;
  }
  return rounded;
}

let splitCounter = 0;

/** Collect pane leaf ids from a layout tree (DFS, left-to-right). */
export function collectLayoutPaneIds(tree: LayoutNode): string[] {
  if (tree.kind === "pane") return [tree.paneId];
  const out: string[] = [];
  for (const child of tree.children) {
    out.push(...collectLayoutPaneIds(child));
  }
  return out;
}

/** Convert a mutation / preset tree into the shell's persisted shape. */
export function layoutNodeToPaneTree(node: LayoutNode): PaneTreeNode {
  return walkLayoutNode(node, 100, true);
}

function walkLayoutNode(
  node: LayoutNode,
  sizePct: number,
  isRoot: boolean,
): PaneTreeNode {
  if (node.kind === "pane") {
    return {
      id: node.paneId,
      sizePct,
      hidden: false,
      paneIds: [node.paneId],
      activeTabId: node.paneId,
    };
  }

  const childSizes = node.sizes.length === node.children.length
    ? node.sizes
    : node.children.map(() => 100 / Math.max(node.children.length, 1));

  return {
    id: isRoot ? "__root__" : `__split_${splitCounter++}`,
    sizePct,
    hidden: false,
    direction: node.direction,
    children: node.children.map((child, i) =>
      walkLayoutNode(child, childSizes[i] ?? 100 / node.children.length, false),
    ),
  };
}

/** Convert the shell's persisted tree into the mutation / preset shape. */
export function paneTreeToLayoutNode(node: PaneTreeNode): LayoutNode {
  if (!node.children?.length) {
    return { kind: "pane", paneId: node.paneIds?.[0] ?? node.id };
  }

  const children = node.children.map(paneTreeToLayoutNode);
  const sizes = normalizeSizes(node.children.map((c) => c.sizePct));

  return {
    kind: "split",
    direction: node.direction ?? "horizontal",
    children,
    sizes,
  };
}

/** Structural equality for preset active-state checks. */
export function layoutTreesEqual(a: LayoutNode, b: LayoutNode): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
