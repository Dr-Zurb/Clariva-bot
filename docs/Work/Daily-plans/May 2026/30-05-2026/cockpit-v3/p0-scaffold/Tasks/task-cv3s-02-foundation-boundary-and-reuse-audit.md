# cv3s-02 — Foundation boundary module + reuse audit (isolation test)

| | |
|---|---|
| **Batch** | [p0-cockpit-v3-scaffold (Phase 0)](../plan-p0-cockpit-v3-scaffold-batch.md) |
| **Wave / lane** | Wave 1 / lane β |
| **Size** | XS |
| **Model** | Composer 2 Fast |
| **Depends on** | nothing (the kept engine is already pure) |
| **Blocks** | Phase 1 (R-SHELL3 / R-PALETTE import `foundation.ts`) |
| **Status** | Done |

> **Re-export barrel + a test. No logic.** This task makes **v3-DL-1** mechanical: it draws one explicit import line (`foundation.ts`) between the *kept* layout model + mutation engine and the *to-be-rewritten* shell, and proves with an isolation test that the engine runs with zero dependency on `Shell.tsx` or customize-mode. Don't re-implement anything — re-export verbatim.

---

## Objective

1. Create `frontend/lib/patient-profile/v3/foundation.ts` — the single import surface for all v3 code into the kept foundation: the `PaneTreeNode` model + serialisation, the pure mutation engine + cap constants, the `PaneDefinition` contract + helpers, and the pane icons (P0-DL-4).
2. Create `frontend/lib/patient-profile/v3/__tests__/foundation.test.ts` — an isolation test that imports **only** via `foundation.ts` and exercises the engine end-to-end (build a tree → split into columns → tab a pane in → set active tab → hit the leaf cap → round-trip serialise/deserialise), proving v3-DL-1.
3. Confirm the kept / new / deleted inventory in the [batch plan §Reuse audit](../plan-p0-cockpit-v3-scaffold-batch.md#reuse-audit--kept--new--deleted-inventory-confirmed-in-cv3s-02) is accurate.

---

## Why (context)

v3 is a rewrite of the *shell*, not the *model* (v3-DL-1). The kept engine is already pure and standalone:

- `frontend/lib/patient-profile/layout-tree.ts` — `PaneTreeNode` + `serialiseTree` / `deserialiseTree` / `isValidTreeNode` / `upgradeV4LeavesToV5` / `paneTreeToFlat` / shape helpers. No React, no `Shell.tsx` import.
- `frontend/lib/patient-profile/layout-tree-mutations.ts` — `dropPaneIntoZone` (edge = split, center = tab), `addToTabsNode`, `extractFromTabsNode`, `setActiveTab`, `restoreLeaf`, `hideLeaf`, `splitLeaf`, `mergeWithSibling`, plus `MAX_LEAVES` / `MAX_PANES_PER_TABS`. Pure functions returning `{ ok, tree } | { ok:false, reason }`.
- `frontend/lib/patient-profile/types.ts` — the `PaneDefinition` contract + `flattenPaneDefinitions`.

The risk this task removes: a later phase reaching into the old shell "just to borrow one thing," quietly re-coupling v3 to the code we intend to delete. A boundary module + an isolation test that imports only through it makes that coupling visible immediately (it would force an import into `foundation.ts` that doesn't belong there).

---

## Files to create

| File | Change |
|---|---|
| `frontend/lib/patient-profile/v3/foundation.ts` | **Create** — re-export barrel (the kept/rewrite contract line). |
| `frontend/lib/patient-profile/v3/__tests__/foundation.test.ts` | **Create** — isolation test exercising the engine via the barrel. |

**Do not** edit `layout-tree.ts`, `layout-tree-mutations.ts`, `types.ts`, `pane-icons.ts`, or anything under `panes/` (P0-DL-5) — re-export only.

---

## Implementation

### Step 1 — The boundary barrel

`frontend/lib/patient-profile/v3/foundation.ts`. Re-export verbatim; no wrapping, no renaming. (Export `PaneTreeNode` from `layout-tree` only, to avoid the duplicate that `types.ts` also re-exports.)

```ts
/**
 * foundation.ts — the kept-foundation import boundary for Cockpit v3 (cv3s-02).
 *
 * v3-DL-1 / P0-DL-4: ALL v3 code imports the kept layout model, the pure
 * mutation engine, the PaneDefinition contract, and pane icons through THIS
 * file — never directly from the underlying modules, and NEVER from Shell.tsx,
 * customize-mode-context, CustomizeBar, or the old PaneDropOverlay.
 *
 * This file must contain re-exports ONLY. No logic, no React. If something here
 * needs to import the old shell, that is a design smell — stop and reconsider.
 */

// ── Kept model + serialisation (layout-tree.ts) ──────────────────────────────
export {
  serialiseTree,
  deserialiseTree,
  isValidTreeNode,
  upgradeV4LeavesToV5,
  paneTreeToFlat,
  flatToPaneTree,
  listTabsContainers,
  describeLayoutShape,
  isLayoutCramped,
  CRAMPED_ROOT_SIBLINGS,
} from "@/lib/patient-profile/layout-tree";
export type {
  PaneTreeNode,
  TabsContainerInfo,
  LayoutShape,
} from "@/lib/patient-profile/layout-tree";

// ── Kept pure mutation engine (layout-tree-mutations.ts) ──────────────────────
export {
  dropPaneIntoZone,
  addToTabsNode,
  extractFromTabsNode,
  moveLeafBetweenTabs,
  setActiveTab,
  restoreLeaf,
  hideLeaf,
  mergeWithSibling,
  splitLeaf,
  toggleCollapsed,
  countLeaves,
  findLeaf,
  hasSibling,
  MAX_LEAVES,
  MAX_PANES_PER_TABS,
} from "@/lib/patient-profile/layout-tree-mutations";
export type {
  DropZone,
  TabsAddPosition,
} from "@/lib/patient-profile/layout-tree-mutations";

// ── Kept pane contract (types.ts) ────────────────────────────────────────────
export {
  flattenPaneDefinitions,
  collectPaneLeafIds,
  allPaneLeavesHidden,
} from "@/lib/patient-profile/types";
export type {
  PaneDefinition,
  PaneTabDefinition,
  PaneRuntimeState,
  PatientProfileLayout,
  LayoutNode,
  SlotRenderer,
} from "@/lib/patient-profile/types";

// ── Kept pane icons ──────────────────────────────────────────────────────────
export * from "@/lib/patient-profile/pane-icons";
```

> Adjust the named lists to match the actual exports if any symbol above was renamed since this task was authored — the rule is "re-export the kept public surface," not "match this list byte-for-byte." If a name collides on `export *` from `pane-icons`, switch it to an explicit named re-export.

### Step 2 — The isolation test

`frontend/lib/patient-profile/v3/__tests__/foundation.test.ts`. Import **only** from `foundation.ts`. This is the proof that the engine runs without the old shell.

```ts
import { describe, it, expect } from "vitest";
import {
  dropPaneIntoZone,
  addToTabsNode,
  setActiveTab,
  paneTreeToFlat,
  serialiseTree,
  deserialiseTree,
  isValidTreeNode,
  MAX_LEAVES,
  type PaneTreeNode,
} from "@/lib/patient-profile/v3/foundation";

const leaf = (id: string, sizePct = 50): PaneTreeNode => ({
  id,
  sizePct,
  hidden: false,
  paneIds: [id],
  activeTabId: id,
});

const root = (
  children: PaneTreeNode[],
  direction: "horizontal" | "vertical" = "horizontal",
): PaneTreeNode => ({
  id: "__root__",
  sizePct: 100,
  hidden: false,
  direction,
  children,
});

describe("cv3s-02: kept engine runs in isolation (v3-DL-1)", () => {
  it("edge-drop splits a 2-tab group into two columns", () => {
    // A single root leaf holding two tabs.
    const tree: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      paneIds: ["a", "b"],
      activeTabId: "a",
    };
    const r = dropPaneIntoZone(tree, "b", "__root__", "east");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tree.children?.length).toBe(2); // two columns
      expect(paneTreeToFlat(r.tree).paneOrder.sort()).toEqual(["a", "b"]);
    }
  });

  it("center-drop / addToTabsNode stacks a pane as a tab", () => {
    const tree = root([leaf("a"), leaf("b")]);
    const r = addToTabsNode(tree, "b", "a", "end");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(paneTreeToFlat(r.tree).paneOrder.sort()).toEqual(["a", "b"]);
    }
  });

  it("setActiveTab switches the active tab", () => {
    const tree: PaneTreeNode = {
      id: "__root__",
      sizePct: 100,
      hidden: false,
      paneIds: ["a", "b"],
      activeTabId: "a",
    };
    const r = setActiveTab(tree, "__root__", "b");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tree.activeTabId).toBe("b");
  });

  it("refuses an edge split that would exceed MAX_LEAVES", () => {
    const cols = Array.from({ length: MAX_LEAVES }, (_, i) => leaf(`p${i}`));
    const tree = root(cols);
    const r = dropPaneIntoZone(tree, "p0", "p1", "east");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("cap-reached");
  });

  it("round-trips through serialise / deserialise", () => {
    const tree = root([leaf("a"), leaf("b")]);
    expect(isValidTreeNode(tree)).toBe(true);
    expect(deserialiseTree(serialiseTree(tree))).toEqual(tree);
  });
});
```

> The assertions stay at the public-API level (`.ok`, `paneTreeToFlat`, `activeTabId`) so they're robust to internal refactors. The point is "the engine works imported only through the boundary," not pinning exact tree shapes.

### Step 3 — Confirm the reuse audit

Re-read the [batch plan §Reuse audit](../plan-p0-cockpit-v3-scaffold-batch.md#reuse-audit--kept--new--deleted-inventory-confirmed-in-cv3s-02) inventory against the actual tree. Specifically verify:

- Every "Kept" file exists and is re-exported by `foundation.ts` (or is a pane body under `panes/*` consumed later by reference).
- No "Kept" module imports `Shell.tsx` / `customize-mode-context` (a quick grep; the model/engine should be UI-free).
- The "Deleted at cutover" list still matches what Phase 4 will remove.

If anything is stale, fix the inventory line in the batch plan (the plan is editable under any cell; don't renumber DLs).

---

## Tests

Run:

```bash
cd frontend
npx tsc --noEmit
npm test -- lib/patient-profile/v3/__tests__/foundation.test.ts
npm run lint
```

All green. If `npx tsc` flags a re-export name that no longer exists, reconcile `foundation.ts` against the actual exports (Step 1 note).

---

## Acceptance criteria

- [x] `frontend/lib/patient-profile/v3/foundation.ts` re-exports the kept surface: model + serialisation (layout-tree), the mutation engine + `MAX_LEAVES` / `MAX_PANES_PER_TABS` (layout-tree-mutations), `PaneDefinition` + helpers (types), pane icons.
- [x] `foundation.ts` is re-exports only — no logic, no React, and **no import** of `Shell.tsx` / `customize-mode-context` / `CustomizeBar` / `PaneDropOverlay` (P0-DL-4 / v3-DL-1).
- [x] `foundation.test.ts` imports **only** via `foundation.ts` and passes: edge-split → 2 columns; `addToTabsNode` → tab; `setActiveTab`; `MAX_LEAVES` refusal; serialise/deserialise round-trip.
- [x] The batch plan's kept/new/deleted inventory is confirmed accurate (corrected if stale).
- [x] No edit to `layout-tree*.ts` / `types.ts` / `pane-icons.ts` / `panes/*` / any migration (P0-DL-5).
- [x] `npx tsc --noEmit`, `npm run lint`, and the isolation test clean.

---

## Out of scope

- Wiring `foundation.ts` into `CockpitV3Shell` → Phase 1 (the stub stays inert in Phase 0).
- An eslint `no-restricted-imports` rule enforcing the boundary repo-wide → nice-to-have fast-follow; Phase 0 relies on the boundary module + the isolation test + code review.
- Any change to the engine's behaviour or signatures → out (v3-DL-1: reuse, don't rewrite).

---

## Decision log

- **Barrel, not wrapper.** `foundation.ts` re-exports the kept symbols verbatim so the contract is a stable *import path*, not a new API to maintain. Renaming/wrapping would just be drift.
- **`PaneTreeNode` exported from `layout-tree` only.** `types.ts` also re-exports it; exporting from one place in the barrel avoids a duplicate-export error.
- **Isolation test is the v3-DL-1 proof.** Importing only through the boundary means a future accidental coupling to the old shell can't hide — it would have to appear as an out-of-place import in `foundation.ts`.
- **Assertions at the public-API level.** Keeps the test robust to internal engine refactors; it validates "works in isolation," not exact tree internals (those are already covered by the engine's own truth-table suite).

---

## References

- [Phase 0 plan](../plan-p0-cockpit-v3-scaffold-batch.md) · [Execution order](./EXECUTION-ORDER-p0-cockpit-v3-scaffold.md)
- [`Product plans/plan-cockpit-v3.md`](../../../../../../Product%20plans/plan-cockpit-v3.md) — v3-DL-1 (reuse the engine).
- [`frontend/lib/patient-profile/layout-tree.ts`](../../../../../../../frontend/lib/patient-profile/layout-tree.ts) — `PaneTreeNode` + serialisation (re-exported).
- [`frontend/lib/patient-profile/layout-tree-mutations.ts`](../../../../../../../frontend/lib/patient-profile/layout-tree-mutations.ts) — the pure engine + caps (re-exported + exercised).
- [`frontend/lib/patient-profile/types.ts`](../../../../../../../frontend/lib/patient-profile/types.ts) — `PaneDefinition` contract (re-exported).
- Sibling: [cv3s-01](./task-cv3s-01-feature-flag-and-parallel-mount.md) — the stub that imports this boundary in Phase 1.
