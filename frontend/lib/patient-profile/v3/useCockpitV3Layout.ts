"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  useShellLayout,
  v4TreeLayoutStorageKey,
  type UseShellLayoutOptions,
} from "@/lib/patient-profile/useShellLayout";
import {
  LAYOUT_VERSION,
  extractFromTabsNode,
  dropPaneIntoZone,
  addToTabsNode,
  hidePaneToRoot,
  MAX_LEAVES,
  type DropZone,
  type PaneTreeNode,
} from "@/lib/patient-profile/v3/foundation";
import { countVisibleStructuralLeaves } from "@/lib/patient-profile/v3/blankLayout";
import {
  countVisibleRootColumns,
  findBalancedStackTarget,
} from "@/lib/patient-profile/v3/column-cap";
import type { CockpitMutationResult } from "@/lib/patient-profile/v3/cockpit-cap-toast";

function findPaneTreeNodeById(root: PaneTreeNode, nodeId: string): PaneTreeNode | null {
  if (root.id === nodeId) return root;
  if (root.children) {
    for (const child of root.children) {
      const hit = findPaneTreeNodeById(child, nodeId);
      if (hit) return hit;
    }
  }
  return null;
}

function updatePaneTreeNodeById(
  tree: PaneTreeNode,
  nodeId: string,
  updater: (node: PaneTreeNode) => PaneTreeNode,
): PaneTreeNode {
  if (tree.id === nodeId) return updater(tree);
  if (!tree.children) return tree;
  return {
    ...tree,
    children: tree.children.map((child) =>
      updatePaneTreeNodeById(child, nodeId, updater),
    ),
  };
}

export interface UseCockpitV3LayoutOptions extends UseShellLayoutOptions {
  /** Blank default applied when localStorage is empty (cv3c-03). */
  blankDefaultTree?: PaneTreeNode;
  /**
   * Viewport-derived cap on root-level columns; beyond this, palette-add stacks
   * panes as rows (340px min column width — see column-cap.ts).
   */
  maxComfortableColumns?: number;
  /**
   * Viewport-derived cap on rows per column; once the shortest column already
   * holds this many rows, palette-add tabs instead of crushing rows thinner
   * than the comfortable floor (150px min row height — see column-cap.ts).
   */
  maxRowsPerColumn?: number;
}

export function useCockpitV3Layout(opts: UseCockpitV3LayoutOptions) {
  const {
    blankDefaultTree,
    storageKey,
    maxComfortableColumns = 10,
    maxRowsPerColumn = MAX_LEAVES,
    ...shellOpts
  } = opts;
  const shell = useShellLayout({ storageKey, ...shellOpts });
  const blankSeedAppliedRef = useRef(false);
  const { hydrated, applyLayout } = shell;

  useEffect(() => {
    if (!blankDefaultTree || !hydrated || blankSeedAppliedRef.current) return;
    blankSeedAppliedRef.current = true;
    if (typeof window === "undefined") return;
    const v4Key = v4TreeLayoutStorageKey(storageKey);
    if (window.localStorage.getItem(v4Key)) return;
    applyLayout({ version: LAYOUT_VERSION, paneTree: blankDefaultTree });
  }, [blankDefaultTree, hydrated, applyLayout, storageKey]);

  const dispatchEngine = useCallback(
    (
      fn: (
        tree: PaneTreeNode,
      ) => { ok: boolean; tree?: PaneTreeNode; reason?: string },
    ): CockpitMutationResult => {
      const res = fn(shell.paneTree);
      if (res.ok && res.tree) {
        shell.applyLayout({ version: LAYOUT_VERSION, paneTree: res.tree });
        return { ok: true };
      }
      return { ok: false, reason: res.reason };
    },
    [shell],
  );

  const addPane = useCallback(
    (paneId: string): CockpitMutationResult => {
      const { paneState, paneTree, setPaneHidden } = shell;
      if (!paneState[paneId]) return { ok: false, reason: "not-found" };
      if (!paneState[paneId].hidden) return { ok: true };
      if (countVisibleStructuralLeaves(paneTree) >= MAX_LEAVES) {
        return { ok: false, reason: "cap-reached" };
      }

      const visibleRootCols = countVisibleRootColumns(paneTree);
      if (visibleRootCols >= maxComfortableColumns) {
        // Column budget spent → balance into the SHORTEST column. While that
        // column still has room for a comfortable row, stack south; once every
        // column is full (shortest already at the row cap), tab into it instead
        // of crushing rows below the usable floor (Phase-3 overflow).
        const target = findBalancedStackTarget(paneTree);
        if (target) {
          if (target.rowCount < maxRowsPerColumn) {
            const res = dispatchEngine((tree) =>
              dropPaneIntoZone(tree, paneId, target.leafId, "south"),
            );
            if (res.ok) {
              setPaneHidden(paneId, false);
              return { ok: true };
            }
          } else {
            const res = dispatchEngine((tree) =>
              addToTabsNode(tree, paneId, target.leafId, "end"),
            );
            if (res.ok) {
              setPaneHidden(paneId, false);
              return { ok: true };
            }
            // Surfaces cap-reached (MAX_PANES_PER_TABS) so the caller can toast.
            return res;
          }
        }
      }

      setPaneHidden(paneId, false);
      return { ok: true };
    },
    [dispatchEngine, maxComfortableColumns, maxRowsPerColumn, shell],
  );

  const removePane = useCallback(
    (paneId: string): CockpitMutationResult => {
      const { paneState } = shell;
      if (!paneState[paneId]) return { ok: false, reason: "not-found" };
      if (paneState[paneId].hidden) return { ok: true };
      // Engine-consistent hide: prune any emptied column wrapper and re-home the
      // pane as a hidden leaf under the root (no lingering empty column + seams).
      return dispatchEngine((tree) => hidePaneToRoot(tree, paneId));
    },
    [dispatchEngine, shell],
  );

  const splitLeafDir = useCallback(
    (groupId: string, dir: "row" | "column"): CockpitMutationResult => {
      const { paneTree, paneOrder, paneState, setPaneHidden } = shell;
      const leafNode = findPaneTreeNodeById(paneTree, groupId);
      if (!leafNode) return { ok: false, reason: "not-found" };
      const paneIds = leafNode.paneIds ?? [leafNode.id];
      const paneId = leafNode.activeTabId ?? paneIds[0]!;
      const direction = dir === "row" ? "horizontal" : "vertical";

      if (paneIds.length > 1) {
        return dispatchEngine((tree) =>
          extractFromTabsNode(tree, paneId, direction),
        );
      }

      const hiddenId = paneOrder.find((id) => paneState[id]?.hidden);
      if (!hiddenId) return { ok: false, reason: "not-found" };
      const zone: DropZone = dir === "row" ? "east" : "south";
      const res = dispatchEngine((tree) =>
        dropPaneIntoZone(tree, hiddenId, groupId, zone),
      );
      if (res.ok) setPaneHidden(hiddenId, false);
      return res;
    },
    [dispatchEngine, shell],
  );

  const movePane = useCallback(
    (
      paneId: string,
      targetGroupId: string,
      zone: DropZone,
    ): CockpitMutationResult =>
      dispatchEngine((tree) =>
        dropPaneIntoZone(tree, paneId, targetGroupId, zone),
      ),
    [dispatchEngine],
  );

  const reorderWithinGroup = useCallback(
    (
      groupId: string,
      sourcePaneId: string,
      beforePaneId: string | null,
    ): CockpitMutationResult => {
      if (!beforePaneId) return { ok: false, reason: "not-found" };
      return dispatchEngine((tree) => {
        const node = findPaneTreeNodeById(tree, groupId);
        if (!node) return { ok: false, reason: "not-found" };
        const paneIds = [...(node.paneIds ?? [node.id])];
        const fromIdx = paneIds.indexOf(sourcePaneId);
        const beforeIdx = paneIds.indexOf(beforePaneId);
        if (fromIdx < 0 || beforeIdx < 0) {
          return { ok: false, reason: "not-found" };
        }
        if (fromIdx === beforeIdx) return { ok: false, reason: "no-op" };
        const next = paneIds.filter((id) => id !== sourcePaneId);
        const insertAt = next.indexOf(beforePaneId);
        next.splice(insertAt, 0, sourcePaneId);
        return {
          ok: true,
          tree: updatePaneTreeNodeById(tree, groupId, (n) => ({
            ...n,
            paneIds: next,
          })),
        };
      });
    },
    [dispatchEngine],
  );

  const closeTab = useCallback(
    (groupId: string, paneId: string): CockpitMutationResult => {
      const { paneTree, paneOrder, paneState } = shell;
      const visibleCount = paneOrder.filter((id) => !paneState[id]?.hidden).length;
      if (visibleCount <= 1) return { ok: false, reason: "last-pane-in-tree" };
      if (!findPaneTreeNodeById(paneTree, groupId)) {
        return { ok: false, reason: "not-found" };
      }
      // Handles both a multi-tab leaf (drops just this tab, keeps the rest) and a
      // single-pane column (prunes the wrapper); re-homes the pane as hidden.
      return dispatchEngine((tree) => hidePaneToRoot(tree, paneId));
    },
    [dispatchEngine, shell],
  );

  return {
    ...shell,
    dispatchEngine,
    addPane,
    removePane,
    splitLeafDir,
    movePane,
    reorderWithinGroup,
    closeTab,
  };
}

export type CockpitV3Layout = ReturnType<typeof useCockpitV3Layout>;
