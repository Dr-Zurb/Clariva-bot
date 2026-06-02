# cpf-02 · Tabs mutation ops — `addToTabsNode`, `extractFromTabsNode`, `moveLeafBetweenTabs`, `setActiveTab`

> **Wave 1** of [cockpit-pane-freedom](../plan-p1-cockpit-pane-freedom-batch.md). Extends `layout-tree-mutations.ts` with the four ops the renderer + context menu (and future DnD) consume.

| **Size** | M | **Model** | Auto | **Wave** | 1 | **Depends on** | cpf-01 (v5 schema) | **Blocks** | cpf-04, cpf-05 |

---

## Why this task

The existing mutation engine (shipped by clpm-04) operates on a leaf-equals-one-pane assumption: `splitLeaf` creates two single-pane leaves; `mergeWithSibling` removes one leaf entirely. To turn leaves into tab containers we add four new ops:

| Op | Effect |
|---|---|
| `addToTabsNode(tree, paneId, targetGroupId, position?)` | Removes `paneId` from its current home and inserts it into the `Tabs` node identified by `targetGroupId`'s `paneIds` array at `position` (default end). Active tab becomes `paneId`. |
| `extractFromTabsNode(tree, paneId, direction)` | Removes `paneId` from its current tabs container and creates a new sibling split holding only that pane. Reverses `addToTabsNode`. |
| `moveLeafBetweenTabs(tree, paneId, toGroupId)` | Convenience wrapper — remove from current home + add to target group. |
| `setActiveTab(tree, groupId, paneId)` | Pure update of `activeTabId` on the matching `Tabs` node. |

These ops respect **DL-2.4 (single-home)** and **DL-2.1 (`MAX_LEAVES = 10`)** invariants.

---

## What to do

### 1. Extend `frontend/lib/patient-profile/layout-tree-mutations.ts`

Add the four ops alongside the existing `splitLeaf` / `mergeWithSibling` / `hideLeaf` / `restoreLeaf` / `toggleCollapsed`.

```ts
type TabsAddPosition = "start" | "end" | number;

/**
 * Move `paneId` from its current home (anywhere in the tree) to the tabs
 * container identified by `targetGroupId`, inserted at `position` (default end).
 * The moved pane becomes the active tab in the target container.
 *
 * Failure modes:
 *   - `not-found`        — `paneId` or `targetGroupId` is not present in the tree.
 *   - `already-in-target` — `paneId` is already the only/one of the paneIds in the target group.
 *   - `cap-reached`      — TARGET container would exceed `MAX_PANES_PER_TABS` (separate cap from MAX_LEAVES).
 */
export function addToTabsNode(
  tree: PaneTreeNode,
  paneId: string,
  targetGroupId: string,
  position: TabsAddPosition = "end",
): Ok | Err<"not-found" | "already-in-target" | "cap-reached">;

/**
 * Remove `paneId` from its current tabs container and create a new sibling
 * split holding only that pane. The new split is inserted next to the source
 * container in `direction` (horizontal = right, vertical = below).
 *
 * Failure modes:
 *   - `not-found`             — `paneId` is not present in the tree.
 *   - `last-pane-in-tree`     — extracting would leave the tree with zero panes.
 *   - `cap-reached`           — would exceed MAX_LEAVES.
 */
export function extractFromTabsNode(
  tree: PaneTreeNode,
  paneId: string,
  direction: "horizontal" | "vertical",
): Ok | Err<"not-found" | "last-pane-in-tree" | "cap-reached">;

/**
 * Convenience: addToTabsNode where the source is implicit (looked up via
 * `findContainerOf(tree, paneId)`). Useful when both source and target are
 * tabs containers and the caller doesn't need the position parameter.
 */
export function moveLeafBetweenTabs(
  tree: PaneTreeNode,
  paneId: string,
  toGroupId: string,
): Ok | Err<"not-found" | "already-in-target">;

/**
 * Pure update of `activeTabId` on the tabs node matching `groupId`. Returns
 * the original tree (reference-equal) when the active tab is already set.
 *
 * Failure modes:
 *   - `not-found` — `groupId` is not present in the tree.
 *   - `not-in-tabs` — `paneId` is not in the tabs node's `paneIds` array.
 */
export function setActiveTab(
  tree: PaneTreeNode,
  groupId: string,
  paneId: string,
): Ok | Err<"not-found" | "not-in-tabs">;
```

### 2. Single-home invariant + helpers

Add a private helper:

```ts
/**
 * Find the tabs container that holds `paneId`. Returns the leaf node and the
 * index of `paneId` within its `paneIds` array; null when `paneId` is not in
 * any tabs container.
 */
function findContainerOf(
  tree: PaneTreeNode,
  paneId: string,
): { container: PaneTreeNode; index: number } | null { /* ... */ }

/**
 * Remove `paneId` from its current container. Returns the new tree + the
 * removed-from container's id (for telemetry / extract logic). When the
 * container becomes empty after removal, the container itself is removed
 * (and its parent split collapses to a single child if applicable).
 */
function removePaneFromCurrentContainer(
  tree: PaneTreeNode,
  paneId: string,
): { tree: PaneTreeNode; sourceContainerId: string } | null { /* ... */ }
```

Every op that adds a pane calls `findContainerOf` first — if found anywhere, the pane is removed before insertion (single-home).

### 3. `MAX_PANES_PER_TABS` cap (soft hint, DL-3.2)

Separate from `MAX_LEAVES = 10`:

```ts
/**
 * Soft cap on number of panes inside one tabs container. Beyond this, the tab
 * strip overflows into a popover ("more" chevron). The cap is enforced at the
 * mutation layer so doctors can't construct unrenderable containers via API.
 */
export const MAX_PANES_PER_TABS = 6;
```

`addToTabsNode` returns `{ ok: false, reason: "cap-reached" }` when adding would exceed 6 panes in the target container.

### 4. Truth tables in `frontend/lib/patient-profile/__tests__/layout-tree-mutations.test.ts`

Cover every edge case. Follow the existing 55-case truth table pattern (clpm-04 / 2026-05-24):

```ts
describe("addToTabsNode (cpf-02)", () => {
  it("inserts paneId at position 'end' of target container by default");
  it("inserts paneId at position 'start' when specified");
  it("inserts paneId at numeric position");
  it("removes paneId from its previous container (single-home)");
  it("makes the moved pane the activeTabId in the target");
  it("collapses an empty source container after removal");
  it("returns { ok: false, reason: 'not-found' } when paneId is absent");
  it("returns { ok: false, reason: 'not-found' } when targetGroupId is absent");
  it("returns { ok: false, reason: 'already-in-target' } when paneId is already in target's paneIds");
  it("returns { ok: false, reason: 'cap-reached' } when target has MAX_PANES_PER_TABS panes");
  it("preserves sizePct + hidden on the target container");
});

describe("extractFromTabsNode (cpf-02)", () => {
  it("removes paneId from its current container");
  it("creates a new sibling split holding only paneId");
  it("uses direction='horizontal' for split-right");
  it("uses direction='vertical' for split-below");
  it("collapses an empty source container after extraction");
  it("returns { ok: false, reason: 'last-pane-in-tree' } when extracting the only pane");
  it("returns { ok: false, reason: 'cap-reached' } when extracting would exceed MAX_LEAVES");
  it("returns { ok: false, reason: 'not-found' } when paneId is absent");
  it("round-trips: addToTabsNode(extracted, paneId, originalContainerId) === original tree (structurally)");
});

describe("moveLeafBetweenTabs (cpf-02)", () => {
  it("is equivalent to extractFromTabsNode followed by addToTabsNode for non-self moves");
  it("is a no-op when source group === target group (returns reason 'already-in-target')");
});

describe("setActiveTab (cpf-02)", () => {
  it("updates activeTabId on the matching tabs node");
  it("returns the original tree (referentially) when activeTabId is already set");
  it("returns { ok: false, reason: 'not-found' } when groupId is absent");
  it("returns { ok: false, reason: 'not-in-tabs' } when paneId is not in the tabs node's paneIds");
});

describe("single-home invariant (cpf-02)", () => {
  it("no mutation produces a tree where any paneId appears in two paneIds arrays");
  it("addToTabsNode refuses already-in-tree paneId via removal-then-insert");
});

describe("activeTabId invariant (cpf-02)", () => {
  it("after every successful mutation, every tabs node satisfies paneIds.includes(activeTabId)");
});
```

### 5. Verify

```powershell
cd frontend
npx tsc --noEmit
pnpm test lib/patient-profile/__tests__/layout-tree-mutations.test.ts
```

---

## Acceptance gate

- [x] Four new ops exported: `addToTabsNode`, `extractFromTabsNode`, `moveLeafBetweenTabs`, `setActiveTab`.
- [x] `MAX_PANES_PER_TABS = 6` exported (soft cap distinct from `MAX_LEAVES = 10`).
- [x] Single-home invariant enforced at every add-op (removal-then-insert).
- [x] `activeTabId` invariant: every successful mutation produces a tree where every `Tabs` node satisfies `paneIds.includes(activeTabId)`.
- [x] Round-trip property: `addToTabsNode(extractFromTabsNode(tree, paneId, dir).tree, paneId, originalGroupId)` returns a tree structurally equal to the original (ignoring container ids that may differ).
- [x] Empty source container auto-collapses (existing `mergeWithSibling` logic reused).
- [x] All truth-table rows green.
- [x] `cd frontend; npx tsc --noEmit` clean.

---

## Anti-goals

- ❌ Don't introduce a new node kind — leaves stay leaves; multi-pane is just `paneIds.length > 1`.
- ❌ Don't modify `splitLeaf` / `mergeWithSibling` / `hideLeaf` / `restoreLeaf` / `toggleCollapsed` signatures — add the new ops alongside.
- ❌ Don't wire DnD — Phase 2. The new ops are pure tree-mutation functions; consumers (context menu in cpf-05, DnD in Phase 2) call them.
- ❌ Don't render anything — Wave 2 / lane α (cpf-03 / cpf-04).
- ❌ Don't allow position values outside `[0, paneIds.length]` — clamp silently or return `{ ok: false, reason: "invalid-position" }`. Pick one and test for it.

---

## Risks (executor-facing)

- **Empty container collapse semantics** — when removing the last pane from a container, the container itself should be removed. If the container's parent split is left with one child, the split should collapse to that child (mirror existing `mergeWithSibling` and `hideLeaf` behaviour). Add a `compactSingleChildSplits(tree)` helper if the existing ops don't already factor this out.
- **Container id stability** — after a mutation, do container ids stay the same? `__tabs_0` after an `addToTabsNode` should still be `__tabs_0`. The renderer keys on container id for resize stability; a renamed container causes a remount (DL-9 violation). Verify in a test.
- **`MAX_PANES_PER_TABS` vs UI cap** — DL-3.2 says "soft cap at 4 with overflow." Why 6 at the mutation layer? Because the soft warning is a UX hint (renders an overflow popover); the mutation cap is a safety net to prevent constructing an absurd 50-tab container via scripted ops. 6 is the practical-ceiling-doctors-would-construct; the renderer overflow engages at 4 (cosmetic).
- **Optional Opus close-gate** — after this task lands, the [batch plan](../plan-p1-cockpit-pane-freedom-batch.md#optional-close-gate-review-turn) calls for an optional Opus pass focused on round-trip soundness, single-home, and `activeTabId` invariants. Don't skip the review if any truth-table row was skipped or `xit`'d for "will fix later."
