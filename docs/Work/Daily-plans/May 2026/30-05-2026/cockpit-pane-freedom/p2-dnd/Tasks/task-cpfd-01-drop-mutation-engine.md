# cpfd-01 · `dropPaneIntoZone` — directional drop op for the 5-zone overlay

> **Wave 1** of [p2-cockpit-pane-freedom-dnd](../plan-p2-cockpit-pane-freedom-dnd-batch.md). The load-bearing task — every Wave 2 task calls this op and imports its `DropZone` type.

| **Size** | M | **Model** | Auto | **Wave** | 1 | **Depends on** | cpf-02 (Phase 1 ops) | **Blocks** | cpfd-02, cpfd-03, cpfd-04 |

---

## Why this task

Phase 1 gave us two ways to re-home a pane:

- `addToTabsNode(tree, paneId, targetGroupId)` — tab `paneId` INTO `targetGroupId`. This is exactly the **Center** drop.
- `extractFromTabsNode(tree, paneId, direction)` — pull `paneId` out of ITS OWN container into a sibling split, always inserted right (horizontal) / below (vertical). This is **source-relative** and only covers two of four edges.

The 5-zone overlay needs a **target-relative, side-aware** insert: "drop pane A onto container B's *west* edge" must put A as a new sibling **to the left of B**, regardless of where A currently lives. `extractFromTabsNode` can't express "left of an arbitrary target", so we add one new primitive that the whole DnD layer routes through:

```ts
dropPaneIntoZone(tree, sourcePaneId, targetGroupId, zone)
```

`center` delegates to `addToTabsNode`; the four edges do the new target-relative insert. Keeping it as one entry point means the renderer's `handleDragEnd` has a single, total mapping from (source, target, zone) → result, and the truth table lives in one place.

---

## What to do

### 1. Add the `DropZone` type to `frontend/lib/patient-profile/layout-tree-mutations.ts`

```ts
/**
 * The five drop targets a container exposes during a drag (cpfd-01).
 * `center` = tab into the container; the four edges = split as a sibling on
 * that side. Imported by `<PaneDropOverlay>` (cpfd-02) and the shell wiring
 * (cpfd-03) so the zone vocabulary has a single source of truth.
 */
export type DropZone = "center" | "north" | "south" | "east" | "west";
```

> The four edges map to axes: `east` / `west` are **horizontal**; `north` / `south` are **vertical**. `west` / `north` insert BEFORE the target; `east` / `south` insert AFTER.

### 2. Add `dropPaneIntoZone`

```ts
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
): PaneTreeOk | PaneTreeErr<"not-found" | "already-in-target" | "cap-reached" | "last-pane-in-tree" | "no-op"> {
  // 0. center → reuse Phase 1.
  if (zone === "center") {
    const result = addToTabsNode(tree, sourcePaneId, targetGroupId, "end");
    // addToTabsNode returns "already-in-target" / "cap-reached" / "not-found".
    return result;
  }

  // 1. Validate source + target.
  const source = findContainerOf(tree, sourcePaneId);
  if (!source) return { ok: false, reason: "not-found" };
  const target = findPaneTreeNodeById(tree, targetGroupId);
  if (!target || !isPaneTreeLeaf(target)) return { ok: false, reason: "not-found" };

  // 2. No-op guard — source is the only pane in target AND target is the source's
  //    own single-pane container: an edge drop would re-create the same shape.
  const sourceIsSoleOccupantOfTarget =
    source.container.id === target.id &&
    (target.paneIds ?? [target.id]).length === 1;
  if (sourceIsSoleOccupantOfTarget) return { ok: false, reason: "no-op" };

  // 3. last-pane-in-tree.
  const { paneOrder } = paneTreeToFlat(tree);
  if (paneOrder.length <= 1) return { ok: false, reason: "last-pane-in-tree" };

  // 4. Cap — an edge drop always creates one new leaf.
  if (countPaneTreeLeaves(tree) >= MAX_LEAVES) {
    return { ok: false, reason: "cap-reached" };
  }

  // 5. Remove source from its current home (single-home), then re-find target by id.
  const removed = removePaneFromCurrentContainer(tree, sourcePaneId);
  if (!removed) return { ok: false, reason: "not-found" };
  const targetAfter = findPaneTreeNodeById(removed.tree, targetGroupId);
  if (!targetAfter || !isPaneTreeLeaf(targetAfter)) {
    // The target container collapsed during removal (it WAS the source's container
    // and held only the moved pane + nothing else). Treat as no-op.
    return { ok: false, reason: "no-op" };
  }

  // 6. Insert the new leaf relative to the target.
  const axis: "horizontal" | "vertical" =
    zone === "east" || zone === "west" ? "horizontal" : "vertical";
  const insertBefore = zone === "west" || zone === "north";
  const parentLoc = findParentOfPaneTreeNode(removed.tree, targetGroupId);

  const newLeaf = makeSinglePaneLeaf(
    sourcePaneId,
    targetAfter.sizePct / 2,
    targetAfter.hidden,
  );

  // Root-target case: target has no parent. Wrap the whole tree as needed.
  // Same-axis parent: splice into the parent's children.
  // Cross-axis parent (or root): replace target with a nested split of `axis`.
  // ...implement per the three branches; reuse compactSingleChildSplits at the end.

  return { ok: true, tree: compactSingleChildSplits(resultTree) };
}
```

**Implementation guidance for step 6 (the three branches):**

- **Same-axis parent** (`parentLoc.parent.direction === axis`, or the parent is a horizontal split and `axis === "horizontal"`, etc.): splice `newLeaf` into `parent.children` at `targetIndex` (insertBefore) or `targetIndex + 1`. Halve the target leaf's `sizePct` and give the other half to `newLeaf` (mirror `extractFromTabsNode`'s `originalSize / 2` split so the rest of the row isn't disturbed).
- **Cross-axis parent** (`parent.direction !== axis`): replace the target node (via `updatePaneTreeNodeById` on the target id) with a fresh split:
  ```ts
  {
    id: nextPaneTreeSplitId(),
    sizePct: targetAfter.sizePct,
    hidden: targetAfter.hidden,
    direction: axis,
    children: insertBefore
      ? [{ ...newLeaf, sizePct: 50 }, { ...targetAfter, sizePct: 50 }]
      : [{ ...targetAfter, sizePct: 50 }, { ...newLeaf, sizePct: 50 }],
  }
  ```
  (Inner sizes are percentages of the new split, so 50/50.)
- **Root target** (`parentLoc === null`): the target is the whole tree. Build the cross-axis split above and return it as the new root (preserve `id: "__root__"` semantics if the root carries that id — wrap so the root stays the outermost node). Reuse the `restoreLeaf` "wrap the root" pattern as a reference.

> All helpers you need already exist in the file and are private: `findContainerOf`, `findPaneTreeNodeById`, `isPaneTreeLeaf`, `countPaneTreeLeaves`, `removePaneFromCurrentContainer`, `findParentOfPaneTreeNode`, `makeSinglePaneLeaf`, `updatePaneTreeNodeById`, `compactSingleChildSplits`, `nextPaneTreeSplitId`. Do not duplicate them.

### 3. Truth table in `frontend/lib/patient-profile/__tests__/layout-tree-mutations.test.ts`

Write these BEFORE the implementation (cf. cpf-02). Use small fixture trees.

```ts
describe("dropPaneIntoZone — center (cpfd-01)", () => {
  it("delegates to addToTabsNode: pane becomes the active tab in target");
  it("returns 'already-in-target' when the pane is already in target's paneIds");
  it("returns 'cap-reached' when target already holds MAX_PANES_PER_TABS");
});

describe("dropPaneIntoZone — edges, same-axis parent (cpfd-01)", () => {
  it("west inserts a sibling immediately BEFORE the target in a horizontal parent");
  it("east inserts a sibling immediately AFTER the target in a horizontal parent");
  it("north inserts a sibling BEFORE the target in a vertical parent");
  it("south inserts a sibling AFTER the target in a vertical parent");
  it("halves the target's sizePct between target and the new leaf");
});

describe("dropPaneIntoZone — edges, cross-axis parent (cpfd-01)", () => {
  it("east on a target inside a vertical parent wraps target in a horizontal split [target, new]");
  it("west on a target inside a vertical parent wraps target in a horizontal split [new, target]");
  it("south on a target inside a horizontal parent wraps target in a vertical split [target, new]");
  it("new split inherits the target's sizePct; inner children are 50/50");
});

describe("dropPaneIntoZone — root + single-pane targets (cpfd-01)", () => {
  it("east on the root leaf produces a horizontal root split [root, new]");
  it("south on the root leaf produces a vertical root split [root, new]");
});

describe("dropPaneIntoZone — invariants + failures (cpfd-01)", () => {
  it("removes the source from its previous container (single-home)");
  it("no resulting tree has a paneId in two paneIds arrays");
  it("every tabs node satisfies paneIds.includes(activeTabId) after the drop");
  it("returns 'cap-reached' on an edge drop when the tree already has MAX_LEAVES leaves");
  it("returns 'last-pane-in-tree' on an edge drop when the source is the only pane");
  it("returns 'no-op' when dropping a single-pane container's only pane on its own edge");
  it("returns 'not-found' for an absent source or target");
});

describe("dropPaneIntoZone — round-trip (cpfd-01)", () => {
  it("east then dropping the pane back into the original container (center) is structurally equal to the original");
  it("moving a tab out via west then back via center restores the original tree");
});
```

### 4. Verify

```powershell
cd frontend
npx tsc --noEmit
npm test lib/patient-profile/__tests__/layout-tree-mutations.test.ts
```

---

## Acceptance gate

- [x] `DropZone` type exported from `layout-tree-mutations.ts`.
- [x] `dropPaneIntoZone` exported; `center` delegates to `addToTabsNode`.
- [x] Edge drops are target-relative + side-aware (west=before/left, east=after/right, north=before/above, south=after/below).
- [x] Same-axis parent → splice into existing split; cross-axis parent / root → wrap target in a fresh nested split of the zone axis.
- [x] Single-home preserved (remove-then-insert); `activeTabId` invariant holds after every drop.
- [x] `MAX_LEAVES` enforced for edges, `MAX_PANES_PER_TABS` for center; `no-op` returned (not a malformed tree) for self-drops that change nothing.
- [x] Round-trip property green.
- [x] All new truth-table rows green; existing `layout-tree-mutations` rows still green.
- [x] `cd frontend; npx tsc --noEmit` clean.

**Done** — 2026-05-30.

---

## Anti-goals

- ❌ Don't add a new node kind — leaves stay leaves; edge drops create single-pane sibling leaves.
- ❌ Don't change `addToTabsNode` / `extractFromTabsNode` / `setActiveTab` signatures — `dropPaneIntoZone` composes them + the private helpers.
- ❌ Don't render or import any React — this is pure tree logic (Wave 2 consumes it).
- ❌ Don't bump `layoutVersion` semantics or touch the persisted shape — Phase 2 adds no schema.
- ❌ Don't duplicate the private tree helpers — reuse the ones already in the file.

---

## Risks (executor-facing)

- **Self-drop / source-is-target collapse.** When the source pane lives in the target container, `removePaneFromCurrentContainer` may collapse that container (if it held only the moved pane). After removal, re-find the target by id; if it's gone, return `no-op`. Test the "drag a single-pane container's only pane onto its own east edge" case explicitly — it must be `no-op`, not a crash.
- **Container id stability (DL-9).** The renderer keys resize panels + pane bodies on node ids. For same-axis splices, the target keeps its id. For cross-axis wraps, the NEW split gets a synthetic `__split_<n>` id but the target leaf keeps its id inside the split, so the pane body's `pane-<id>` key is unchanged → no remount. Verify the target leaf's `id` survives the wrap.
- **Size math.** Mirror `extractFromTabsNode`'s `originalSize / 2` halving so a drop doesn't blow out the row's 100% sum. `compactSingleChildSplits` cleans up any degenerate single-child split left behind by the source removal.
- **Optional Opus close-gate.** After this lands, the [exec-order doc](./EXECUTION-ORDER-p2-cockpit-pane-freedom-dnd.md#optional-close-gate-review-turn) calls for an optional Opus pass on insert soundness + single-home + round-trip + `no-op` integrity. Don't skip it if any truth-table row was `xit`'d.
