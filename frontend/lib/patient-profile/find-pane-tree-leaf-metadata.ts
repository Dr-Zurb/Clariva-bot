/**
 * `findPaneTreeLeafMetadata` — pure lookup used by the shell renderer (cpf-04)
 * to resolve a leaf in the persisted `PaneTreeNode` by its node id and return
 * the `paneIds` + `activeTabId` carried by that leaf.
 *
 * Lives in its own file so the unit tests can exercise it without pulling in
 * `<PatientProfileShell>`'s heavy dependency graph (which makes the Vitest
 * worker hot-import path noticeably slower).
 */

import type { PaneTreeNode } from "./layout-tree";

export interface PaneTreeLeafMetadata {
  /** Ordered pane ids carried by the leaf (v5: `paneIds[]`, fallback: `[node.id]`). */
  paneIds: string[];
  /** The pane id whose body is rendered when the leaf is shown. */
  activeTabId: string;
}

/**
 * Walk `paneTree` and return the matching leaf's `{paneIds, activeTabId}` for
 * the node whose id equals `nodeId`. Returns `null` when no leaf with the
 * given id exists in the tree.
 *
 * The helper is defensive about v4-shape leaves (no `paneIds`) and about
 * drifted `activeTabId` values that aren't present in `paneIds`:
 *
 *   - Missing `paneIds` falls back to `[node.id]`.
 *   - `activeTabId` missing or not in `paneIds` clamps to `paneIds[0]`.
 */
export function findPaneTreeLeafMetadata(
  paneTree: PaneTreeNode,
  nodeId: string,
): PaneTreeLeafMetadata | null {
  function walk(n: PaneTreeNode): PaneTreeLeafMetadata | null {
    if (n.children && n.children.length > 0) {
      for (const c of n.children) {
        const hit = walk(c);
        if (hit) return hit;
      }
      return null;
    }
    if (n.id !== nodeId) return null;
    const paneIds = n.paneIds && n.paneIds.length > 0 ? n.paneIds : [n.id];
    const activeTabId =
      n.activeTabId && paneIds.includes(n.activeTabId)
        ? n.activeTabId
        : paneIds[0]!;
    return { paneIds, activeTabId };
  }
  return walk(paneTree);
}
