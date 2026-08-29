/**
 * focus-leaf.ts — pure PaneTreeNode Focus / snap-rail transforms
 * (cockpit-tab-focus · CTF-D23 global snap rail).
 *
 * Full: path to host → siblings hidden → focused branch ~100%.
 * Wide / Even / Narrow (CTF-D23): the focused leaf is lifted to a NEW root-level
 * column at f% of the *screen width* (67 / 50 / 33). Every other visible leaf is
 * re-parented into a single vertical companion "rail" that takes 100-f% of the
 * width. This gives the focused pane a real fraction of the screen even when the
 * layout is crowded (5+ columns), because the rail only costs one column's
 * min-width. Hidden panes are preserved as hidden root siblings so a later drag
 * (which commits the live tree) never loses them.
 *
 * Trade-off: re-parenting remounts the non-focused panes (transient UI state is
 * lost; Rx form state lives outside the tree, so it survives). Restore rebuilds
 * the exact prior tree, so the reshuffle is session-scoped only.
 *
 * Target `leafId` may be a leaf `id` or a pane id inside `paneIds`.
 *
 * @see docs/Work/Daily-plans/July 2026/17-07-2026/cockpit-tab-focus/
 */

import {
  deserialiseTree,
  serialiseTree,
  type PaneTreeNode,
} from "@/lib/patient-profile/layout-tree";

export type FocusLeafReason = "not-found";

export type FocusLeafResult =
  | { ok: true; tree: PaneTreeNode }
  | { ok: false; reason: FocusLeafReason };

/** Wide focused share of the screen (CTF-D23). */
export const PRIMARY_FOCUS_PCT = 67;
/** @deprecated Rail remainder after wide focus; not a single neighbour. */
export const PRIMARY_NEIGHBOUR_PCT = 33;
/** Even focused share of the screen (CTF-D23). */
export const PEEK_FOCUS_PCT = 50;
/** @deprecated Rail remainder after even focus. */
export const PEEK_NEIGHBOUR_PCT = 50;
/** Narrow focused share of the screen (CTF-D23). */
export const NARROW_FOCUS_PCT = 33;
/** @deprecated Rail remainder after narrow focus. */
export const NARROW_NEIGHBOUR_PCT = 67;

/** Stable id for the ephemeral companion rail (session-only, never persisted). */
export const FOCUS_RAIL_ID = "__focus_rail__";

/** Discrete split ratios for the visual picker (CTF-D15 / D17 / D23). */
export type PaneSplitRatio = "full" | "wide" | "even" | "narrow";

export type SplitRatioPcts = {
  focusPct: number;
  /** Width left for the companion rail (all other visible panes). */
  neighbourPct: number;
};

/** Ratio → focused screen share. `full` hides siblings (use Focus). */
export const SPLIT_RATIO_PCTS: Readonly<
  Record<Exclude<PaneSplitRatio, "full">, SplitRatioPcts>
> = {
  wide: { focusPct: PRIMARY_FOCUS_PCT, neighbourPct: PRIMARY_NEIGHBOUR_PCT },
  even: { focusPct: PEEK_FOCUS_PCT, neighbourPct: PEEK_NEIGHBOUR_PCT },
  narrow: { focusPct: NARROW_FOCUS_PCT, neighbourPct: NARROW_NEIGHBOUR_PCT },
};

/** Deep-clone via stable serialise/deserialise (same as layout presets). */
export function clonePaneTree(tree: PaneTreeNode): PaneTreeNode {
  return deserialiseTree(serialiseTree(tree));
}

function isLeaf(node: PaneTreeNode): boolean {
  return !node.children?.length;
}

/** True when `leafId` addresses this leaf (node id or a tab pane id). */
function leafMatches(node: PaneTreeNode, leafId: string): boolean {
  if (!isLeaf(node)) return false;
  if (node.id === leafId) return true;
  return node.paneIds?.includes(leafId) ?? false;
}

function findHostLeaf(root: PaneTreeNode, leafId: string): PaneTreeNode | null {
  if (leafMatches(root, leafId)) return root;
  if (!root.children?.length) return null;
  for (const child of root.children) {
    const hit = findHostLeaf(child, leafId);
    if (hit) return hit;
  }
  return null;
}

/** Node ids from root → host leaf (inclusive). */
function findPathIds(root: PaneTreeNode, hostId: string): string[] | null {
  if (root.id === hostId) return [root.id];
  if (!root.children?.length) return null;
  for (const child of root.children) {
    const sub = findPathIds(child, hostId);
    if (sub) return [root.id, ...sub];
  }
  return null;
}

function hideSubtree(node: PaneTreeNode): PaneTreeNode {
  if (!node.children?.length) {
    return { ...node, hidden: true };
  }
  return {
    ...node,
    hidden: true,
    children: node.children.map(hideSubtree),
  };
}

/** DFS: every leaf pane/host id, including hidden (for Show here). */
function collectAllLeafIds(root: PaneTreeNode): string[] {
  const ids: string[] = [];
  function walk(n: PaneTreeNode): void {
    if (isLeaf(n)) {
      ids.push(n.paneIds?.[0] ?? n.id);
      return;
    }
    for (const child of n.children ?? []) walk(child);
  }
  walk(root);
  return ids;
}

/** DFS: every leaf node with its effective visibility (ancestor-aware). */
function collectLeafEntries(
  root: PaneTreeNode,
): { node: PaneTreeNode; visible: boolean }[] {
  const out: { node: PaneTreeNode; visible: boolean }[] = [];
  function walk(n: PaneTreeNode, ancestorHidden: boolean): void {
    const effHidden = ancestorHidden || Boolean(n.hidden);
    if (isLeaf(n)) {
      out.push({ node: n, visible: !effHidden });
      return;
    }
    for (const child of n.children ?? []) walk(child, effHidden);
  }
  walk(root, false);
  return out;
}

/** Assign equal sizePct across `nodes` summing to `total`, drift to the last. */
function equalSized(nodes: PaneTreeNode[], total: number): PaneTreeNode[] {
  const n = nodes.length;
  if (n === 0) return nodes;
  const each = Math.round((total / n) * 10) / 10;
  const sized = nodes.map((node) => ({ ...node, sizePct: each }));
  const sum = sized.reduce((acc, c) => acc + c.sizePct, 0);
  const drift = Math.round((total - sum) * 10) / 10;
  if (drift !== 0) {
    const last = sized[sized.length - 1]!;
    sized[sized.length - 1] = {
      ...last,
      sizePct: Math.min(100, Math.max(0, last.sizePct + drift)),
    };
  }
  return sized;
}

/**
 * Visible siblings share 100%. Focus leaves exactly one visible child per
 * split on the path; if more somehow remain, scale like prune-layout-leaves.
 */
function rebalanceFocusedSiblings(children: PaneTreeNode[]): PaneTreeNode[] {
  const visible = children.filter((c) => !c.hidden);
  if (visible.length === 0) return children;
  if (visible.length === 1) {
    const onlyId = visible[0]!.id;
    return children.map((c) =>
      c.id === onlyId && !c.hidden ? { ...c, sizePct: 100 } : c,
    );
  }
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

function applyLeafActive(
  node: PaneTreeNode,
  activePaneId: string | null,
): PaneTreeNode {
  const next: PaneTreeNode = { ...node, hidden: false };
  if (
    activePaneId &&
    next.paneIds?.includes(activePaneId) &&
    next.activeTabId !== activePaneId
  ) {
    next.activeTabId = activePaneId;
  }
  return next;
}

function focusWalk(
  node: PaneTreeNode,
  pathSet: ReadonlySet<string>,
  hostId: string,
  activePaneId: string | null,
): PaneTreeNode {
  if (isLeaf(node)) {
    if (node.id !== hostId) {
      return { ...node, hidden: true };
    }
    return applyLeafActive(node, activePaneId);
  }

  const children = (node.children ?? []).map((child) => {
    if (pathSet.has(child.id)) {
      const focused = focusWalk(child, pathSet, hostId, activePaneId);
      return { ...focused, hidden: false };
    }
    return hideSubtree(child);
  });

  return {
    ...node,
    hidden: false,
    children: rebalanceFocusedSiblings(children),
  };
}

/**
 * Return a new tree where `leafId`'s host leaf owns the canvas along its
 * ancestor path. Off-path siblings are `hidden: true` (not removed).
 *
 * Idempotent: focusing an already-focused tree for the same target yields a
 * stably equal serialisation (second call is a no-op transform).
 */
export function focusLeafInTree(
  tree: PaneTreeNode,
  leafId: string,
): FocusLeafResult {
  const host = findHostLeaf(tree, leafId);
  if (!host) return { ok: false, reason: "not-found" };

  const path = findPathIds(tree, host.id);
  if (!path) return { ok: false, reason: "not-found" };

  const activePaneId =
    host.paneIds?.includes(leafId) && leafId !== host.id ? leafId : null;

  const focused = focusWalk(
    clonePaneTree(tree),
    new Set(path),
    host.id,
    activePaneId,
  );

  return {
    ok: true,
    tree: { ...focused, sizePct: 100, hidden: false },
  };
}

/**
 * Global snap rail (CTF-D23): lift the focused host to a root-level column at
 * `focusPct` of the screen; re-parent every other *visible* leaf into a single
 * vertical companion rail at 100-focusPct. Hidden leaves are preserved as
 * hidden root siblings. Sole visible leaf → Full fallback.
 */
function snapRailInTree(
  tree: PaneTreeNode,
  leafId: string,
  focusPct: number,
): FocusLeafResult {
  const host = findHostLeaf(tree, leafId);
  if (!host) return { ok: false, reason: "not-found" };

  const activePaneId =
    host.paneIds?.includes(leafId) && leafId !== host.id ? leafId : null;

  const others = collectLeafEntries(tree).filter(
    (e) => e.node.id !== host.id,
  );
  const visibleOthers = others.filter((e) => e.visible).map((e) => e.node);
  const hiddenOthers = others.filter((e) => !e.visible).map((e) => e.node);

  // Nothing else visible → Full behaves the same and keeps output stable.
  if (visibleOthers.length === 0) {
    return focusLeafInTree(tree, leafId);
  }

  const railPct = Math.round((100 - focusPct) * 10) / 10;

  const focusedLeaf: PaneTreeNode = {
    ...applyLeafActive(clonePaneTree(host), activePaneId),
    sizePct: focusPct,
  };

  const rootChildren: PaneTreeNode[] = [focusedLeaf];

  if (visibleOthers.length === 1) {
    // One companion → a clean two-column split, no rail wrapper.
    rootChildren.push({
      ...clonePaneTree(visibleOthers[0]!),
      hidden: false,
      sizePct: railPct,
    });
  } else {
    const railRows = equalSized(
      visibleOthers.map((n) => ({ ...clonePaneTree(n), hidden: false })),
      100,
    );
    rootChildren.push({
      id: FOCUS_RAIL_ID,
      sizePct: railPct,
      hidden: false,
      direction: "vertical",
      children: railRows,
    });
  }

  // Keep hidden panes in the tree so a drag-commit (discard) can't drop them.
  for (const h of hiddenOthers) {
    rootChildren.push({ ...clonePaneTree(h), hidden: true });
  }

  return {
    ok: true,
    tree: {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      direction: "horizontal",
      children: rootChildren,
    },
  };
}

/**
 * Wide (~⅔): focused leaf takes ~67% of the screen; the companion rail ~33%.
 */
export function primaryLeafInTree(
  tree: PaneTreeNode,
  leafId: string,
): FocusLeafResult {
  return snapRailInTree(tree, leafId, PRIMARY_FOCUS_PCT);
}

/**
 * Even (~½): focused leaf takes ~50% of the screen; the companion rail ~50%.
 */
export function peekLeafInTree(
  tree: PaneTreeNode,
  leafId: string,
): FocusLeafResult {
  return snapRailInTree(tree, leafId, PEEK_FOCUS_PCT);
}

/**
 * Narrow (~⅓): focused leaf takes ~33% of the screen; the companion rail ~67%.
 */
export function narrowLeafInTree(
  tree: PaneTreeNode,
  leafId: string,
): FocusLeafResult {
  return snapRailInTree(tree, leafId, NARROW_FOCUS_PCT);
}

/**
 * Apply a discrete ratio (CTF-D17 / D23). `full` → Focus; others snap-rail.
 */
export function splitLeafByRatio(
  tree: PaneTreeNode,
  leafId: string,
  ratio: PaneSplitRatio,
): FocusLeafResult {
  if (ratio === "full") return focusLeafInTree(tree, leafId);
  const { focusPct } = SPLIT_RATIO_PCTS[ratio];
  return snapRailInTree(tree, leafId, focusPct);
}

/**
 * Candidates for always-on Show here (CTF-D18): other tabs on the same leaf
 * (except the active one), then other hosts including hidden.
 */
export function listShowHereCandidates(
  tree: PaneTreeNode,
  leafId: string,
): string[] {
  const host = findHostLeaf(tree, leafId);
  if (!host) return [];

  const paneIds = host.paneIds?.length ? host.paneIds : [host.id];
  const activeId = host.activeTabId ?? paneIds[0]!;
  const seen = new Set<string>();
  const out: string[] = [];

  for (const id of paneIds) {
    if (id === activeId || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  const pushOtherHost = (id: string) => {
    const otherHost = findHostLeaf(tree, id);
    if (!otherHost || otherHost.id === host.id) return;
    if (seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };

  for (const id of collectAllLeafIds(tree)) {
    pushOtherHost(id);
  }
  return out;
}

/** Host leaf for a pane/leaf id (exported for Show here wiring). */
export function findHostLeafInTree(
  tree: PaneTreeNode,
  leafId: string,
): PaneTreeNode | null {
  return findHostLeaf(tree, leafId);
}
