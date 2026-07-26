/**
 * prune-layout-leaves.ts — strip retired pane ids from persisted / preset trees
 * (ribbon-expand Phase 2B).
 *
 * When Snapshot / History leave the registry, saved layouts still reference those
 * ids. `useShellLayout` would otherwise discard the whole tree. Prune first:
 * remove unknown leaves, collapse emptied splits, append any missing known ids
 * as hidden root leaves, rebalance sibling sizePct — then fall back to discard
 * only if nothing useful survived.
 */

// Import from leaf modules (not foundation) so useShellLayout can call us
// without a circular import through foundation's LAYOUT_VERSION re-export.
import {
  isValidTreeNode,
  paneTreeToFlat,
  type PaneTreeNode,
} from "@/lib/patient-profile/layout-tree";
import type { PatientProfileLayout } from "@/lib/patient-profile/types";

function toKnownSet(
  knownLeafIds: ReadonlySet<string> | readonly string[],
): Set<string> {
  return knownLeafIds instanceof Set
    ? knownLeafIds
    : new Set(knownLeafIds as readonly string[]);
}

function collectPaneIds(root: PaneTreeNode): string[] {
  const ids: string[] = [];
  function walk(n: PaneTreeNode): void {
    if (!n.children?.length) {
      ids.push(...(n.paneIds?.length ? n.paneIds : [n.id]));
      return;
    }
    for (const child of n.children) walk(child);
  }
  walk(root);
  return ids;
}

function hiddenLeaf(paneId: string): PaneTreeNode {
  return {
    id: paneId,
    sizePct: 33,
    hidden: true,
    paneIds: [paneId],
    activeTabId: paneId,
  };
}

function rebalanceSiblings(children: PaneTreeNode[]): PaneTreeNode[] {
  const visible = children.filter((c) => !c.hidden);
  if (visible.length === 0) return children;
  const sum = visible.reduce((acc, c) => acc + c.sizePct, 0);
  if (sum <= 0) {
    const equal = Math.round((100 / visible.length) * 10) / 10;
    return children.map((c) => (c.hidden ? c : { ...c, sizePct: equal }));
  }
  if (Math.abs(sum - 100) < 0.51) return children;
  const scale = 100 / sum;
  let scaled = children.map((c) =>
    c.hidden
      ? c
      : { ...c, sizePct: Math.round(c.sizePct * scale * 10) / 10 },
  );
  // Fix float drift on the last visible sibling.
  const vis = scaled.filter((c) => !c.hidden);
  const visSum = vis.reduce((acc, c) => acc + c.sizePct, 0);
  const drift = Math.round((100 - visSum) * 10) / 10;
  if (drift !== 0 && vis.length > 0) {
    const lastId = vis[vis.length - 1]!.id;
    scaled = scaled.map((c) =>
      c.id === lastId && !c.hidden
        ? { ...c, sizePct: Math.min(100, Math.max(0, c.sizePct + drift)) }
        : c,
    );
  }
  return scaled;
}

function rebalanceTree(node: PaneTreeNode): PaneTreeNode {
  if (!node.children?.length) return node;
  const children = rebalanceSiblings(node.children.map(rebalanceTree));
  return { ...node, children };
}

/**
 * Recursively drop unknown pane ids. Returns null when the node (and all
 * descendants) contribute nothing to the known registry.
 */
function stripUnknown(
  node: PaneTreeNode,
  known: ReadonlySet<string>,
): PaneTreeNode | null {
  if (node.children?.length) {
    const kids = node.children
      .map((c) => stripUnknown(c, known))
      .filter((c): c is PaneTreeNode => c !== null);
    if (kids.length === 0) return null;
    // Promote a lone non-root child into this slot (keeps column size).
    if (kids.length === 1 && node.id !== "__root__") {
      return { ...kids[0]!, sizePct: node.sizePct };
    }
    return { ...node, children: kids };
  }

  const paneIds = (node.paneIds?.length ? node.paneIds : [node.id]).filter(
    (id) => known.has(id),
  );
  if (paneIds.length === 0) return null;
  const activeTabId = paneIds.includes(node.activeTabId ?? "")
    ? (node.activeTabId as string)
    : paneIds[0]!;
  return {
    ...node,
    id: paneIds.length === 1 ? paneIds[0]! : node.id,
    paneIds,
    activeTabId,
  };
}

/**
 * Strip unknown leaves and ensure every known id is present (missing → hidden
 * root leaves). Returns null if the tree had no overlapping known panes.
 */
export function prunePaneTreeToKnownLeaves(
  root: PaneTreeNode,
  knownLeafIds: ReadonlySet<string> | readonly string[],
): PaneTreeNode | null {
  const known = toKnownSet(knownLeafIds);
  if (known.size === 0) return root;

  const beforeIds = collectPaneIds(root);
  if (!beforeIds.some((id) => known.has(id))) return null;

  let stripped = stripUnknown(root, known);
  if (!stripped) return null;

  if (!stripped.children?.length && stripped.id !== "__root__") {
    stripped = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      direction: "horizontal",
      children: [stripped],
    };
  }

  const present = new Set(collectPaneIds(stripped));
  const missing = Array.from(known).filter((id) => !present.has(id));
  if (missing.length > 0) {
    if (!stripped.children) {
      stripped = {
        id: "__root__",
        sizePct: 100,
        hidden: false,
        direction: "horizontal",
        children: [stripped, ...missing.map(hiddenLeaf)],
      };
    } else {
      stripped = {
        ...stripped,
        children: [...stripped.children, ...missing.map(hiddenLeaf)],
      };
    }
  }

  const balanced = rebalanceTree(stripped);
  return isValidTreeNode(balanced) ? balanced : null;
}

/**
 * Prune a full layout. Returns null when prune cannot produce an aligned tree
 * (caller should discard + reseed default).
 */
export function pruneLayoutToKnownLeaves(
  layout: PatientProfileLayout,
  knownLeafIds: ReadonlySet<string> | readonly string[],
): PatientProfileLayout | null {
  const known = toKnownSet(knownLeafIds);
  if (known.size === 0) return layout;

  const tree = prunePaneTreeToKnownLeaves(layout.paneTree, known);
  if (!tree) return null;

  const next: PatientProfileLayout = {
    version: layout.version,
    paneTree: tree,
  };

  // Sanity: flat round-trip must still list only known ids and cover them all.
  const { paneOrder } = paneTreeToFlat(next.paneTree);
  if (paneOrder.some((id) => !known.has(id))) return null;
  if (Array.from(known).some((id) => !paneOrder.includes(id))) return null;
  return next;
}
