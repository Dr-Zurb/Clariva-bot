"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  useShellLayout,
  v4TreeLayoutStorageKey,
  type ApplyLayoutOptions,
  type UseShellLayoutOptions,
} from "@/lib/patient-profile/useShellLayout";
import {
  LAYOUT_VERSION,
  extractFromTabsNode,
  dropPaneIntoZone,
  swapPaneTreeNodes,
  moveSiblingIntoGutter,
  addToTabsNode,
  hidePaneToRoot,
  hideLeafToRoot,
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
import { usePaneFocusSession } from "@/lib/patient-profile/v3/usePaneFocusSession";
import { findHostLeafInTree } from "@/lib/patient-profile/v3/focus-leaf";

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
  const { hydrated, applyLayout, setPersistSuspended } = shell;
  const paneTreeRef = useRef(shell.paneTree);
  paneTreeRef.current = shell.paneTree;

  useEffect(() => {
    if (!blankDefaultTree || !hydrated || blankSeedAppliedRef.current) return;
    blankSeedAppliedRef.current = true;
    if (typeof window === "undefined") return;
    const v4Key = v4TreeLayoutStorageKey(storageKey);
    if (window.localStorage.getItem(v4Key)) return;
    applyLayout(
      { version: LAYOUT_VERSION, paneTree: blankDefaultTree },
      { recordHistory: false },
    );
  }, [blankDefaultTree, hydrated, applyLayout, storageKey]);

  const applyFocusTree = useCallback(
    (tree: PaneTreeNode, options?: ApplyLayoutOptions) => {
      applyLayout({ version: LAYOUT_VERSION, paneTree: tree }, options);
    },
    [applyLayout],
  );

  const {
    isFocused,
    focusedLeafId,
    ratio,
    mode,
    focusPrior,
    enterSplit,
    enterFocus,
    enterPrimary,
    enterPeek,
    exitFocus,
    toggleFocus,
    discardFocusSession,
  } = usePaneFocusSession({
    getTree: () => paneTreeRef.current,
    applyTree: applyFocusTree,
    setPersistSuspended,
  });

  const dispatchEngine = useCallback(
    (
      fn: (
        tree: PaneTreeNode,
      ) => { ok: boolean; tree?: PaneTreeNode; reason?: string },
    ): CockpitMutationResult => {
      const res = fn(shell.paneTree);
      if (res.ok && res.tree) {
        discardFocusSession();
        shell.applyLayout({ version: LAYOUT_VERSION, paneTree: res.tree });
        return { ok: true };
      }
      return { ok: false, reason: res.reason };
    },
    [discardFocusSession, shell],
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

  const moveIntoGutter = useCallback(
    (
      paneId: string,
      parentId: string,
      leftChildId: string,
      rightChildId: string,
      fallbackTargetGroupId: string,
      fallbackZone: DropZone,
    ): CockpitMutationResult =>
      dispatchEngine((tree) =>
        moveSiblingIntoGutter(
          tree,
          paneId,
          parentId,
          leftChildId,
          rightChildId,
          fallbackTargetGroupId,
          fallbackZone,
        ),
      ),
    [dispatchEngine],
  );

  const reorderWithinGroup = useCallback(
    (
      groupId: string,
      sourcePaneId: string,
      overPaneId: string,
      place: "before" | "after" = "before",
    ): CockpitMutationResult => {
      return dispatchEngine((tree) => {
        const node = findPaneTreeNodeById(tree, groupId);
        if (!node) return { ok: false, reason: "not-found" };
        const paneIds = [...(node.paneIds ?? [node.id])];
        const fromIdx = paneIds.indexOf(sourcePaneId);
        const overIdx = paneIds.indexOf(overPaneId);
        if (fromIdx < 0 || overIdx < 0) {
          return { ok: false, reason: "not-found" };
        }
        if (fromIdx === overIdx) return { ok: false, reason: "no-op" };

        const next = paneIds.filter((id) => id !== sourcePaneId);
        let insertAt = next.indexOf(overPaneId);
        if (insertAt < 0) return { ok: false, reason: "not-found" };
        if (place === "after") insertAt += 1;

        // Dropping immediately before/after the neighbour we already sit beside
        // is a no-op (e.g. A before B when order is already [A, B]).
        const projected = [...next];
        projected.splice(insertAt, 0, sourcePaneId);
        if (projected.every((id, i) => id === paneIds[i])) {
          return { ok: false, reason: "no-op" };
        }

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

  const swapLeaves = useCallback(
    (
      sourceGroupId: string,
      targetGroupId: string,
    ): CockpitMutationResult =>
      dispatchEngine((tree) =>
        swapPaneTreeNodes(tree, sourceGroupId, targetGroupId),
      ),
    [dispatchEngine],
  );

  /**
   * Always-on Show here (CTF-D18–D19 / D22): put `targetPaneId` in this leaf's
   * slot. Same leaf tab → setActiveTab; else slot-preserving host swap
   * (`swapPaneTreeNodes` keeps id/sizePct/hidden). No companion path.
   */
  const showPaneHere = useCallback(
    (groupId: string, targetPaneId: string): CockpitMutationResult => {
      const tree = paneTreeRef.current;
      const leaf = findPaneTreeNodeById(tree, groupId);
      if (!leaf) return { ok: false, reason: "not-found" };
      const paneIds =
        leaf.paneIds && leaf.paneIds.length > 0 ? leaf.paneIds : [leaf.id];

      if (paneIds.includes(targetPaneId)) {
        shell.setActiveTab(groupId, targetPaneId);
        return { ok: true };
      }

      const targetHost = findHostLeafInTree(tree, targetPaneId);
      if (!targetHost) return { ok: false, reason: "not-found" };
      if (targetHost.id === groupId) return { ok: true };

      return swapLeaves(groupId, targetHost.id);
    },
    [shell, swapLeaves],
  );

  const closeTab = useCallback(
    (groupId: string, paneId: string): CockpitMutationResult => {
      const { paneTree } = shell;
      if (!findPaneTreeNodeById(paneTree, groupId)) {
        return { ok: false, reason: "not-found" };
      }
      // Same hide path as palette `removePane` — including the last visible pane
      // (empty cockpit). `hidePaneToRoot` hides in place when it is the sole leaf.
      return dispatchEngine((tree) => hidePaneToRoot(tree, paneId));
    },
    [dispatchEngine, shell],
  );

  /** Close the whole leaf (all tabs in the slot). Empty cockpit allowed. */
  const closeLeaf = useCallback(
    (groupId: string): CockpitMutationResult => {
      return dispatchEngine((tree) => hideLeafToRoot(tree, groupId));
    },
    [dispatchEngine],
  );

  const resetLayout = useCallback(() => {
    discardFocusSession();
    if (blankDefaultTree) {
      applyLayout({ version: LAYOUT_VERSION, paneTree: blankDefaultTree });
    } else {
      shell.resetLayout();
    }
  }, [blankDefaultTree, applyLayout, discardFocusSession, shell]);

  // CTF-D6: first manual resize while Focused exits Focus and keeps post-drag sizes.
  const setGroupSizes = useCallback(
    (groupId: string, sizes: Record<string, number>) => {
      discardFocusSession();
      shell.setGroupSizes(groupId, sizes);
    },
    [discardFocusSession, shell],
  );

  const setLeafSize = useCallback(
    (nodeId: string, sizePct: number) => {
      discardFocusSession();
      shell.setLeafSize(nodeId, sizePct);
    },
    [discardFocusSession, shell],
  );

  const setPaneSize = useCallback(
    (id: string, sizePct: number) => {
      setLeafSize(id, sizePct);
    },
    [setLeafSize],
  );

  return {
    ...shell,
    setGroupSizes,
    setLeafSize,
    setPaneSize,
    resetLayout,
    dispatchEngine,
    addPane,
    removePane,
    splitLeafDir,
    movePane,
    moveIntoGutter,
    reorderWithinGroup,
    swapLeaves,
    closeTab,
    closeLeaf,
    isFocused,
    focusedLeafId,
    ratio,
    mode,
    focusPrior,
    enterSplit,
    showPaneHere,
    enterFocus,
    enterPrimary,
    enterPeek,
    exitFocus,
    toggleFocus,
    discardFocusSession,
  };
}

export type CockpitV3Layout = ReturnType<typeof useCockpitV3Layout>;
