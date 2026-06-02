# cpf-01 · `PaneTreeNode` v5 schema — leaves carry `paneIds[]` + `activeTabId`; v4 hydration auto-upgrades

> **Wave 1** of [cockpit-pane-freedom](../plan-p1-cockpit-pane-freedom-batch.md). The load-bearing task — every later task in the batch (and every later phase) stacks on this schema change.

| **Size** | M | **Model** | Auto | **Wave** | 1 | **Depends on** | clpm-01 (v4 baseline); csl-03 (alignment guard) | **Blocks** | cpf-02, cpf-03, cpf-04, cpf-05 |

---

## Why this task

Today's leaves are single-pane: `{ id: string, sizePct: number, hidden: boolean }`. To support "every leaf is a tab container" (DL-4 from the [batch plan](../plan-p1-cockpit-pane-freedom-batch.md#decision-lock-frozen-for-the-entire-vision-not-just-this-batch)), leaves grow into `{ paneIds: string[], activeTabId: string, sizePct: number, hidden: boolean }`. Single-pane leaves continue to render today's chrome (DL-4) — they're just `paneIds: [id]` with `activeTabId === id`.

The migration MUST be:
- **Idempotent** — re-running on a v5 tree is a no-op.
- **Lossless** — every paneId in the v4 tree appears in the v5 tree.
- **Schema-version-bumped** — `layoutVersion: 5` so `validateLayout` can distinguish.
- **Friendly to the [csl-03 alignment guard](../../../26-05-2026/cockpit-shell-layout-fix/Tasks/task-csl-03-stale-layout-discard-and-toggle-bar-guard.md)** — `paneTreeToFlat` continues to surface every leaf id so `isLayoutAlignedWith` works unchanged.

---

## What to do

### 1. Update `PaneTreeNode` in `frontend/lib/patient-profile/layout-tree.ts`

The current shape (cv2-02 / clpm baseline):

```ts
export interface PaneTreeNode {
  id: string;
  sizePct: number;
  hidden: boolean;
  direction?: "horizontal" | "vertical";
  children?: PaneTreeNode[];
}
```

Becomes:

```ts
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
```

**Why keep `id` on leaves?** Two reasons:
1. Backward-compat with existing consumers that read `node.id` to look up a `PaneDefinition` (the renderer, the resize handles' keying, the cascade-handle drag deltas).
2. Split nodes also have `id` (synthetic like `__split_0`). The shape stays uniform.

For single-pane leaves, the invariant `paneIds === [id] && activeTabId === id` holds. The renderer keys off `paneIds.length`:
- `=== 1` → render today's single-pane layout, no tab strip
- `> 1` → render tab strip; `id` becomes the synthetic container id, individual pane bodies keyed by their paneId

### 2. Bump validators in `frontend/lib/patient-profile/layout-tree.ts`

Update `isValidTreeNode`:

```ts
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
```

### 3. Add migration `upgradeV4LeavesToV5` in `frontend/lib/patient-profile/layout-tree.ts`

Pure, immutable, idempotent:

```ts
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
```

### 4. Update `paneTreeToFlat` to enumerate every paneId

```ts
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
```

The toggle-bar / hotkey / alignment-guard consumers continue to see "the same panes" even after grouping (every paneId is still surfaced).

### 5. Update `validateLayout` in `frontend/lib/patient-profile/useShellLayout.ts`

Today's `validateLayout` accepts v3 + v4. Add v5 acceptance + v4-→-v5 migration:

```ts
const LAYOUT_VERSION = 5 as const;

export function validateLayout(value: unknown): PatientProfileLayout | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;

  // v5 — current
  if (v.version === 5 && isValidTreeNode(v.paneTree)) {
    // Idempotent walk catches partial v4 leaves that slipped through.
    return {
      version: 5,
      paneTree: upgradeV4LeavesToV5(v.paneTree as PaneTreeNode),
    };
  }

  // v4 — migrate leaves to v5 shape.
  if (v.version === 4 && isValidTreeNode(v.paneTree)) {
    const upgraded = upgradeV4LeavesToV5(v.paneTree as PaneTreeNode);
    if (typeof console !== "undefined") {
      console.info("[useShellLayout] migrated v4 layout to v5 (paneIds + activeTabId on leaves)");
    }
    return { version: 5, paneTree: upgraded };
  }

  // v3 — existing migration to v4 then to v5.
  // ...keep existing v3 → v4 logic, then chain through upgradeV4LeavesToV5...
}
```

Bump `PatientProfileLayout.version: 4` → `5` in the type (or accept union `4 | 5` transitionally — pick whichever your codebase prefers and document the choice in the task PR).

### 6. Update writes in `useShellLayout` to always serialise as v5

Every `setLayout(...)` / `applyLayout(...)` / `applyLayoutTree(...)` call now writes a v5 shape. New trees built via `flatToPaneTree` get v5 leaves by default (update `flatToPaneTree` to emit `paneIds: [id], activeTabId: id`):

```ts
export function flatToPaneTree(flat: {
  paneOrder: string[];
  paneState: Record<string, { sizePct: number; hidden: boolean }>;
}): PaneTreeNode {
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
```

### 7. Tests

**New / updated tests in `frontend/lib/patient-profile/__tests__/layout-tree.test.ts`:**

```ts
describe("PaneTreeNode v5 shape (cpf-01)", () => {
  it("isValidTreeNode accepts a v5 leaf with paneIds + activeTabId");
  it("isValidTreeNode rejects a leaf where activeTabId is not in paneIds");
  it("isValidTreeNode rejects a leaf where paneIds is empty");
  it("isValidTreeNode rejects a node with both children and paneIds");
});

describe("upgradeV4LeavesToV5 (cpf-01)", () => {
  it("wraps a single-id v4 leaf into [id] paneIds + activeTabId = id");
  it("is a no-op on an already-v5 leaf");
  it("recurses into split nodes");
  it("preserves sizePct + hidden + direction + id");
  it("preserves referential identity for unchanged subtrees");
});

describe("paneTreeToFlat with v5 leaves", () => {
  it("emits every paneId in a single-pane leaf (length 1)");
  it("emits every paneId in a multi-pane leaf (length > 1)");
  it("all paneIds in a multi-pane leaf share the leaf's sizePct + hidden");
});
```

**New / updated tests in `frontend/lib/patient-profile/__tests__/useShellLayout.test.ts`:**

```ts
describe("validateLayout — v4 → v5 migration (cpf-01)", () => {
  it("accepts a v4 payload and upgrades leaves to v5");
  it("accepts an already-v5 payload as-is");
  it("preserves every paneId across the migration (lossless)");
  it("rejects a v5 payload with structurally invalid leaves");
});

describe("useShellLayout — v4 hydration upgrades to v5 (cpf-01)", () => {
  it("rehydrates a v4 localStorage payload as v5 paneState");
  it("subsequent writes to localStorage use v5 shape");
});
```

### 8. Verify

```powershell
cd frontend
npx tsc --noEmit
pnpm test lib/patient-profile/__tests__/layout-tree.test.ts
pnpm test lib/patient-profile/__tests__/useShellLayout.test.ts
```

---

## Acceptance gate

- [x] `PaneTreeNode` schema extended with optional `paneIds` + `activeTabId` (leaf-only).
- [x] `isValidTreeNode` rejects malformed v5 leaves (activeTabId not in paneIds; empty paneIds; both children and paneIds).
- [x] `upgradeV4LeavesToV5` is pure, immutable, idempotent.
- [x] `paneTreeToFlat` enumerates every paneId in every `paneIds` array.
- [x] `flatToPaneTree` emits v5 leaves by default.
- [x] `validateLayout` accepts v3 (chain-migrate), v4 (migrate), v5 (as-is).
- [x] `useShellLayout` writes v5 shape to localStorage; subsequent reads are v5.
- [x] `PatientProfileLayout.version` reflects 5 (or union 4 | 5 during transition).
- [x] Every new test green; existing tests still green.
- [x] `cd frontend; npx tsc --noEmit` clean.

---

## Anti-goals

- ❌ Don't drop the v4 `id` field on leaves — backward-compat with renderer / resize-keying.
- ❌ Don't render anything yet — pure data / validation work.
- ❌ Don't change `naturalSizePct` / `minSizePx` semantics — orientation-aware mins land later.
- ❌ Don't write a v4 → v5 backend migration — layouts live in localStorage; server-side `cockpit_layout_presets` (migration 112) already accepts a tree-shaped JSONB and the v4-shape-with-leaves-as-paneIds round-trips through the existing column constraint.

---

## Risks (executor-facing)

- **Schema invariant slippage** — `paneIds.includes(activeTabId)` must hold after EVERY mutation. cpf-02's truth tables verify this; cpf-01 just enforces it at validation time.
- **`id` on multi-pane leaves** — for v5 leaves with > 1 pane, what's the `id`? My recommendation: synthetic `__tabs_<n>` where `<n>` is a deterministic counter (similar to `__split_<n>` in `layout-node-bridge.ts`). The renderer doesn't care — keyed on `paneIds[0]` or the leaf's `id` interchangeably for resize-purposes.
- **Round-trip with `convertTemplateToTree`** — `layout-presets-builtin.ts` builds trees from `PaneDefinition[]`. Update `paneDefToLayoutNode` to emit v5 leaves (`paneIds: [def.id], activeTabId: def.id`). Verify built-in presets still load via the unit tests for `BUILT_IN_PRESETS`.
