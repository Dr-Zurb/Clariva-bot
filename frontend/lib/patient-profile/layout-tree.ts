/**
 * layout-tree.ts — persisted layout shape for the recursive shell (cv2-02).
 *
 * Separation of concerns:
 *   - PaneDefinition (types.ts)  = the consumer-facing shape (carries render
 *                                  functions, icons, hotkeys — runtime concerns).
 *   - PaneTreeNode (this file)   = the persisted shape (carries only what
 *                                  has to survive a page reload: id, sizes,
 *                                  hidden flag, direction, children).
 *
 * Why split? PaneTreeNode is JSON-serialisable; PaneDefinition isn't (it
 * carries React renderers). The serialiser / deserialiser walks PaneTreeNode,
 * not PaneDefinition.
 */

export interface PaneTreeNode {
  /** Stable id for this node. For leaves, derived: when paneIds.length === 1, this equals paneIds[0]; otherwise a synthetic `__tabs_<n>` id. */
  id: string;
  /** Absolute size as % of the OUTER group (root = % of viewport). 0–100. */
  sizePct: number;
  /** Excluded from the visible layout (toggled off via PaneToggleBar). */
  hidden: boolean;
  /** Explicit orientation for this node's children, if any. */
  direction?: "horizontal" | "vertical";
  /** Recursive children. Absent / empty = leaf node. */
  children?: PaneTreeNode[];
  /**
   * v5 (cpf-01): for leaf nodes ONLY, the ordered list of pane ids living in this
   * tab container. Always non-empty for valid leaves. Single-pane leaves continue
   * to render today's per-pane chrome; multi-pane leaves render a tab strip.
   * Undefined for non-leaf (split) nodes.
   */
  paneIds?: string[];
  /**
   * v5 (cpf-01): for leaf nodes ONLY, which paneId in `paneIds` is the active tab.
   * Invariant: `paneIds.includes(activeTabId)`. Required when `paneIds` is set.
   */
  activeTabId?: string;
}

const SERIALISE_KEYS = [
  "id",
  "sizePct",
  "hidden",
  "direction",
  "children",
  "paneIds",
  "activeTabId",
] as const;

/**
 * Serialise a PaneTreeNode to a JSON string for localStorage persistence.
 * Stable key ordering for diff-friendliness in DevTools.
 */
export function serialiseTree(node: PaneTreeNode): string {
  return JSON.stringify(node, [...SERIALISE_KEYS]);
}

/**
 * Deserialise a JSON string back into a PaneTreeNode. Throws TypeError if
 * the input is structurally invalid; callers should wrap in try/catch and
 * fall back to defaults.
 */
export function deserialiseTree(json: string): PaneTreeNode {
  const parsed: unknown = JSON.parse(json);
  if (!isValidTreeNode(parsed)) {
    throw new TypeError("[layout-tree] Invalid PaneTreeNode JSON");
  }
  return parsed;
}

/**
 * Structural validator — verifies the shape recursively. Used by
 * deserialiseTree and validateLayout (in useShellLayout.ts).
 */
export function isValidTreeNode(value: unknown): value is PaneTreeNode {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || v.id.length === 0) return false;
  if (typeof v.sizePct !== "number" || v.sizePct < 0 || v.sizePct > 100) return false;
  if (typeof v.hidden !== "boolean") return false;
  if (
    v.direction !== undefined &&
    v.direction !== "horizontal" &&
    v.direction !== "vertical"
  ) {
    return false;
  }
  if (v.children !== undefined) {
    if (!Array.isArray(v.children)) return false;
    for (const child of v.children) {
      if (!isValidTreeNode(child)) return false;
    }
  }
  // v5 (cpf-01) — leaf-only optional fields. Validated only when present.
  if (v.paneIds !== undefined) {
    if (!Array.isArray(v.paneIds) || v.paneIds.length === 0) return false;
    for (const id of v.paneIds) {
      if (typeof id !== "string" || id.length === 0) return false;
    }
    if (typeof v.activeTabId !== "string") return false;
    if (!(v.paneIds as string[]).includes(v.activeTabId as string)) return false;
    // Leaves cannot also have children.
    if (v.children !== undefined && (v.children as unknown[]).length > 0) return false;
  }
  return true;
}

/**
 * Walk the tree and ensure every leaf carries `paneIds` + `activeTabId`.
 * Leaves that already have these fields are returned unchanged (idempotent).
 *
 * v4 leaf  { id: "snapshot", sizePct: 40, hidden: false }
 * becomes
 * v5 leaf  { id: "snapshot", sizePct: 40, hidden: false, paneIds: ["snapshot"], activeTabId: "snapshot" }
 *
 * Non-leaf (split) nodes are recursed into. No-op on already-v5 trees.
 */
export function upgradeV4LeavesToV5(root: PaneTreeNode): PaneTreeNode {
  function walk(n: PaneTreeNode): PaneTreeNode {
    if (n.children && n.children.length > 0) {
      const upgradedChildren = n.children.map(walk);
      const same = upgradedChildren.every((c, i) => c === n.children![i]);
      return same ? n : { ...n, children: upgradedChildren };
    }
    // Leaf. If already v5, return as-is.
    if (n.paneIds && n.paneIds.length > 0 && n.activeTabId) return n;
    return {
      ...n,
      paneIds: [n.id],
      activeTabId: n.id,
    };
  }
  return walk(root);
}

/**
 * Walk a PaneTreeNode and return leaves in left-to-right DFS order plus
 * a flat paneState map. Used by Shell.tsx when handing off to the
 * pre-cv2-02 flat-shape rendering paths (kept as a fallback during the
 * Phase 1 transition; retired by Phase 2's first surface that consumes
 * the tree directly).
 */
export function paneTreeToFlat(root: PaneTreeNode): {
  paneOrder: string[];
  paneState: Record<string, { sizePct: number; hidden: boolean }>;
} {
  const order: string[] = [];
  const state: Record<string, { sizePct: number; hidden: boolean }> = {};

  function walk(n: PaneTreeNode) {
    if (n.children && n.children.length > 0) {
      for (const c of n.children) walk(c);
      return;
    }
    // Leaf — emit every paneId in paneIds (v5) or fall back to id (v4 raw read,
    // should not happen after hydration but defensive).
    const ids = n.paneIds && n.paneIds.length > 0 ? n.paneIds : [n.id];
    for (const id of ids) {
      order.push(id);
      state[id] = { sizePct: n.sizePct, hidden: n.hidden };
    }
  }

  walk(root);
  return { paneOrder: order, paneState: state };
}

/**
 * Reverse direction — build a PaneTreeNode from a flat layout. Used during
 * the v3 → v4 migration: a v3 flat layout becomes a single horizontal-root
 * with N leaf children.
 */
export function flatToPaneTree(
  flat: {
    paneOrder: string[];
    paneState: Record<string, { sizePct: number; hidden: boolean }>;
  },
  _panesShape?: Array<{
    id: string;
    direction?: "horizontal" | "vertical";
    children?: unknown[];
  }>,
): PaneTreeNode {
  const children: PaneTreeNode[] = flat.paneOrder.map((id) => ({
    id,
    sizePct: flat.paneState[id]?.sizePct ?? 100 / Math.max(flat.paneOrder.length, 1),
    hidden: flat.paneState[id]?.hidden ?? false,
    paneIds: [id],
    activeTabId: id,
  }));
  return {
    id: "__root__",
    sizePct: 100,
    hidden: false,
    direction: "horizontal",
    children,
  };
}

function clampSizePct(sizePct: number): number {
  return Math.min(100, Math.max(0, sizePct));
}

/** Immutably update sizePct on the node with matching id. */
export function updateNodeSize(
  root: PaneTreeNode,
  nodeId: string,
  sizePct: number,
): PaneTreeNode {
  const clamped = clampSizePct(sizePct);
  function walk(n: PaneTreeNode): PaneTreeNode {
    if (n.id === nodeId) return { ...n, sizePct: clamped };
    if (n.children?.length) {
      return { ...n, children: n.children.map(walk) };
    }
    return n;
  }
  return walk(root);
}

/** Immutably update hidden on the node with matching id. */
export function updateNodeHidden(
  root: PaneTreeNode,
  nodeId: string,
  hidden: boolean,
): PaneTreeNode {
  function walk(n: PaneTreeNode): PaneTreeNode {
    if (n.id === nodeId) return { ...n, hidden };
    if (n.children?.length) {
      return { ...n, children: n.children.map(walk) };
    }
    return n;
  }
  return walk(root);
}

/** Immutably set sizePct on each child of the group with matching id. */
export function updateGroupSizes(
  root: PaneTreeNode,
  groupId: string,
  sizes: Record<string, number>,
): PaneTreeNode {
  function walk(n: PaneTreeNode): PaneTreeNode {
    if (n.id === groupId && n.children?.length) {
      return {
        ...n,
        children: n.children.map((c) => ({
          ...c,
          sizePct: clampSizePct(sizes[c.id] ?? c.sizePct),
        })),
      };
    }
    if (n.children?.length) {
      return { ...n, children: n.children.map(walk) };
    }
    return n;
  }
  return walk(root);
}

function findParent(
  root: PaneTreeNode,
  targetId: string,
): { parent: PaneTreeNode; index: number } | null {
  if (!root.children?.length) return null;
  const direct = root.children.findIndex((c) => c.id === targetId);
  if (direct >= 0) return { parent: root, index: direct };
  for (const child of root.children) {
    const nested = findParent(child, targetId);
    if (nested) return nested;
  }
  return null;
}

/**
 * Swap two siblings within the same parent group. Returns null when ids are
 * missing or live under different parents (cross-group reorder).
 */
export function reorderSiblingNodes(
  root: PaneTreeNode,
  fromId: string,
  toId: string,
): PaneTreeNode | null {
  if (fromId === toId) return root;
  const from = findParent(root, fromId);
  const to = findParent(root, toId);
  if (!from || !to) return null;
  if (from.parent.id !== to.parent.id) return null;

  const parentId = from.parent.id;
  const fromIndex = from.index;
  const toIndex = to.index;

  function replaceParent(n: PaneTreeNode): PaneTreeNode {
    if (n.id !== parentId || !n.children?.length) {
      if (n.children?.length) return { ...n, children: n.children.map(replaceParent) };
      return n;
    }
    const next = [...n.children];
    [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
    return { ...n, children: next };
  }

  return replaceParent(root);
}

/** Whether a node has a sibling in the same parent group (clpm-03 / clpm-04). */
export function paneTreeHasSibling(tree: PaneTreeNode, paneId: string): boolean {
  const parent = findParent(tree, paneId);
  return !!parent && (parent.parent.children?.length ?? 0) > 1;
}

export interface TabsContainerInfo {
  /** Leaf node id. */
  id: string;
  paneIds: string[];
  activeTabId: string;
  /** Human-readable label — typically `paneById[activeTabId].title`. */
  label: string;
}

/**
 * DFS list of every tabs leaf in the tree (cpf-05).
 */
export function listTabsContainers(
  tree: PaneTreeNode,
  labelFor?: (paneId: string) => string,
): TabsContainerInfo[] {
  const out: TabsContainerInfo[] = [];
  function walk(n: PaneTreeNode): void {
    if (n.children) {
      n.children.forEach(walk);
      return;
    }
    const paneIds = n.paneIds && n.paneIds.length > 0 ? n.paneIds : [n.id];
    const activeTabId = n.activeTabId ?? paneIds[0]!;
    out.push({
      id: n.id,
      paneIds,
      activeTabId,
      label: labelFor?.(activeTabId) ?? activeTabId,
    });
  }
  walk(tree);
  return out;
}

/** Resolve context-menu target id to the pane id passed to tab mutations. */
export function resolveMoveSourcePaneId(
  tree: PaneTreeNode,
  contextPaneId: string,
): string {
  const node = findPaneTreeNodeById(tree, contextPaneId);
  if (node && (!node.children || node.children.length === 0)) {
    const paneIds = node.paneIds && node.paneIds.length > 0 ? node.paneIds : [node.id];
    return node.activeTabId ?? paneIds[0]!;
  }
  return contextPaneId;
}

function findPaneTreeNodeById(
  tree: PaneTreeNode,
  nodeId: string,
): PaneTreeNode | null {
  if (tree.id === nodeId) return tree;
  if (!tree.children?.length) return null;
  for (const c of tree.children) {
    const hit = findPaneTreeNodeById(c, nodeId);
    if (hit) return hit;
  }
  return null;
}

/** DL-3.1 / P3-DL-6: a root row wider than this many horizontal siblings is "cramped". */
export const CRAMPED_ROOT_SIBLINGS = 5;

export interface LayoutShape {
  /** Number of leaf containers (a multi-tab leaf counts once). */
  leafCount: number;
  /** Leaf containers holding more than one pane (i.e. tab strips). */
  tabContainers: number;
  /** Horizontal children directly under the root (1 when the root isn't a horizontal split). */
  maxRootSiblings: number;
}

/** Describe the shape of a live PaneTreeNode for the layout_shape telemetry signal. */
export function describeLayoutShape(root: PaneTreeNode): LayoutShape {
  let leafCount = 0;
  let tabContainers = 0;
  const walk = (n: PaneTreeNode): void => {
    if (n.children && n.children.length > 0) {
      n.children.forEach(walk);
      return;
    }
    leafCount += 1;
    if ((n.paneIds?.length ?? 1) > 1) tabContainers += 1;
  };
  walk(root);
  const maxRootSiblings =
    root.children && root.children.length > 0 && root.direction === "horizontal"
      ? root.children.length
      : 1;
  return { leafCount, tabContainers, maxRootSiblings };
}

/** True when the root row exceeds the soft cramped threshold (DL-3.1). */
export function isLayoutCramped(root: PaneTreeNode): boolean {
  return describeLayoutShape(root).maxRootSiblings > CRAMPED_ROOT_SIBLINGS;
}
