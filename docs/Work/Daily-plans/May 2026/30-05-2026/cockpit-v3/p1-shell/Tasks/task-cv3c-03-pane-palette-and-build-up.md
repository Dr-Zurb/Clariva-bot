# cv3c-03 — Pane palette + blank-canvas build-up + minimal context menu

| Field | Value |
|---|---|
| **Batch** | [Cockpit v3 Phase 1 — core shell](../plan-p1-cockpit-v3-shell-batch.md) |
| **Wave** | 2 (Lane A) |
| **Depends on** | cv3c-01 (renderer), cv3c-02 (tabs + `closeTab`) |
| **Blocks** | cv3c-04 |
| **Size** | **M–L** |
| **Model** | **Auto** |
| **Decision locks** | v3-DL-5, v3-DL-7, P0-DL-4, P1-DL-1, P1-DL-4, P1-DL-5 |

---

## Objective

Turn "renders a dev-seed tree" into "the doctor builds the cockpit from blank":

1. **Blank default (P1-DL-4):** the v3 default layout is a flat row of all available panes with **every leaf hidden**. The renderer shows an empty-state ("Add a pane to begin") when nothing is visible. Replaces cv3c-01's dev seed.
2. **Pane palette (R-PALETTE):** a header surface listing every available `PaneDefinition` (title + icon), marking on-canvas vs available. Click an available pane → it appears (a new column); click an on-canvas pane → it's removed. Evolved from `PaneToggleBar`.
3. **Minimal per-leaf context menu (P1-DL-5 / V3-Q4):** right-click (or a `⋯` button) on a leaf → Split right / Split down / Move to group / Close. The non-drag creation path so the shell is fully buildable before Phase 2's DnD; also the permanent keyboard/a11y fallback. Reuses the existing `PaneContextMenu` types.
4. **Caps + toast (v3-DL-7):** adds/splits that would exceed `MAX_LEAVES` / `MAX_PANES_PER_TABS` are rejected by the engine; surface a toast and no-op.

## Why this task

This is what makes v3 *v3*: blank start + palette (v3-DL-5) instead of a fixed template the doctor must tear down. The palette + context menu give complete build-up coverage (add → column, split → row, move → tab) using only existing engine ops, so when Phase 2 adds the Cursor-style drag overlay it's pure UX on top of a model that already works — and the context menu remains as the no-pointer path.

## The add/remove model (locked here, reused by close)

v3 needs **zero engine edits** because the kept engine already expresses everything via the hidden-bit + structural ops:

| Action | Mechanism (existing) |
|---|---|
| Blank canvas | default tree = flat row of all panes, all `hidden: true` → nothing renders → empty-state |
| Add pane (palette) | `setPaneHidden(id, false)` (pane exists hidden in the row) — appears as a column |
| Remove pane (palette / tab ×) | `closeTab(groupId, id)` from cv3c-02 (`extractFromTabsNode`+`hideLeaf` or `setPaneHidden(true)`) |
| Split right / down | `splitLeaf` or `dropPaneIntoZone(tree, src, target, "right"/"bottom")` |
| Move into group as tab | `dropPaneIntoZone(…, "center")` / `addToTabsNode` / `moveLeafBetweenTabs` |
| Re-add a removed pane | inverse of remove — `setPaneHidden(false)` / `restoreLeaf` |

> Confirm the exact zone strings + signatures against `dropPaneIntoZone` (L715) and `restoreLeaf` (L232) via `foundation.ts`. Match the kept shell's call sites.

## Files

| File | Change |
|---|---|
| `frontend/components/patient-profile/v3/CockpitPalette.tsx` | **New** — header palette (evolved `PaneToggleBar`): all panes, on-canvas vs available, click add/remove. |
| `frontend/components/patient-profile/v3/CockpitEmptyState.tsx` | **New** — blank-canvas prompt shown when no pane is visible. |
| `frontend/components/patient-profile/v3/CockpitLeafMenu.tsx` | **New** — per-leaf context menu (Split right/down, Move to group, Close), reusing `PaneContextMenu` types/markup. |
| `frontend/lib/patient-profile/v3/useCockpitV3Layout.ts` | **Edit** — add `addPane(paneId)`, `removePane(paneId)`, `splitLeaf(groupId, dir)`, `movePane(paneId, targetGroupId, zone)`; each dispatches an engine fn + `applyLayout`, returns `{ ok, reason }` for toasts. |
| `frontend/lib/patient-profile/v3/blankLayout.ts` | **New** — builds the all-hidden default tree from a `PaneDefinition[]`. |
| `frontend/components/patient-profile/v3/CockpitCanvas.tsx` | **Edit** — use `blankLayout` as default; render `CockpitEmptyState` when no visible leaf; mount `CockpitPalette` (header slot) + wire `CockpitLeafMenu`. |
| `frontend/components/patient-profile/v3/CockpitV3Shell.tsx` | **Edit** — place `CockpitPalette` in the desktop header band (above the canvas, below/with the docks as appropriate). |
| `frontend/components/patient-profile/v3/__tests__/CockpitPalette.test.tsx` | **New** — add/remove, on-canvas marking, caps toast. |
| `frontend/components/patient-profile/v3/__tests__/buildUp.test.tsx` | **New** — blank → add 3 → 3 columns; split → row; move → tab; remove all → empty-state. |

## Implementation sketch

### `blankLayout`

```typescript
// All panes present but hidden → renderer shows empty-state until one is added.
export function blankLayout(panes: PaneDefinition[]): PatientProfileLayout {
  const paneOrder = panes.map((p) => p.id);
  const paneState = Object.fromEntries(
    panes.map((p) => [p.id, { sizePct: p.naturalSizePct ?? 33, hidden: true }]),
  );
  return { version: LAYOUT_VERSION, paneTree: flatToPaneTree({ paneOrder, paneState }) };
}
```

> `flatToPaneTree` / `LAYOUT_VERSION` via `foundation.ts`. This reuses the *exact* persisted shape `useShellLayout` expects — so persistence "just works" (P1-DL-1). Wire it as `CockpitCanvas`'s default (pass `defaultPaneOrder`/`defaultPaneState` derived from `blankLayout`, or `applyLayout(blankLayout(panes))` on first mount when storage is empty).

### `useCockpitV3Layout` build-up callbacks (edit)

```typescript
const addPane = (id) => shell.setPaneHidden(id, false);           // appears as column
const removePane = (id) => shell.setPaneHidden(id, true);         // or closeTab for tab leaves
const splitLeafDir = (groupId, dir) =>
  dispatchEngine((t) => splitLeaf(t, groupId, dir));              // engine via foundation
const movePane = (paneId, targetGroupId, zone) =>
  dispatchEngine((t) => dropPaneIntoZone(t, paneId, targetGroupId, zone));
```

Each returns the engine's `{ ok, reason }`; the caller toasts on `!ok` (cap hit). Reuse cv3c-02's `closeTab` for the tab-leaf removal case.

### `CockpitPalette` (evolved `PaneToggleBar`)

- Reuse `PaneToggleBar`'s icon-button + tooltip layout (`components/ui/tooltip`).
- Each pane button reflects **on-canvas** (visible leaf) vs **available** (hidden) — derive from `paneState[id].hidden`.
- Click available → `addPane(id)`; click on-canvas → `removePane(id)` (guard last pane: keep ≥0 — empty-state is allowed, so removing the last is fine and shows the empty prompt).
- **No drag** in the palette for Phase 1 (DnD is Phase 2). The existing `PaneToggleBar` reorder-by-drag is dropped in this fork.
- Optional: group by the template's `columnPanes` clusters (as `PaneToggleBar` does) for readability, but a flat list is acceptable for Phase 1.

### `CockpitLeafMenu` (reuse `PaneContextMenu`)

- Reuse `PaneContextMenuMoveTarget` / `PaneContextMenuSplitTarget` / `PaneContextMenuMoveOption` types and the menu markup from the existing `PaneContextMenu.tsx`.
- Wire its actions to the cv3 callbacks: Split right → `splitLeafDir(groupId, "row")`; Split down → `splitLeafDir(groupId, "column")`; Move to group X → `movePane(paneId, X, "center")`; Close → `closeTab(groupId, paneId)`.
- Trigger via `PaneTabStripV3`'s existing `onContextMenuTab` hook (already plumbed in cv3c-02) and/or a `⋯` button on the leaf header.

### `CockpitEmptyState`

```tsx
<div className="flex h-full items-center justify-center text-muted-foreground">
  <div className="text-center">
    <p className="text-sm font-medium">Your cockpit is empty</p>
    <p className="text-xs">Add a pane from the palette above to begin.</p>
  </div>
</div>
```

`CockpitCanvas` renders this when `countVisibleLeaves(paneTree) === 0` instead of `CockpitGroupView`.

## Tests

**`CockpitPalette.test.tsx`**
- [x] Lists every pane; hidden panes marked available, visible marked on-canvas.
- [x] Click available → `addPane` (pane becomes visible).
- [x] Click on-canvas → `removePane` (pane hidden).
- [x] Cap: with `MAX_LEAVES` visible, adding one more → toast + no add.

**`buildUp.test.tsx`** (the Phase 1 build-up story)
- [x] Blank canvas → empty-state shown.
- [x] Add 3 panes → 3 columns (root is a row with 3 leaves).
- [x] Split a leaf down → that column becomes a 2-row group.
- [x] Move pane A into pane B's leaf (`center`) → B's leaf becomes a 2-tab group.
- [x] Remove all → empty-state returns.
- [x] Each step round-trips through serialise/deserialise unchanged.

## Acceptance criteria

- [x] v3 default is blank (all panes hidden); empty-state renders when nothing visible (P1-DL-4 / v3-DL-5).
- [x] Palette adds (→ column) / removes panes; on-canvas vs available reflected live.
- [x] Context menu builds rows (split) + tabs (move/center) using existing engine ops (P1-DL-5).
- [x] Caps enforced with a toast; no invariant violation (v3-DL-7).
- [x] **No engine edits**, no new persistence layer, all imports via `foundation.ts` (v3-DL-1 / P1-DL-1 / P0-DL-4).
- [x] No `useCustomizeMode` / `PaneDropOverlay` import (P1-DL-3).
- [x] `npx tsc --noEmit` + `npm run lint` clean; palette + build-up suites green.
- [x] Flag off → unchanged; no fixed template pre-fill anywhere.

## Out of scope (explicit)

- Cursor-style drag overlay / drop-on-tab-bar / drag reorder → Phase 2 (R-DND3). Context menu is the Phase 1 move path.
- Persistence hardening / per-doctor remember / reset-to-seed → Phase 3 (R-PERSIST3).
- Type-aware default seed → deferred (V3-Q1); blank for now.
- Palette drag-to-reorder (the old `PaneToggleBar` behaviour) → not ported.

## Decision log

- **Blank = all-hidden flat row, not a structurally empty tree:** reuses the exact `useShellLayout` persisted shape (`flatToPaneTree`) so persistence + hydration need zero new code (P1-DL-1), and "add" is a one-line `setPaneHidden(false)`. A truly empty tree would need new empty-root handling in the engine/renderer — avoided.
- **Context menu now, drag later:** ships a complete, testable, keyboard-accessible build-up path in Phase 1 (V3-Q4 resolved: keep it permanently) and de-risks Phase 2 (DnD becomes UX over proven ops).
- **Palette is a fork of `PaneToggleBar`, not a reuse:** the old bar is customize/reorder-coupled and lives in the old header; a v3 fork stays clean and dies with the old shell at cutover.

## References

- [`frontend/components/patient-profile/PaneToggleBar.tsx`](../../../../../../frontend/components/patient-profile/PaneToggleBar.tsx) — palette seed (icon buttons + on/off + tooltip).
- [`frontend/components/patient-profile/PaneContextMenu.tsx`](../../../../../../frontend/components/patient-profile/PaneContextMenu.tsx) — move/split target types + menu markup to reuse.
- [`frontend/lib/patient-profile/layout-tree-mutations.ts`](../../../../../../frontend/lib/patient-profile/layout-tree-mutations.ts) — `splitLeaf` (L109), `dropPaneIntoZone` (L715), `restoreLeaf` (L232), `addToTabsNode` (L564), `MAX_LEAVES` (L39), `MAX_PANES_PER_TABS` (L362).
- [`frontend/lib/patient-profile/useShellLayout.ts`](../../../../../../frontend/lib/patient-profile/useShellLayout.ts) — `setPaneHidden` / `applyLayout` / `defaultLayout` shape reference.
- cv3c-01 / cv3c-02: [`task-cv3c-01-…`](./task-cv3c-01-recursive-editor-group-renderer.md) · [`task-cv3c-02-…`](./task-cv3c-02-always-on-tabbed-leaves.md).
- Batch: [`plan-p1-cockpit-v3-shell-batch.md`](../plan-p1-cockpit-v3-shell-batch.md) · Order: [`EXECUTION-ORDER-p1-cockpit-v3-shell.md`](./EXECUTION-ORDER-p1-cockpit-v3-shell.md).

---

**Status:** `Done` (2026-05-31).  
**Done when:** acceptance criteria checked; status stamped here.
