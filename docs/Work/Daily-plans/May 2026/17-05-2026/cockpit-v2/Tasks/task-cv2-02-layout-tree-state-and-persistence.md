# Task cv2-02: `layout-tree.ts` serialiser + `useShellLayout` v3→v4 migration

## 17 May 2026 — Batch [Cockpit v2 — Phase 1](../plan-cockpit-v2-batch.md) — Wave 3, Lane α step 0 — **S, ~5h**

---

## Task overview

cv2-01 shipped the recursive renderer but kept the **persistence layer flat** via a `paneTreeToFlat(nodes)` stub adapter — the existing `useShellLayout` hook still writes `version: 3` `{ paneOrder, paneState }` to localStorage. This task lifts the state model to a true recursive tree:

1. **New module `frontend/lib/patient-profile/layout-tree.ts`** — defines `PaneTreeNode` (the persisted shape, separate from the consumer-facing `PaneDefinition`), `serialiseTree(node)` / `deserialiseTree(json)`, validators, and the flat ↔ tree adapter pair (`paneTreeToFlat` is **moved** from cv2-01's stub to this module; `flatToPaneTree(flatLayout, panesShape)` is the new direction).
2. **Bump `PatientProfileLayout` to `version: 4`** with `paneTree: PaneTreeNode` (replacing `paneOrder` + `paneState`). v3 → v4 migration lives in `validateLayout` (which already chains v1 → v2 → v3 per ppr-15a).
3. **Extend `useShellLayout`** with two new tree-aware setters (`setLeafSize(nodeId, pct)`, `setGroupSizes(groupId, sizes)`) that update the tree in place. The legacy flat `setPaneSize(paneId, pct)` keeps working by delegating to `setLeafSize` internally — keeps cv2-01's renderer compatible until cv2-03 wires the new setters.
4. **New storage key `patient-profile/v4-tree-layout`** for the recursive shape. The old v3 key stays in place (untouched in this batch; Phase 2 retires).

After this task, `Shell.tsx` continues to render correctly with the flat-shape stub from cv2-01 AND consumes the new tree-aware setters when given a `PaneDefinition` tree with `children?`. cv2-03 wires the new storage key + the template literal that exercises the tree shape.

**Estimated time:** ~5h (1h `PaneTreeNode` type + adapters + serialiser + 1h `validateLayout` v3→v4 migration + 1.5h `useShellLayout` extension + 30min storage-key plumbing + 1h verification + manual smoke against `/dev/shell-tree-smoke`).

**Status:** Pending.

**Hard deps:** cv2-01 (recursive renderer; this task replaces its `paneTreeToFlat` stub with a real two-way adapter).

**Source:** [plan-cockpit-v2-batch.md § Wave 3 Lane α](../plan-cockpit-v2-batch.md#wave-3--shell-continuation--rx-form-refactor-4-tasks-24h-with-parallelism-2-parallel-lanes-after-wave-2-ships) + DL-22 in [Product plans/plan-cockpit-v2.md](../../../Product%20plans/plan-cockpit-v2.md).

---

## Model & execution guidance

**Recommended model:** **Auto** (default). Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — Auto is the execution default for well-spec'd bounded tasks. The migration logic (v3 → v4) is straightforward (flat layout becomes a single horizontal root with N leaf children); the hook extension follows the ppr-02 / ppr-15a precedent. Not on the hard-rules list.

**Per-message escalation rule:** if Auto stalls on the recursive `PaneTreeNode` validator (TypeScript discriminated unions with optional `children?` can confuse some models), escalate that **one message** to Opus 4.7 Extra High.

**New chat?** **Yes** — fresh chat. Pre-load:

- This task file.
- `frontend/lib/patient-profile/useShellLayout.ts` (the hook being extended).
- `frontend/lib/patient-profile/types.ts` (post-cv2-01 + cv2-09 — the source of `PatientProfileLayout`).
- `frontend/components/patient-profile/Shell.tsx` (post-cv2-01 — the consumer; the `paneTreeToFlat` stub being replaced lives here or in `types.ts`).
- ppr-15a's validator chain (look for `validateLayout` in `useShellLayout.ts`; this is the model for the v3 → v4 hop).
- ppr-08's legacy-seed effect (in `PatientProfilePage.tsx` — model for one-time read-and-apply patterns).
- Source plan §DL-22.

**Estimated turns:** 3–4 turns (1 types + adapters + serialiser, 1 validator extension, 1 hook extension, 1 verification).

---

## Acceptance criteria

### Step 1 — Define `PaneTreeNode` and adapters in `layout-tree.ts`

- [ ] **New file** `frontend/lib/patient-profile/layout-tree.ts`:

  ```ts
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
    /** Stable id matching the consumer-side PaneDefinition.id. */
    id: string;
    /** Absolute size as % of the OUTER group (root = % of viewport). 0–100. */
    sizePct: number;
    /** Excluded from the visible layout (toggled off via PaneToggleBar). */
    hidden: boolean;
    /** Explicit orientation for this node's children, if any. */
    direction?: 'horizontal' | 'vertical';
    /** Recursive children. Absent / empty = leaf node. */
    children?: PaneTreeNode[];
  }

  /**
   * Serialise a PaneTreeNode to a JSON string for localStorage persistence.
   * Stable key ordering for diff-friendliness in DevTools.
   */
  export function serialiseTree(node: PaneTreeNode): string {
    return JSON.stringify(node, ['id', 'sizePct', 'hidden', 'direction', 'children']);
  }

  /**
   * Deserialise a JSON string back into a PaneTreeNode. Throws TypeError if
   * the input is structurally invalid; callers should wrap in try/catch and
   * fall back to defaults.
   */
  export function deserialiseTree(json: string): PaneTreeNode {
    const parsed = JSON.parse(json);
    if (!isValidTreeNode(parsed)) {
      throw new TypeError('[layout-tree] Invalid PaneTreeNode JSON');
    }
    return parsed;
  }

  /**
   * Structural validator — verifies the shape recursively. Used by
   * deserialiseTree and validateLayout (in useShellLayout.ts).
   */
  export function isValidTreeNode(value: unknown): value is PaneTreeNode {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    if (typeof v.id !== 'string' || v.id.length === 0) return false;
    if (typeof v.sizePct !== 'number' || v.sizePct < 0 || v.sizePct > 100) return false;
    if (typeof v.hidden !== 'boolean') return false;
    if (v.direction !== undefined && v.direction !== 'horizontal' && v.direction !== 'vertical') {
      return false;
    }
    if (v.children !== undefined) {
      if (!Array.isArray(v.children)) return false;
      for (const child of v.children) {
        if (!isValidTreeNode(child)) return false;
      }
    }
    return true;
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
      state[n.id] = { sizePct: n.sizePct, hidden: n.hidden };
      if (n.children && n.children.length > 0) {
        for (const c of n.children) walk(c);
      } else {
        order.push(n.id);
      }
    }
    walk(root);
    return { paneOrder: order, paneState: state };
  }

  /**
   * Reverse direction — build a PaneTreeNode from a flat layout. Used during
   * the v3 → v4 migration: a v3 flat layout becomes a single horizontal-root
   * with N leaf children. The optional `panesShape` argument lets callers
   * supply the consumer-side PaneDefinition[] (post-cv2-01) so the new tree
   * inherits `direction?` overrides from the consumer definitions when
   * available. If `panesShape` is omitted (e.g. during a cold v3 read), the
   * tree defaults to alternating orientation.
   */
  export function flatToPaneTree(
    flat: { paneOrder: string[]; paneState: Record<string, { sizePct: number; hidden: boolean }> },
    panesShape?: Array<{ id: string; direction?: 'horizontal' | 'vertical'; children?: unknown[] }>,
  ): PaneTreeNode {
    const rootId = '__root__';
    const children: PaneTreeNode[] = flat.paneOrder.map((id) => ({
      id,
      sizePct: flat.paneState[id]?.sizePct ?? 100 / flat.paneOrder.length,
      hidden: flat.paneState[id]?.hidden ?? false,
    }));
    return {
      id: rootId,
      sizePct: 100,
      hidden: false,
      direction: 'horizontal', // v3 was always a horizontal group
      children,
    };
  }
  ```

- [ ] **Type-check:** `pnpm --filter frontend tsc --noEmit` clean.

### Step 2 — Bump `PatientProfileLayout` to `version: 4`

- [ ] In `frontend/lib/patient-profile/types.ts`, **modify** the `PatientProfileLayout` interface:

  ```ts
  /**
   * The single layout-state shape persisted to localStorage.
   *
   * cv2-02 bumps to version 4: the recursive tree replaces the flat
   * `paneOrder + paneState` pair. v3 is migrated on read by validateLayout
   * (a flat layout becomes a single horizontal root with N leaf children).
   * v1 and v2 are still chained via ppr-08 / ppr-15a.
   */
  export interface PatientProfileLayout {
    version: 4;
    paneTree: PaneTreeNode;
  }
  ```

- [ ] **Import** `PaneTreeNode` at the top of `types.ts` from the new `layout-tree.ts` module (or co-locate — task picks; co-locating in `types.ts` is fine if the file stays under ~200 LOC).

- [ ] **Delete or deprecate the old `PaneRuntimeState` interface** — it's no longer the persisted shape. The shell still uses the `{ sizePct, hidden }` *runtime* shape internally (via `paneTreeToFlat`), but the persisted shape is now `PaneTreeNode`. Keep `PaneRuntimeState` exported with a `@deprecated cv2-02 — use PaneTreeNode for persistence` JSDoc; existing consumers (cv2-01's renderer, the imperative shell handle's `paneState` field) keep working unchanged.

### Step 3 — Extend `validateLayout` with v3 → v4 migration

- [ ] In `frontend/lib/patient-profile/useShellLayout.ts`, **extend** the existing `validateLayout` function (which currently chains v1 → v2 → v3) to add the v3 → v4 hop:

  ```ts
  function validateLayout(raw: unknown): PatientProfileLayout | null {
    // ... existing v1 / v2 / v3 detection + migration chain ...

    // v3 detection: { version: 3, paneOrder, paneState }
    if (
      raw &&
      typeof raw === 'object' &&
      (raw as { version?: number }).version === 3
    ) {
      const v3 = raw as { version: 3; paneOrder: string[]; paneState: Record<string, { sizePct: number; hidden: boolean }> };
      // cv2-02 — migrate v3 → v4: flat becomes a single horizontal root.
      const paneTree = flatToPaneTree(
        { paneOrder: v3.paneOrder, paneState: v3.paneState },
        undefined,
      );
      return { version: 4, paneTree };
    }

    // v4 detection: { version: 4, paneTree }
    if (
      raw &&
      typeof raw === 'object' &&
      (raw as { version?: number }).version === 4 &&
      isValidTreeNode((raw as { paneTree?: unknown }).paneTree)
    ) {
      return raw as PatientProfileLayout;
    }

    return null;
  }
  ```

- [ ] **`validateLayout` is the single point of v3-payload acceptance.** Any other consumer that reads localStorage directly (rare; ppr-08 might) is updated to route through `validateLayout` or its v3-specific helper.

### Step 4 — Extend `useShellLayout` with tree-aware setters

- [ ] In `frontend/lib/patient-profile/useShellLayout.ts`, **add** two new setters to the hook's return shape:

  ```ts
  export interface UseShellLayoutResult {
    // (Existing fields.)
    paneOrder: string[];
    paneState: Record<string, PaneRuntimeState>;
    setPaneSize: (id: string, sizePct: number) => void;
    setPaneHidden: (id: string, hidden: boolean) => void;
    reorderPane: (fromId: string, toId: string) => void;
    applyLayout: (layout: PatientProfileLayout) => void;
    layoutVersion: number;
    hydrated: boolean;
    // cv2-02 — tree-aware setters.
    /** Set a leaf's size by id. Walks the tree, updates the matching node. */
    setLeafSize: (nodeId: string, sizePct: number) => void;
    /** Set the sizes of all children of a group (keyed by group id). */
    setGroupSizes: (groupId: string, sizes: Record<string, number>) => void;
    /** Read-only access to the persisted tree (for tree-aware consumers). */
    paneTree: PaneTreeNode;
  }
  ```

- [ ] **Internal state** in the hook holds a `PaneTreeNode` (the new source of truth). The existing flat `paneOrder` / `paneState` outputs are derived from the tree via `paneTreeToFlat(paneTree)` (memoised) so cv2-01's flat-consuming renderer keeps working unchanged.

- [ ] **`setLeafSize(nodeId, sizePct)`** — immutably updates the tree:

  ```ts
  const setLeafSize = useCallback((nodeId: string, sizePct: number) => {
    setPaneTree((prev) => updateNodeSize(prev, nodeId, sizePct));
  }, []);
  ```

  `updateNodeSize` is a pure helper (in `layout-tree.ts`) that walks the tree and returns a new tree with the matching node's `sizePct` updated.

- [ ] **`setGroupSizes(groupId, sizes)`** — same pattern; updates all children of the matching group.

- [ ] **Legacy `setPaneSize(paneId, pct)` delegates to `setLeafSize`** so cv2-01's renderer keeps working unchanged.

- [ ] **`setPaneHidden(id, hidden)`** — extended to walk the tree (the leaf might be at depth ≥ 1).

- [ ] **`reorderPane(fromId, toId)`** — extended to walk the tree (the reorder happens within the source's parent group; cross-group reorder is out of scope for this batch — log a console.warn if fromId / toId live in different parent groups).

- [ ] **`applyLayout(layout)`** — takes a `PatientProfileLayout` (v4 shape) and replaces the internal tree. Bump `layoutVersion`.

### Step 5 — Storage key plumbing

- [ ] **New storage key constant** in `useShellLayout.ts`:

  ```ts
  const STORAGE_KEY_V4 = (callerKey: string) => `patient-profile/v4-tree-layout::${callerKey}`;
  ```

  The caller-provided `storageKey` (passed to `<PatientProfileShell>`) is namespaced under the v4 prefix. The old v3 key (`callerKey` alone) is untouched.

- [ ] **Read order on hydration:**

  1. Try to read from the v4 key. If present and valid → use as-is.
  2. If absent, try to read from the v3 key. If present and valid → run through `validateLayout` (which migrates v3 → v4), write the result to the v4 key, leave the v3 key alone. (One-time migration on first hydration after this task ships.)
  3. If neither present → use defaults (the seed from `defaultLayout(panes, storageKey)`).

- [ ] **Write target:** v4 key only. The v3 key never sees new writes after this task.

- [ ] **debounced writes** continue to use the same 200ms pattern; only the key + payload change.

### Step 6 — `Shell.tsx` adopts the new shape (minimally)

- [ ] In `frontend/components/patient-profile/Shell.tsx`:
  - Remove the `paneTreeToFlat` stub introduced by cv2-01 (it now lives in `layout-tree.ts`; import from there).
  - Switch the hook destructuring to expose `setLeafSize` and `paneTree` alongside the existing `paneOrder` / `paneState`.
  - **Render still uses the flat `paneOrder` + `paneState` path.** cv2-03 wires the tree-aware path. This task is intentionally a no-op for rendering — the persistence layer rewrite is what counts.
  - The `handleResize` callback (per group, per cv2-01) calls `setLeafSize(paneId, absolutePct)` (the new setter) instead of `setPaneSize(paneId, absolutePct)`. Behaviour is identical (setPaneSize delegates), but using the new setter directly makes the intent clearer for cv2-03.

### Step 7 — Verification (deterministic)

- [ ] **Type-check:** `pnpm --filter frontend tsc --noEmit` clean.

- [ ] **Lint:** `pnpm --filter frontend lint` clean.

- [ ] **`/v2` route unchanged.** Open `/dashboard/appointments/[id]/v2`. Existing v3 localStorage payload (if present) is automatically migrated to v4 on first read. Subsequent reloads use the v4 key. Pane sizes survive across reloads. Reorder and collapse survive.

- [ ] **`/dev/shell-tree-smoke` (from cv2-01)** still works. Resize, reorder, collapse at every level. Layout persists across reloads (under the v4 key namespaced with `dev/shell-tree-smoke`).

- [ ] **localStorage migration smoke:**

  ```js
  // In the browser DevTools console, before this task ships:
  localStorage.setItem(
    '<existing v3 key for /v2>',
    JSON.stringify({ version: 3, paneOrder: ['chart','body','rx'], paneState: { chart: {sizePct: 25, hidden: false}, body: {sizePct: 50, hidden: false}, rx: {sizePct: 25, hidden: false} } }),
  );

  // After this task ships, reload /v2:
  // Expected: the v4 key (`patient-profile/v4-tree-layout::<key>`) gets
  // populated with a tree: { version: 4, paneTree: { id: '__root__', sizePct: 100, hidden: false, direction: 'horizontal', children: [{ id: 'chart', sizePct: 25, hidden: false }, ...] } }
  // The shell renders with the v3 sizes (25 / 50 / 25).
  ```

- [ ] **`rg` checks:**
  - `rg "paneTreeToFlat" frontend/lib/patient-profile` returns the new home in `layout-tree.ts`. **No stub in `types.ts` or `Shell.tsx` anymore** (the cv2-01 `// TODO(cv2-02)` comment is gone — the stub has been replaced with the real adapter).
  - `rg "version: 3" frontend/lib/patient-profile` returns only the migration code path (v3 detection + flatToPaneTree call) in `useShellLayout.ts`. No remaining writes target v3.
  - `rg "v3-tree-layout\|v3-layout" frontend/lib/patient-profile` returns the read-only legacy key constant. The v3 key is never written.

---

## Out of scope

- **Telemed-Video template literal.** cv2-03.
- **`/v2-tree` page route.** cv2-03.
- **Tree-aware renderer** (`Shell.tsx` reading `paneTree` directly instead of going through the flat adapter). Phase 2 — first surface that needs cross-group state. The flat adapter stays as the rendering path for Phase 1.
- **Cross-group drag-to-reorder** (e.g. dragging a leaf from one column to another). Phase 3. cv2-02 logs a warn if attempted.
- **Retiring the v3 storage key.** Phase 2. The key stays untouched (read-only legacy) until the v4 ecosystem is stable.
- **Rollback migration v4 → v3.** Not needed — v4 is strictly a superset of v3 (v3 maps cleanly to a single-root v4); no data loss path.

---

## Files expected to touch

**New:**

- `frontend/lib/patient-profile/layout-tree.ts` (~150 LOC).

**Modified:**

- `frontend/lib/patient-profile/types.ts` (~30 LOC delta — bump `PatientProfileLayout` to v4 with `paneTree`).
- `frontend/lib/patient-profile/useShellLayout.ts` (~120 LOC delta — internal tree state, two new setters, v3→v4 migration in `validateLayout`, new storage-key plumbing).
- `frontend/components/patient-profile/Shell.tsx` (~20 LOC delta — drop the local `paneTreeToFlat` stub; import from `layout-tree.ts`; switch `handleResize` to `setLeafSize`).

**Read but do not modify:**

- ppr-08's legacy-seed effect in `PatientProfilePage.tsx` (still works because `applyLayout` continues to accept a `PatientProfileLayout`).

**Tests:** No new test files. Manual smoke at `/dev/shell-tree-smoke` + the v3 → v4 console smoke covers the verification.

---

## Notes / open decisions

1. **Why a separate `PaneTreeNode` vs reusing `PaneDefinition`?** Persistence vs runtime separation. `PaneDefinition` carries React renderers / icons (non-serialisable); `PaneTreeNode` is JSON-safe. Cleaner to have two types than to omit fields at serialise time.

2. **Why `__root__` as a synthetic id for the migrated tree?** v3 didn't have a root; the flat shape implied one. The synthetic `__root__` id keeps the tree well-formed without colliding with any real pane id (which by convention are kebab-case). cv2-03's template literal uses the same `__root__` id for its outer horizontal group.

3. **Could the v3 → v4 migration also infer nested splits?** No. v3 was a flat horizontal group. We can't reconstruct nested intent that was never expressed. The migration produces a single-level tree; tree shape comes from the template literal (cv2-03) when the user mounts the new route.

4. **Why two storage keys (v3 + v4) instead of in-place upgrade?** Safety. If this batch needs to be rolled back, the v3 payload is still in localStorage; the user's preferences survive. Phase 2 retires the v3 key once the v4 ecosystem has soaked.

5. **What about the `paneSize` array vs map in the new payload?** Map. The flat shape was `paneState: Record<id, { sizePct, hidden }>`; the tree carries sizes inline on nodes. The tree shape is fundamentally a recursive structure; a flat sizes array would just re-introduce the v3 problem.

6. **Why does `setGroupSizes` exist alongside `setLeafSize`?** Cascade-handle drags update *multiple* leaves' sizes in one operation (drag handle between Investigations-orders and Plan → both sizes change). `setLeafSize` would fire twice; `setGroupSizes` fires once per group. The renderer chooses which based on whether the drag crossed a group boundary.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Source decisions:** [Product plans/plan-cockpit-v2.md § DL-22](../../../Product%20plans/plan-cockpit-v2.md).
- **Wave gate:** [`EXECUTION-ORDER-cockpit-v2.md` § Wave 3 gate](./EXECUTION-ORDER-cockpit-v2.md#wave-3-gate-after-cv2-02--cv2-03--cv2-05--cv2-06).
- **Previous task:** [`task-cv2-01-recursive-shell-render.md`](./task-cv2-01-recursive-shell-render.md) — must be merged.
- **Next task:** [`task-cv2-03-telemed-video-template-and-v2-tree-route.md`](./task-cv2-03-telemed-video-template-and-v2-tree-route.md) — Wave 3 Lane α step 1.
- **Predecessor invariants:** ppr-02's `useShellLayout` (the hook this task extends), ppr-15a's `validateLayout` chain (the schema-migration pattern this task extends).

---

**Owner:** TBD
**Created:** 2026-05-17
**Status:** Pending
