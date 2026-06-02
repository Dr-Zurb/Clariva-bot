# clpm-04 · Layout-tree mutation engine (Opus)

> **Wave 3** of [cockpit-layout-presets-modality](../plan-cockpit-layout-presets-modality-batch.md). The careful one — recursive tree mutations + extensive truth tables. **Opus-eligible** because correctness is high-stakes (a wrong mutation silently corrupts a doctor's saved layout).

| **Size** | M-L | **Model** | `claude-opus-4-7-thinking-xhigh` | **Wave** | 3 | **Depends on** | clpm-02 (types) | **Blocks** | clpm-05 |
| **Status** | ✅ Done (2026-05-24) — `LayoutNode` already exported from `frontend/lib/patient-profile/types.ts`; mutation engine + 55 truth-table cases shipped. |

---

## Why Opus

Per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) hard-rules:

- ✅ **Novel architectural primitive** — recursive tree mutation algorithms.
- ✅ **Silent corruption risk** — bugs here lose doctor data with no error.
- ✅ **Truth-table-heavy correctness** — many edge cases (single-child split degeneration, only-visible-leaf, cap-at-10, collapse on already-collapsed).

Estimated Opus tokens: ~6-8k of careful design + ~10-15k of truth-table generation.

---

## What to do

### 1. New `frontend/lib/patient-profile/types.ts` additions

Export `LayoutNode` type (move from doctor-settings types or duplicate):

```ts
export type LayoutNode =
  | { kind: "pane"; paneId: string; collapsed?: boolean }
  | {
      kind: "split";
      direction: "horizontal" | "vertical";
      children: LayoutNode[];
      sizes: number[];
    };

export type LegacyFlatLayout = {
  slots: [string, string, string];
  widths: [number, number, number];
  collapsed: { chart: boolean; rx: boolean };
};
```

### 2. New `frontend/lib/patient-profile/layout-tree-mutations.ts`

Pure functions only. Each takes a `LayoutNode` and returns a NEW `LayoutNode` (immutable).

```ts
import type { LayoutNode, LegacyFlatLayout } from "./types";

const MAX_LEAVES = 10;

/** Count leaves in the tree. */
export function countLeaves(tree: LayoutNode): number {
  if (tree.kind === "pane") return 1;
  return tree.children.reduce((sum, c) => sum + countLeaves(c), 0);
}

/** Walk and find a leaf by paneId; returns the leaf or null. */
export function findLeaf(tree: LayoutNode, paneId: string): LayoutNode | null {
  if (tree.kind === "pane") return tree.paneId === paneId ? tree : null;
  for (const c of tree.children) {
    const found = findLeaf(c, paneId);
    if (found) return found;
  }
  return null;
}

/** Find a leaf's parent split + index within children. Returns null at root. */
export function findParent(
  tree: LayoutNode,
  paneId: string,
): { parent: Extract<LayoutNode, { kind: "split" }>; index: number } | null {
  if (tree.kind === "pane") return null;
  for (let i = 0; i < tree.children.length; i++) {
    if (tree.children[i].kind === "pane" && (tree.children[i] as any).paneId === paneId) {
      return { parent: tree as any, index: i };
    }
    const deeper = findParent(tree.children[i], paneId);
    if (deeper) return deeper;
  }
  return null;
}

/** Whether a leaf has a sibling (i.e. parent split has > 1 child). */
export function hasSibling(tree: LayoutNode, paneId: string): boolean {
  const p = findParent(tree, paneId);
  return !!p && p.parent.children.length > 1;
}

/** Split a leaf into two. Returns a new tree; throws if cap exceeded. */
export function splitLeaf(
  tree: LayoutNode,
  paneId: string,
  direction: "horizontal" | "vertical",
  newPaneId: string,
): { tree: LayoutNode; ok: true } | { ok: false; reason: "cap-reached" | "not-found" } {
  if (countLeaves(tree) >= MAX_LEAVES) return { ok: false, reason: "cap-reached" };
  const leaf = findLeaf(tree, paneId);
  if (!leaf) return { ok: false, reason: "not-found" };

  const newSplit: LayoutNode = {
    kind: "split",
    direction,
    children: [
      { kind: "pane", paneId },
      { kind: "pane", paneId: newPaneId },
    ],
    sizes: [50, 50],
  };

  return { ok: true, tree: replaceNode(tree, paneId, newSplit) };
}

/** Merge a leaf into its sibling. Sibling absorbs its size. Throws if no sibling. */
export function mergeWithSibling(
  tree: LayoutNode,
  paneId: string,
): { tree: LayoutNode; ok: true } | { ok: false; reason: "no-sibling" | "not-found" } {
  const p = findParent(tree, paneId);
  if (!p) return { ok: false, reason: "not-found" };
  if (p.parent.children.length < 2) return { ok: false, reason: "no-sibling" };

  const removed = p.parent.children.filter((_, i) => i !== p.index);
  const removedSize = p.parent.sizes[p.index] ?? 0;
  const newSizes = p.parent.sizes
    .filter((_, i) => i !== p.index)
    .map((s, i) => s + (i === 0 ? removedSize : 0));

  let newSplit: LayoutNode;
  if (removed.length === 1) {
    // degenerate — split with one child collapses back to the child
    newSplit = removed[0];
  } else {
    newSplit = { ...p.parent, children: removed, sizes: newSizes };
  }

  return { ok: true, tree: replaceSubtree(tree, p.parent, newSplit) };
}

/** Toggle a leaf's collapsed flag. */
export function toggleCollapsed(tree: LayoutNode, paneId: string): LayoutNode {
  return mapTree(tree, (n) =>
    n.kind === "pane" && n.paneId === paneId
      ? { ...n, collapsed: !n.collapsed }
      : n,
  );
}

/** Remove a leaf entirely. Returns null if removing it leaves zero leaves (rejected). */
export function hideLeaf(
  tree: LayoutNode,
  paneId: string,
): { tree: LayoutNode; ok: true } | { ok: false; reason: "would-remove-last-leaf" | "not-found" } {
  if (countLeaves(tree) <= 1) return { ok: false, reason: "would-remove-last-leaf" };
  const p = findParent(tree, paneId);
  if (!p) return { ok: false, reason: "not-found" };

  const removed = p.parent.children.filter((_, i) => i !== p.index);
  const removedSize = p.parent.sizes[p.index];
  const newSizes = p.parent.sizes
    .filter((_, i) => i !== p.index)
    .map((s) => s + removedSize / removed.length);

  const newSplit: LayoutNode =
    removed.length === 1 ? removed[0] : { ...p.parent, children: removed, sizes: newSizes };

  return { ok: true, tree: replaceSubtree(tree, p.parent, newSplit) };
}

/** Restore a hidden built-in pane. Adds as a new leaf to the first split it finds. */
export function restoreLeaf(
  tree: LayoutNode,
  paneId: string,
): { tree: LayoutNode; ok: true } | { ok: false; reason: "cap-reached" | "already-present" } {
  if (findLeaf(tree, paneId)) return { ok: false, reason: "already-present" };
  if (countLeaves(tree) >= MAX_LEAVES) return { ok: false, reason: "cap-reached" };
  // ... insert at the rightmost split's tail (or wrap the whole tree in a new split)
  // detailed impl in tests
}

/** Convert a legacy 099 flat layout into a tree. */
export function legacyFlatToTree(legacy: LegacyFlatLayout): LayoutNode {
  return {
    kind: "split",
    direction: "horizontal",
    children: legacy.slots.map((slot, i) => ({
      kind: "pane",
      paneId: slot,
      collapsed: slot === "chart" ? legacy.collapsed.chart : slot === "rx" ? legacy.collapsed.rx : false,
    })),
    sizes: legacy.widths.slice(),
  };
}

// --- Internal helpers --------------------------------------------------------

function replaceNode(tree: LayoutNode, paneId: string, newNode: LayoutNode): LayoutNode {
  return mapTree(tree, (n) => (n.kind === "pane" && n.paneId === paneId ? newNode : n));
}

function replaceSubtree(tree: LayoutNode, oldSubtree: LayoutNode, newSubtree: LayoutNode): LayoutNode {
  if (tree === oldSubtree) return newSubtree;
  if (tree.kind === "pane") return tree;
  return {
    ...tree,
    children: tree.children.map((c) => replaceSubtree(c, oldSubtree, newSubtree)),
  };
}

function mapTree(tree: LayoutNode, fn: (n: LayoutNode) => LayoutNode): LayoutNode {
  const out = fn(tree);
  if (out.kind === "pane") return out;
  return { ...out, children: out.children.map((c) => mapTree(c, fn)) };
}
```

### 3. Tests `frontend/lib/patient-profile/__tests__/layout-tree-mutations.test.ts`

**Truth tables — at minimum:**

`splitLeaf`:
- Split a leaf at root (root is `{kind:'pane'}`) → root becomes `{kind:'split'}`.
- Split a leaf inside a split → sibling order preserved.
- Split when at cap (10 leaves) → returns `{ok:false, reason:'cap-reached'}`.
- Split unknown paneId → `{ok:false, reason:'not-found'}`.
- Direction is honored (horizontal vs vertical).

`mergeWithSibling`:
- Merge into 2-child split → sibling absorbs size; split degenerates to leaf.
- Merge into 3-child split → split remains with 2 children + rebalanced sizes.
- Merge unknown paneId → `not-found`.
- Merge at root (root is a leaf) → `not-found`.

`toggleCollapsed`:
- Toggle on uncollapsed → collapsed=true.
- Toggle on collapsed → collapsed=false (undefined treated as false).
- Other leaves untouched.

`hideLeaf`:
- Hide in 3-leaf tree → 2 leaves remain; sizes rebalance.
- Hide last leaf → `would-remove-last-leaf`.
- Hide unknown → `not-found`.

`restoreLeaf`:
- Restore a removed built-in → leaf appears.
- Restore at cap → `cap-reached`.
- Restore already-present → `already-present`.

`legacyFlatToTree`:
- Convert 3-slot legacy → tree with 3 children + sizes from widths.
- Collapsed flags transferred to the right leaves.

Plus property-style:
- Round-trip: `legacyFlatToTree(x)` produces a tree with `countLeaves === x.slots.length`.
- Immutability: original tree never mutated.
- Determinism: same input → same output.

### 4. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test lib/patient-profile/__tests__/layout-tree-mutations.test.ts
```

---

## Acceptance gate

- [x] Five mutation functions + helpers exported (`splitLeaf`, `mergeWithSibling`, `toggleCollapsed`, `hideLeaf`, `restoreLeaf`, plus `countLeaves`, `findLeaf`, `findParent`, `hasSibling`, `legacyFlatToTree`, `MAX_LEAVES`).
- [x] All truth-table cases pass — **55 tests** across 11 suites (countLeaves, findLeaf, findParent, hasSibling, splitLeaf, mergeWithSibling, toggleCollapsed, hideLeaf, restoreLeaf, legacyFlatToTree, property invariants).
- [x] Property tests pass — immutability (snapshot-before/after across mixed mutation sequence), determinism (identical inputs → identical outputs), round-trip (hide-then-restore preserves leaf count + size sum).
- [x] `legacyFlatToTree` round-trip works (3-slot flat → 3-leaf horizontal split with collapsed flags transferred, defensive copy of widths).
- [x] tsc clean for the two new files in isolation (`npx tsc --noEmit` on the targeted files). Pre-existing tsc errors in unrelated files (`VoiceConsultRoom.tsx`, `PatientRibbon.tsx`, `share-target-bridge.ts`, `use-tab-presence-claim.ts`) untouched by this task.
- [x] `npx next lint` on the two new files: no warnings or errors.

---

## Anti-goals

- ❌ Don't add side effects (no `console.log`, no DOM, no DB).
- ❌ Don't introduce mutable state — pure functions only.
- ❌ Don't add operations beyond the five (split / merge / collapse / hide / restore) — capture-inbox for "rotate", "swap siblings", etc.
- ❌ Don't validate paneIds against a registry — trust the caller; bad paneIds return `not-found`.
- ❌ Don't add async — fully synchronous.

---

## Notes for Opus run

- This is the truth-table-heavy task. Spend most thinking budget on enumerating edge cases (depth 1, 2, 3+ trees; cap boundary; single-child splits; rebalancing arithmetic accuracy).
- Run `find . | grep layout-tree-mutations` after writing to verify the files landed.
- The test file should be the longer of the two by ~2× — that's the safety net.
