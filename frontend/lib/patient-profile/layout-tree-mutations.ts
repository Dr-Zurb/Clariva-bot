/**
 * layout-tree-mutations.ts — pure mutation engine for the recursive cockpit
 * layout tree (R-LAYOUT-UX / clpm-04).
 *
 * Every exported function takes a {@link LayoutNode} and returns a NEW
 * {@link LayoutNode}; the input tree is never mutated. The functions return
 * a discriminated union (`{ ok: true; tree }` or `{ ok: false; reason }`)
 * for operations that can fail; total functions (`countLeaves`, `findLeaf`,
 * `toggleCollapsed`, `legacyFlatToTree`) return their result directly.
 *
 * Invariants honoured by every mutation:
 *   - Leaf count is capped at {@link MAX_LEAVES} (DL-6 — soft cap, mutators
 *     refuse rather than truncate; callers toast).
 *   - A `split` always has ≥ 2 children after the mutation (single-child
 *     splits degenerate back to the child via `replaceSubtree`).
 *   - `sizes` length always matches `children` length.
 *   - The persisted shape (kind, paneId, direction, sizes, collapsed) is
 *     the only thing carried forward — no React refs, no runtime state.
 *
 * The full truth table lives in
 * `frontend/lib/patient-profile/__tests__/layout-tree-mutations.test.ts`.
 */

import type { LayoutNode, LegacyFlatLayout } from "./types";
import type { PaneTreeNode } from "./layout-tree";
import { paneTreeToFlat } from "./layout-tree";

type SplitNode = Extract<LayoutNode, { kind: "split" }>;
type PaneNode = Extract<LayoutNode, { kind: "pane" }>;

/**
 * Maximum number of pane leaves a single cockpit layout may hold.
 *
 * Sourced from the DL-6 design log entry: a layout with >10 visible panes
 * is unusable on a 13" laptop screen, so we refuse the split rather than
 * render an unusable layout. Callers should surface a toast when they see
 * `{ ok: false, reason: "cap-reached" }`.
 */
export const MAX_LEAVES = 10;

// ── Read helpers ────────────────────────────────────────────────────────────

/** Count the number of pane leaves in the tree (recursive). */
export function countLeaves(tree: LayoutNode): number {
  if (tree.kind === "pane") return 1;
  return tree.children.reduce((sum, child) => sum + countLeaves(child), 0);
}

/**
 * Locate a leaf by paneId using DFS. Returns the original node reference
 * (not a clone) when found; null otherwise. Callers must not mutate the
 * returned reference — use it as a structural witness only.
 */
export function findLeaf(tree: LayoutNode, paneId: string): PaneNode | null {
  if (tree.kind === "pane") {
    return tree.paneId === paneId ? tree : null;
  }
  for (const child of tree.children) {
    const hit = findLeaf(child, paneId);
    if (hit) return hit;
  }
  return null;
}

/**
 * Find the parent split of the leaf with `paneId` and its index within
 * `parent.children`. Returns null when the leaf is at the root (no parent)
 * or when the leaf does not exist anywhere in the tree.
 */
export function findParent(
  tree: LayoutNode,
  paneId: string,
): { parent: SplitNode; index: number } | null {
  if (tree.kind === "pane") return null;
  for (let i = 0; i < tree.children.length; i++) {
    const child = tree.children[i]!;
    if (child.kind === "pane" && child.paneId === paneId) {
      return { parent: tree, index: i };
    }
    const deeper = findParent(child, paneId);
    if (deeper) return deeper;
  }
  return null;
}

/**
 * Whether the leaf with `paneId` has at least one sibling inside its parent
 * split. Returns false when the leaf is at the root or does not exist.
 */
export function hasSibling(tree: LayoutNode, paneId: string): boolean {
  const located = findParent(tree, paneId);
  return !!located && located.parent.children.length > 1;
}

// ── Mutation results ────────────────────────────────────────────────────────

type Ok = { ok: true; tree: LayoutNode };
type Err<R extends string> = { ok: false; reason: R };

/**
 * Split a leaf in two. The original leaf becomes the first child of a new
 * split node; the second child is a fresh leaf with `newPaneId`. The original
 * leaf's `collapsed` flag is preserved on the first child.
 *
 * Failure modes:
 *   - `cap-reached`  — leaf count would exceed {@link MAX_LEAVES}.
 *   - `not-found`    — `paneId` is not present in the tree.
 */
export function splitLeaf(
  tree: LayoutNode,
  paneId: string,
  direction: "horizontal" | "vertical",
  newPaneId: string,
): Ok | Err<"cap-reached" | "not-found"> {
  if (countLeaves(tree) >= MAX_LEAVES) {
    return { ok: false, reason: "cap-reached" };
  }
  const existing = findLeaf(tree, paneId);
  if (!existing) return { ok: false, reason: "not-found" };

  const originalCopy: PaneNode =
    existing.collapsed !== undefined
      ? { kind: "pane", paneId, collapsed: existing.collapsed }
      : { kind: "pane", paneId };

  const newSplit: SplitNode = {
    kind: "split",
    direction,
    children: [originalCopy, { kind: "pane", paneId: newPaneId }],
    sizes: [50, 50],
  };

  return { ok: true, tree: replaceLeafById(tree, paneId, newSplit) };
}

/**
 * Remove a leaf from its parent split; the leftmost remaining sibling
 * absorbs the released size. When the parent split is left with a single
 * child, the split collapses back to that child (no orphan single-child
 * splits remain in the tree).
 *
 * Failure modes:
 *   - `no-sibling` — parent split has only this leaf (cannot collapse).
 *   - `not-found`  — `paneId` is at the root, or absent.
 */
export function mergeWithSibling(
  tree: LayoutNode,
  paneId: string,
): Ok | Err<"no-sibling" | "not-found"> {
  const located = findParent(tree, paneId);
  if (!located) return { ok: false, reason: "not-found" };
  if (located.parent.children.length < 2) {
    return { ok: false, reason: "no-sibling" };
  }

  const { parent, index } = located;
  const remainingChildren = parent.children.filter((_, i) => i !== index);
  const releasedSize = parent.sizes[index] ?? 0;
  const remainingSizes = parent.sizes
    .filter((_, i) => i !== index)
    .map((s, i) => (i === 0 ? s + releasedSize : s));

  const replacement: LayoutNode =
    remainingChildren.length === 1
      ? remainingChildren[0]!
      : { ...parent, children: remainingChildren, sizes: remainingSizes };

  return { ok: true, tree: replaceSubtree(tree, parent, replacement) };
}

/**
 * Toggle the `collapsed` flag on the leaf with `paneId`. An undefined flag
 * is treated as `false` (so the first toggle flips it to `true`). All other
 * nodes in the tree are returned unchanged (by reference where possible,
 * via fresh wrappers along the path-to-root).
 */
export function toggleCollapsed(tree: LayoutNode, paneId: string): LayoutNode {
  return mapTree(tree, (node) => {
    if (node.kind === "pane" && node.paneId === paneId) {
      return { ...node, collapsed: !(node.collapsed ?? false) };
    }
    return node;
  });
}

/**
 * Remove a leaf entirely. The released size is distributed evenly across
 * the remaining siblings of the parent split. When the parent split is
 * left with a single child, the split collapses back to that child.
 *
 * Failure modes:
 *   - `would-remove-last-leaf` — the tree has only one leaf; refuse.
 *   - `not-found`              — `paneId` is at the root, or absent.
 */
export function hideLeaf(
  tree: LayoutNode,
  paneId: string,
): Ok | Err<"would-remove-last-leaf" | "not-found"> {
  if (countLeaves(tree) <= 1) {
    return { ok: false, reason: "would-remove-last-leaf" };
  }
  const located = findParent(tree, paneId);
  if (!located) return { ok: false, reason: "not-found" };

  const { parent, index } = located;
  const remainingChildren = parent.children.filter((_, i) => i !== index);
  const releasedSize = parent.sizes[index] ?? 0;
  const share = releasedSize / Math.max(remainingChildren.length, 1);
  const remainingSizes = parent.sizes
    .filter((_, i) => i !== index)
    .map((s) => s + share);

  const replacement: LayoutNode =
    remainingChildren.length === 1
      ? remainingChildren[0]!
      : { ...parent, children: remainingChildren, sizes: remainingSizes };

  return { ok: true, tree: replaceSubtree(tree, parent, replacement) };
}

/**
 * Insert a previously hidden built-in pane back into the tree. The new leaf
 * is appended to the rightmost split's children, with its share carved out
 * proportionally from the existing siblings (so the parent's overall size
 * remains 100). When the root is a leaf, the whole tree is wrapped in a
 * fresh horizontal split with the new leaf added on the right.
 *
 * Failure modes:
 *   - `already-present` — `paneId` already lives somewhere in the tree.
 *   - `cap-reached`     — adding the leaf would exceed {@link MAX_LEAVES}.
 */
export function restoreLeaf(
  tree: LayoutNode,
  paneId: string,
): Ok | Err<"already-present" | "cap-reached"> {
  if (findLeaf(tree, paneId)) return { ok: false, reason: "already-present" };
  if (countLeaves(tree) >= MAX_LEAVES) {
    return { ok: false, reason: "cap-reached" };
  }

  const newLeaf: PaneNode = { kind: "pane", paneId };

  if (tree.kind === "pane") {
    const wrapped: SplitNode = {
      kind: "split",
      direction: "horizontal",
      children: [{ ...tree }, newLeaf],
      sizes: [50, 50],
    };
    return { ok: true, tree: wrapped };
  }

  const target = findRightmostSplit(tree);
  const nextCount = target.children.length + 1;
  const newShare = 100 / nextCount;
  const scale = (100 - newShare) / 100;
  const newSizes = [...target.sizes.map((s) => s * scale), newShare];
  const expanded: SplitNode = {
    ...target,
    children: [...target.children, newLeaf],
    sizes: newSizes,
  };
  return { ok: true, tree: replaceSubtree(tree, target, expanded) };
}

/**
 * Convert a legacy 099 flat three-column layout into a {@link LayoutNode}.
 * Slots become a single horizontal split with one leaf per slot. The
 * collapsed flags from the legacy `collapsed` map are transferred onto the
 * matching leaves; slots without a collapsed flag default to uncollapsed.
 */
export function legacyFlatToTree(legacy: LegacyFlatLayout): LayoutNode {
  const children: PaneNode[] = legacy.slots.map((slot) => ({
    kind: "pane",
    paneId: slot,
    collapsed: legacyCollapsedFor(legacy, slot),
  }));
  return {
    kind: "split",
    direction: "horizontal",
    children,
    sizes: legacy.widths.slice(),
  };
}

// ── Internal helpers ────────────────────────────────────────────────────────

function legacyCollapsedFor(legacy: LegacyFlatLayout, slot: string): boolean {
  if (slot === "chart") return legacy.collapsed.chart;
  if (slot === "rx") return legacy.collapsed.rx;
  if (slot === "body") return legacy.collapsed.body ?? false;
  return false;
}

function findRightmostSplit(tree: SplitNode): SplitNode {
  const last = tree.children[tree.children.length - 1];
  if (last && last.kind === "split") {
    return findRightmostSplit(last);
  }
  return tree;
}

/**
 * Replace exactly the leaf with the matching `paneId` by `replacement`.
 * Walks the ORIGINAL tree only — does not recurse into `replacement`, so it
 * is safe to substitute a subtree that itself contains a leaf with the same
 * paneId (as `splitLeaf` does when re-parenting the original leaf inside a
 * fresh split).
 */
function replaceLeafById(
  tree: LayoutNode,
  targetPaneId: string,
  replacement: LayoutNode,
): LayoutNode {
  if (tree.kind === "pane") {
    return tree.paneId === targetPaneId ? replacement : tree;
  }
  return {
    ...tree,
    children: tree.children.map((c) => replaceLeafById(c, targetPaneId, replacement)),
  };
}

/**
 * Reference-equality subtree swap. Used by `mergeWithSibling`, `hideLeaf`,
 * and `restoreLeaf` after they have located the exact `oldSubtree` instance
 * inside `tree` via `findParent` / `findRightmostSplit`.
 */
function replaceSubtree(
  tree: LayoutNode,
  oldSubtree: LayoutNode,
  newSubtree: LayoutNode,
): LayoutNode {
  if (tree === oldSubtree) return newSubtree;
  if (tree.kind === "pane") return tree;
  return {
    ...tree,
    children: tree.children.map((c) => replaceSubtree(c, oldSubtree, newSubtree)),
  };
}

/**
 * Functor-style map that visits every node post-order. The mapper runs on
 * the node first; if the result is a split, the mapper is then applied to
 * each of its children. Used by `toggleCollapsed` where the per-node
 * transform never replaces a leaf with a split, so infinite recursion is
 * not a concern.
 */
function mapTree(tree: LayoutNode, fn: (n: LayoutNode) => LayoutNode): LayoutNode {
  const out = fn(tree);
  if (out.kind === "pane") return out;
  return { ...out, children: out.children.map((c) => mapTree(c, fn)) };
}

// ── PaneTreeNode tab mutations (cpf-02) ─────────────────────────────────────

/**
 * Soft cap on number of panes inside one tabs container. Beyond this, the tab
 * strip overflows into a popover ("more" chevron). The cap is enforced at the
 * mutation layer so doctors can't construct unrenderable containers via API.
 */
export const MAX_PANES_PER_TABS = 6;

/**
 * The five drop targets a container exposes during a drag (cpfd-01).
 * `center` = tab into the container; the four edges = split as a sibling on
 * that side. Imported by `<PaneDropOverlay>` (cpfd-02) and the shell wiring
 * (cpfd-03) so the zone vocabulary has a single source of truth.
 */
export type DropZone = "center" | "north" | "south" | "east" | "west";

export type TabsAddPosition = "start" | "end" | number;

type PaneTreeOk = { ok: true; tree: PaneTreeNode };
type PaneTreeErr<R extends string> = { ok: false; reason: R };

let paneTreeSplitCounter = 0;

function isPaneTreeLeaf(n: PaneTreeNode): boolean {
  return !n.children?.length;
}

function countPaneTreeLeaves(tree: PaneTreeNode): number {
  if (isPaneTreeLeaf(tree)) return 1;
  return tree.children!.reduce((sum, c) => sum + countPaneTreeLeaves(c), 0);
}

function findPaneTreeNodeById(tree: PaneTreeNode, nodeId: string): PaneTreeNode | null {
  if (tree.id === nodeId) return tree;
  if (tree.children) {
    for (const c of tree.children) {
      const hit = findPaneTreeNodeById(c, nodeId);
      if (hit) return hit;
    }
  }
  return null;
}

function findContainerOf(
  tree: PaneTreeNode,
  paneId: string,
): { container: PaneTreeNode; index: number } | null {
  function walk(n: PaneTreeNode): { container: PaneTreeNode; index: number } | null {
    if (isPaneTreeLeaf(n)) {
      const paneIds = n.paneIds ?? [n.id];
      const idx = paneIds.indexOf(paneId);
      if (idx >= 0) return { container: n, index: idx };
      return null;
    }
    for (const c of n.children!) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return null;
  }
  return walk(tree);
}

function findParentOfPaneTreeNode(
  root: PaneTreeNode,
  targetId: string,
): { parent: PaneTreeNode; index: number } | null {
  if (!root.children?.length) return null;
  const direct = root.children.findIndex((c) => c.id === targetId);
  if (direct >= 0) return { parent: root, index: direct };
  for (const child of root.children) {
    const nested = findParentOfPaneTreeNode(child, targetId);
    if (nested) return nested;
  }
  return null;
}

function compactSingleChildSplits(tree: PaneTreeNode): PaneTreeNode {
  if (isPaneTreeLeaf(tree)) return tree;
  const children = tree.children!.map(compactSingleChildSplits);
  if (children.length === 1 && tree.id !== "__root__") {
    return children[0]!;
  }
  const same = children.every((c, i) => c === tree.children![i]);
  return same ? tree : { ...tree, children };
}

function updatePaneTreeNodeById(
  tree: PaneTreeNode,
  nodeId: string,
  updater: (n: PaneTreeNode) => PaneTreeNode,
): PaneTreeNode {
  if (tree.id === nodeId) return updater(tree);
  if (!tree.children?.length) return tree;
  let changed = false;
  const children = tree.children.map((c) => {
    const next = updatePaneTreeNodeById(c, nodeId, updater);
    if (next !== c) changed = true;
    return next;
  });
  return changed ? { ...tree, children } : tree;
}

function replacePaneTreeNodeById(
  tree: PaneTreeNode,
  nodeId: string,
  replacement: PaneTreeNode | null,
): PaneTreeNode | null {
  if (tree.id === nodeId) return replacement;
  if (!tree.children?.length) return tree;
  const newChildren: PaneTreeNode[] = [];
  let changed = false;
  for (const c of tree.children) {
    const next = replacePaneTreeNodeById(c, nodeId, replacement);
    if (next === null) {
      changed = true;
      continue;
    }
    if (next !== c) changed = true;
    newChildren.push(next);
  }
  if (!changed) return tree;
  if (newChildren.length === 0) return null;
  return compactSingleChildSplits({ ...tree, children: newChildren });
}

function makeSinglePaneLeaf(
  paneId: string,
  sizePct: number,
  hidden: boolean,
): PaneTreeNode {
  return {
    id: paneId,
    sizePct,
    hidden,
    paneIds: [paneId],
    activeTabId: paneId,
  };
}

function normalizeLeafAfterPaneRemoval(
  container: PaneTreeNode,
  remainingPaneIds: string[],
): PaneTreeNode | null {
  if (remainingPaneIds.length === 0) return null;
  const activeTabId =
    container.activeTabId && remainingPaneIds.includes(container.activeTabId)
      ? container.activeTabId
      : remainingPaneIds[0]!;
  if (remainingPaneIds.length === 1) {
    const sole = remainingPaneIds[0]!;
    // Preserve synthetic tabs-container ids (e.g. __tabs_0) for resize-key stability.
    if (
      container.id.startsWith("__tabs_") ||
      (container.paneIds && container.paneIds.length > 1)
    ) {
      return {
        ...container,
        paneIds: remainingPaneIds,
        activeTabId,
      };
    }
    return makeSinglePaneLeaf(sole, container.sizePct, container.hidden);
  }
  return {
    ...container,
    paneIds: remainingPaneIds,
    activeTabId,
  };
}

function removePaneFromCurrentContainer(
  tree: PaneTreeNode,
  paneId: string,
): { tree: PaneTreeNode; sourceContainerId: string } | null {
  const located = findContainerOf(tree, paneId);
  if (!located) return null;
  const { container, index } = located;
  const paneIds = [...(container.paneIds ?? [container.id])];
  const nextPaneIds = paneIds.filter((_, i) => i !== index);

  let newTree: PaneTreeNode;
  if (nextPaneIds.length === 0) {
    const without = replacePaneTreeNodeById(tree, container.id, null);
    if (!without) return null;
    newTree = without;
  } else {
    const updated = normalizeLeafAfterPaneRemoval(container, nextPaneIds)!;
    newTree = updatePaneTreeNodeById(tree, container.id, () => updated);
  }
  return { tree: compactSingleChildSplits(newTree), sourceContainerId: container.id };
}

/**
 * Hide a single pane WITHOUT leaving an empty structural wrapper behind.
 *
 * The shell's `setPaneHidden` only flips a leaf's `hidden` flag. When that leaf
 * was the last occupant of a `__split_*` column the now-empty group lingers (its
 * own `hidden` stays false), so the renderer paints an empty column + resize
 * seams and the column-cap math counts a phantom column. This is the hide-side
 * counterpart to the drag-removal path: it detaches the pane from its current
 * container (pruning the emptied group + compacting single-child splits via
 * {@link removePaneFromCurrentContainer}) and re-homes it as a hidden leaf
 * directly under `__root__` — matching the blank-tree convention so the palette /
 * `addPane` can bring it back exactly like a never-shown pane.
 *
 * A single-pane leaf that already sits directly under `__root__` is hidden in
 * place (no restructuring), preserving the existing clean flat-column behavior
 * and the pane's left-to-right position.
 *
 * Failure modes:
 *   - `not-found` — `paneId` is not present anywhere in the tree.
 */
export function hidePaneToRoot(
  tree: PaneTreeNode,
  paneId: string,
): PaneTreeOk | PaneTreeErr<"not-found"> {
  const located = findContainerOf(tree, paneId);
  if (!located) return { ok: false, reason: "not-found" };
  const { container } = located;

  const hideInPlace = (): PaneTreeNode =>
    updatePaneTreeNodeById(tree, paneId, (n) => ({ ...n, hidden: true }));

  // Flat single-pane column under the root already collapses cleanly (the root
  // filters hidden children) — hide in place to keep its position.
  const parentLoc = findParentOfPaneTreeNode(tree, container.id);
  const isSinglePaneLeaf =
    isPaneTreeLeaf(container) && (container.paneIds?.length ?? 1) <= 1;
  if (parentLoc?.parent.id === "__root__" && isSinglePaneLeaf) {
    return { ok: true, tree: hideInPlace() };
  }

  // Nested split (stacked column/row) or tabs container → detach (prunes the
  // emptied group + compacts single-child splits) then re-home as hidden.
  const removed = removePaneFromCurrentContainer(tree, paneId);
  if (!removed) {
    // Pane was the sole leaf in the whole tree — hide in place (blank state).
    return { ok: true, tree: hideInPlace() };
  }
  const hiddenLeaf = makeSinglePaneLeaf(paneId, container.sizePct, true);
  const rootTree: PaneTreeNode =
    removed.tree.id === "__root__" && removed.tree.children
      ? { ...removed.tree, children: [...removed.tree.children, hiddenLeaf] }
      : {
          id: "__root__",
          sizePct: 100,
          hidden: false,
          direction: "horizontal",
          children: [removed.tree, hiddenLeaf],
        };
  return { ok: true, tree: rootTree };
}

function resolveInsertIndex(length: number, position: TabsAddPosition): number {
  if (position === "start") return 0;
  if (position === "end") return length;
  return Math.min(Math.max(0, position), length);
}

function nextPaneTreeSplitId(): string {
  return `__split_${paneTreeSplitCounter++}`;
}

/**
 * Move `paneId` from its current home (anywhere in the tree) to the tabs
 * container identified by `targetGroupId`, inserted at `position` (default end).
 * The moved pane becomes the active tab in the target container.
 */
export function addToTabsNode(
  tree: PaneTreeNode,
  paneId: string,
  targetGroupId: string,
  position: TabsAddPosition = "end",
): PaneTreeOk | PaneTreeErr<"not-found" | "already-in-target" | "cap-reached"> {
  const target = findPaneTreeNodeById(tree, targetGroupId);
  if (!target || !isPaneTreeLeaf(target)) {
    return { ok: false, reason: "not-found" };
  }

  const targetPaneIds = [...(target.paneIds ?? [target.id])];
  if (targetPaneIds.includes(paneId)) {
    return { ok: false, reason: "already-in-target" };
  }
  if (targetPaneIds.length >= MAX_PANES_PER_TABS) {
    return { ok: false, reason: "cap-reached" };
  }

  if (!findContainerOf(tree, paneId)) {
    return { ok: false, reason: "not-found" };
  }

  const removed = removePaneFromCurrentContainer(tree, paneId);
  if (!removed) return { ok: false, reason: "not-found" };

  const targetAfterRemoval = findPaneTreeNodeById(removed.tree, targetGroupId);
  if (!targetAfterRemoval || !isPaneTreeLeaf(targetAfterRemoval)) {
    return { ok: false, reason: "not-found" };
  }

  const currentIds = [...(targetAfterRemoval.paneIds ?? [targetAfterRemoval.id])];
  const insertAt = resolveInsertIndex(currentIds.length, position);
  const nextIds = [...currentIds];
  nextIds.splice(insertAt, 0, paneId);

  const updatedTree = updatePaneTreeNodeById(removed.tree, targetGroupId, (n) => ({
    ...n,
    paneIds: nextIds,
    activeTabId: paneId,
  }));

  return { ok: true, tree: updatedTree };
}

/**
 * Remove `paneId` from its current tabs container and create a new sibling
 * leaf holding only that pane. The new leaf is inserted next to the source
 * container (horizontal = right, vertical = below via nested split when needed).
 */
export function extractFromTabsNode(
  tree: PaneTreeNode,
  paneId: string,
  direction: "horizontal" | "vertical",
): PaneTreeOk | PaneTreeErr<"not-found" | "last-pane-in-tree" | "cap-reached"> {
  const located = findContainerOf(tree, paneId);
  if (!located) return { ok: false, reason: "not-found" };

  const { paneOrder } = paneTreeToFlat(tree);
  if (paneOrder.length <= 1) {
    return { ok: false, reason: "last-pane-in-tree" };
  }

  if (countPaneTreeLeaves(tree) >= MAX_LEAVES) {
    return { ok: false, reason: "cap-reached" };
  }

  const { container } = located;
  const parentLoc = findParentOfPaneTreeNode(tree, container.id);
  if (!parentLoc) {
    return { ok: false, reason: "not-found" };
  }

  const { parent: parentNode, index: childIndex } = parentLoc;
  const originalSize = container.sizePct;
  const originalHidden = container.hidden;
  const sourceContainerId = container.id;
  const paneIds = container.paneIds ?? [container.id];
  const containerEmptied = paneIds.length === 1;

  const removed = removePaneFromCurrentContainer(tree, paneId);
  if (!removed) return { ok: false, reason: "not-found" };

  const extractedLeaf = makeSinglePaneLeaf(
    paneId,
    originalSize / 2,
    originalHidden,
  );

  const resultTree = updatePaneTreeNodeById(removed.tree, parentNode.id, (p) => {
    if (!p.children?.length) return p;
    const children = [...p.children];

    if (containerEmptied) {
      const insertAt = Math.min(childIndex, children.length);
      children.splice(insertAt, 0, makeSinglePaneLeaf(paneId, originalSize, originalHidden));
      return { ...p, children };
    }

    const sourceIdx = children.findIndex((c) => c.id === sourceContainerId);
    if (sourceIdx < 0) return p;

    const sourceNode = children[sourceIdx]!;
    const half = originalSize / 2;
    const sizedSource = { ...sourceNode, sizePct: half };
    const sizedExtracted = { ...extractedLeaf, sizePct: half };

    if (direction === "vertical" && p.direction !== "vertical") {
      children[sourceIdx] = {
        id: nextPaneTreeSplitId(),
        sizePct: originalSize,
        hidden: sourceNode.hidden,
        direction: "vertical",
        children: [sizedSource, sizedExtracted],
      };
    } else {
      children[sourceIdx] = sizedSource;
      children.splice(sourceIdx + 1, 0, sizedExtracted);
    }

    return { ...p, children };
  });

  return { ok: true, tree: compactSingleChildSplits(resultTree) };
}

/**
 * Move `sourcePaneId` onto `targetGroupId`'s `zone`:
 *   - "center"            → tab into the target (delegates to addToTabsNode).
 *   - "west" / "east"     → new single-pane sibling leaf left / right of target.
 *   - "north" / "south"   → new single-pane sibling leaf above / below target.
 *
 * Edge drops resolve the target's parent orientation:
 *   - parent axis === zone axis → insert the new leaf into the parent's children
 *     at (targetIndex) for west/north or (targetIndex + 1) for east/south.
 *   - parent axis !== zone axis → replace the target with a fresh nested split of
 *     the zone axis, children [newLeaf, target] (west/north) or [target, newLeaf]
 *     (east/south), each at half the target's original sizePct.
 *
 * Single-home (DL-10): sourcePaneId is removed from its current container first.
 *
 * Failure modes:
 *   - "not-found"        — sourcePaneId or targetGroupId absent.
 *   - "already-in-target"— center drop where sourcePaneId is already in target.
 *   - "cap-reached"      — edge drop would exceed MAX_LEAVES, or center drop
 *                          would exceed MAX_PANES_PER_TABS.
 *   - "last-pane-in-tree"— edge drop where sourcePaneId is the only pane in the
 *                          whole tree (nothing to split against).
 *   - "no-op"            — the drop would not change the tree (e.g. dropping a
 *                          single-pane container's only pane on its own edge).
 */
export function dropPaneIntoZone(
  tree: PaneTreeNode,
  sourcePaneId: string,
  targetGroupId: string,
  zone: DropZone,
): PaneTreeOk | PaneTreeErr<
  "not-found" | "already-in-target" | "cap-reached" | "last-pane-in-tree" | "no-op"
> {
  if (zone === "center") {
    return addToTabsNode(tree, sourcePaneId, targetGroupId, "end");
  }

  const source = findContainerOf(tree, sourcePaneId);
  if (!source) return { ok: false, reason: "not-found" };
  const target = findPaneTreeNodeById(tree, targetGroupId);
  if (!target || !isPaneTreeLeaf(target)) return { ok: false, reason: "not-found" };

  const sourceIsSoleOccupantOfTarget =
    source.container.id === target.id &&
    (target.paneIds ?? [target.id]).length === 1;
  if (sourceIsSoleOccupantOfTarget) return { ok: false, reason: "no-op" };

  const { paneOrder } = paneTreeToFlat(tree);
  if (paneOrder.length <= 1) return { ok: false, reason: "last-pane-in-tree" };

  if (countPaneTreeLeaves(tree) >= MAX_LEAVES) {
    return { ok: false, reason: "cap-reached" };
  }

  const removed = removePaneFromCurrentContainer(tree, sourcePaneId);
  if (!removed) return { ok: false, reason: "not-found" };

  const targetAfter = findPaneTreeNodeById(removed.tree, targetGroupId);
  if (!targetAfter || !isPaneTreeLeaf(targetAfter)) {
    return { ok: false, reason: "no-op" };
  }

  const axis: "horizontal" | "vertical" =
    zone === "east" || zone === "west" ? "horizontal" : "vertical";
  const insertBefore = zone === "west" || zone === "north";

  const newLeaf = makeSinglePaneLeaf(
    sourcePaneId,
    targetAfter.sizePct / 2,
    targetAfter.hidden,
  );

  const parentLoc = findParentOfPaneTreeNode(removed.tree, targetGroupId);

  let resultTree: PaneTreeNode;

  if (!parentLoc) {
    const wrappedTarget = { ...targetAfter, sizePct: 50 };
    const wrappedNew = { ...newLeaf, sizePct: 50 };
    resultTree = {
      id: removed.tree.id === "__root__" ? "__root__" : nextPaneTreeSplitId(),
      sizePct: removed.tree.sizePct,
      hidden: removed.tree.hidden,
      direction: axis,
      children: insertBefore
        ? [wrappedNew, wrappedTarget]
        : [wrappedTarget, wrappedNew],
    };
  } else {
    const { parent, index: targetIndex } = parentLoc;
    const parentAxis = parent.direction ?? "horizontal";

    if (parentAxis === axis) {
      const half = targetAfter.sizePct / 2;
      const sizedTarget = { ...targetAfter, sizePct: half };
      const sizedNew = { ...newLeaf, sizePct: half };
      const insertAt = insertBefore ? targetIndex : targetIndex + 1;

      resultTree = updatePaneTreeNodeById(removed.tree, parent.id, (p) => {
        if (!p.children?.length) return p;
        const children = [...p.children];
        const idx = children.findIndex((c) => c.id === targetGroupId);
        if (idx < 0) return p;
        children[idx] = sizedTarget;
        children.splice(insertAt, 0, sizedNew);
        return { ...p, children };
      });
    } else {
      const nestedSplit: PaneTreeNode = {
        id: nextPaneTreeSplitId(),
        sizePct: targetAfter.sizePct,
        hidden: targetAfter.hidden,
        direction: axis,
        children: insertBefore
          ? [{ ...newLeaf, sizePct: 50 }, { ...targetAfter, sizePct: 50 }]
          : [{ ...targetAfter, sizePct: 50 }, { ...newLeaf, sizePct: 50 }],
      };
      resultTree = updatePaneTreeNodeById(removed.tree, targetGroupId, () => nestedSplit);
    }
  }

  return { ok: true, tree: compactSingleChildSplits(resultTree) };
}

/**
 * Convenience: remove from current home and add to `toGroupId` (end position).
 */
export function moveLeafBetweenTabs(
  tree: PaneTreeNode,
  paneId: string,
  toGroupId: string,
): PaneTreeOk | PaneTreeErr<"not-found" | "already-in-target"> {
  const source = findContainerOf(tree, paneId);
  if (!source) return { ok: false, reason: "not-found" };
  if (source.container.id === toGroupId) {
    return { ok: false, reason: "already-in-target" };
  }
  const result = addToTabsNode(tree, paneId, toGroupId, "end");
  if (!result.ok && result.reason === "cap-reached") {
    return { ok: false, reason: "not-found" };
  }
  return result as PaneTreeOk | PaneTreeErr<"not-found" | "already-in-target">;
}

/**
 * Pure update of `activeTabId` on the tabs node matching `groupId`.
 */
export function setActiveTab(
  tree: PaneTreeNode,
  groupId: string,
  paneId: string,
): PaneTreeOk | PaneTreeErr<"not-found" | "not-in-tabs"> {
  const node = findPaneTreeNodeById(tree, groupId);
  if (!node || !isPaneTreeLeaf(node)) {
    return { ok: false, reason: "not-found" };
  }
  const paneIds = node.paneIds ?? [node.id];
  if (!paneIds.includes(paneId)) {
    return { ok: false, reason: "not-in-tabs" };
  }
  if (node.activeTabId === paneId) {
    return { ok: true, tree };
  }
  return {
    ok: true,
    tree: updatePaneTreeNodeById(tree, groupId, (n) => ({ ...n, activeTabId: paneId })),
  };
}
