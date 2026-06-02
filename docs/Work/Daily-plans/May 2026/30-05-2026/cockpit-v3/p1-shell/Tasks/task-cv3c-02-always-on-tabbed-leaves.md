# cv3c-02 — Always-on tabbed leaves (fork tab strip, activate + close)

| Field | Value |
|---|---|
| **Batch** | [Cockpit v3 Phase 1 — core shell](../plan-p1-cockpit-v3-shell-batch.md) |
| **Wave** | 1 (Lane A — after cv3c-01, same lane) |
| **Depends on** | cv3c-01 (renderer spine + `CockpitLeafView` + `useCockpitV3Layout`) |
| **Blocks** | cv3c-03, cv3c-04 |
| **Size** | **M** |
| **Model** | **Auto** |
| **Decision locks** | v3-DL-2, v3-DL-3, v3-DL-7, P0-DL-4, P1-DL-2, P1-DL-3 |

---

## Objective

Give **every** leaf an always-on tab strip and make tabs fully interactive without any mode:

- Fork `PaneTabStrip` → `PaneTabStripV3`, dropping the `useCustomizeMode` gate (tabs/affordances are always live, P1-DL-3) and dropping the drag wiring (DnD is Phase 2 — render plain tab buttons for now).
- Render `PaneTabStripV3` on **every** leaf — a single-pane leaf shows a one-tab strip (P1-DL-2). This replaces cv3c-01's placeholder leaf header.
- Wire **tab click → `setActiveTab`** (body swaps, siblings don't remount).
- Add a **close (×) button** per tab → removes that pane via the existing engine (no engine edits): multi-pane leaf → `extractFromTabsNode` + hide the pulled leaf; single-pane leaf → `setPaneHidden(true)`. Protect the last visible pane (→ no-op; cv3c-03 wires the empty-state).
- Keep the **overflow popover** beyond `VISIBLE_TAB_LIMIT`.

## Why this task

v3-DL-2 makes the cockpit uniform: there are no "panes" and "tab groups", only tabbed groups — a single pane is just a group with one tab. Doing this in Phase 1 (before DnD) means Phase 2's drag work drops onto a surface that already treats every leaf identically, and it kills the customize-mode dependency at the leaf level (P1-DL-3) so nothing downstream re-introduces it.

## Files

| File | Change |
|---|---|
| `frontend/components/patient-profile/v3/PaneTabStripV3.tsx` | **New** — fork of `PaneTabStrip` minus `useCustomizeMode`/`useDraggable`, **plus** a per-tab close (×) button. Keep markup, active styling, tooltips, `VISIBLE_TAB_LIMIT` + overflow popover. |
| `frontend/components/patient-profile/v3/CockpitLeafView.tsx` | **Edit** — replace the placeholder title header (cv3c-01) with `<PaneTabStripV3>`; wire `onActivateTab` / `onCloseTab`. |
| `frontend/lib/patient-profile/v3/useCockpitV3Layout.ts` | **Edit** — add `closeTab(groupId, paneId)` built from existing engine fns + `setPaneHidden`; expose alongside the cv3c-01 surface. |
| `frontend/components/patient-profile/v3/__tests__/PaneTabStripV3.test.tsx` | **New** — activate, close, overflow, single-tab, no customize import. |

> **Engine reuse (no edits):** removal uses `extractFromTabsNode` + `hideLeaf`/`setPaneHidden` — both exist (`layout-tree-mutations.ts` L195/L614). **Do not** add a new removal function and **do not** edit the engine (v3-DL-1). Import any engine fn via `foundation.ts` (P0-DL-4).

## Implementation sketch

### `PaneTabStripV3` — fork deltas from `PaneTabStrip`

Start by copying `PaneTabStrip.tsx`, then:

1. **Delete** the `useCustomizeMode` import and the `DraggableTab` wrapper. In Phase 1 tabs are plain buttons; Phase 2 (R-DND3) reintroduces drag — always-on, no customize gate. Drop `isTabDraggable` for now (re-added in Phase 2).
2. **Add** a close affordance. New prop `onCloseTab?: (paneId: string) => void`; when present, render a small `×` button inside each tab button (and in overflow rows). Guard: the strip never renders × in a way that can remove the last visible pane app-wide — that guard lives in the handler (cv3c canvas), the strip just calls `onCloseTab`.
3. **Keep** `groupId`, `paneIds`, `activeTabId`, `paneById`, `onActivateTab`, `onContextMenuTab?` (cv3c-03 uses it), `wrapTab?`, `className`, `VISIBLE_TAB_LIMIT`, the overflow popover, tooltips, and all ARIA (`role="tablist"` / `role="tab"` / `aria-selected` / `aria-controls`).

```tsx
export interface PaneTabStripV3Props {
  groupId: string;
  paneIds: string[];
  activeTabId: string;
  paneById: Record<string, PaneDefinition>;
  onActivateTab: (paneId: string) => void;
  onCloseTab?: (paneId: string) => void;        // NEW (v3)
  onContextMenuTab?: (paneId: string, e: React.MouseEvent) => void; // cv3c-03
  wrapTab?: (paneId: string, tab: React.ReactNode) => React.ReactNode;
  className?: string;
}
```

### `closeTab` handler (in `useCockpitV3Layout`)

```typescript
const closeTab = useCallback((groupId: string, paneId: string) => {
  const leaf = findLeaf(shell.paneTree, paneId);     // via foundation
  if (!leaf) return;
  const visibleCount = countVisibleLeaves(shell.paneTree); // helper or derive from paneState
  if (visibleCount <= 1) return;                     // protect last pane (empty-state = cv3c-03)
  if (leaf.paneIds.length > 1) {
    // multi-tab leaf: pull this pane out, then hide the extracted leaf
    const res = extractFromTabsNode(shell.paneTree, groupId, paneId);
    if (res.ok && res.tree) {
      shell.applyLayout({ version: LAYOUT_VERSION, paneTree: hideLeaf(res.tree, paneId) });
    }
  } else {
    shell.setPaneHidden(paneId, true);               // single-tab leaf → hook collapses
  }
}, [shell]);
```

> Confirm `extractFromTabsNode` / `findLeaf` exact signatures + leaf shape (`paneIds` / `activeTabId`) against the engine via `foundation.ts`. Match the kept shell's call sites for the argument order. The "hidden-bit" removal model (hide vs structural delete) is the same one the kept toggle bar uses — re-adding a hidden pane in cv3c-03 is just `setPaneHidden(false)` / `restoreLeaf`.

### `CockpitLeafView` (edit)

```tsx
function CockpitLeafView({ node, paneById, layout }: Props) {
  const activeId = node.activeTabId ?? node.paneIds[0];
  const pane = paneById.get(activeId);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneTabStripV3
        groupId={node.id}
        paneIds={node.paneIds}
        activeTabId={activeId}
        paneById={paneByIdRecord}
        onActivateTab={(id) => layout.setActiveTab(node.id, id)}
        onCloseTab={(id) => layout.closeTab(node.id, id)}
      />
      <div id={`pane-body-${activeId}`} className="min-h-0 flex-1 overflow-auto">
        {pane?.render()}
      </div>
    </div>
  );
}
```

## Tests (`PaneTabStripV3.test.tsx`)

- [x] **Single tab** → one tab renders; `aria-selected` true; body present.
- [x] **Activate** → clicking a non-active tab calls `onActivateTab(paneId)`.
- [x] **Close** → clicking × calls `onCloseTab(paneId)`.
- [x] **Overflow** → `paneIds.length > VISIBLE_TAB_LIMIT` → extras render in the overflow popover, still activatable + closable.
- [x] **No customize coupling** → `PaneTabStripV3` does not import `useCustomizeMode` / `customize-mode-context` (grep-style assertion or module-mock that throws if imported).
- [x] **Leaf integration** (in `CockpitGroupView.test.tsx` or here): activating tab 2 swaps the body to pane 2 without unmounting pane 1's *sibling leaves* (assert sibling DOM identity stable).

## Acceptance criteria

- [x] Every leaf (including single-pane) renders `PaneTabStripV3`.
- [x] Tab click switches the active body via `setActiveTab` (no sibling remount).
- [x] Close (×) removes a pane via existing engine fns (`extractFromTabsNode` + `hideLeaf` / `setPaneHidden`); last visible pane protected.
- [x] Overflow popover preserved beyond `VISIBLE_TAB_LIMIT`.
- [x] **No** `useCustomizeMode` / `customize-mode-context` import anywhere in `v3/` (P1-DL-3).
- [x] Engine imported via `foundation.ts`; **no edit** to `layout-tree-mutations.ts` or `types.ts` (v3-DL-1).
- [x] Caps respected — closing never violates invariants; reopening (cv3c-03) re-shows.
- [x] `npx tsc --noEmit` + `npm run lint` clean; both v3 test files green.
- [x] Flag off → unchanged.

## Out of scope (explicit)

- Tab **drag** (reorder / move / tab-merge by pointer) → Phase 2 (R-DND3). Phase 1 tabs are plain buttons.
- Palette add / blank default / empty-state / context menu → cv3c-03.
- `isTabDraggable` (live-consult drag lock) → re-added in Phase 2 when drag returns.

## Decision log

- **Fork, don't parametrize `PaneTabStrip`:** adding a `customizeMode?: boolean` escape hatch to the shared component keeps the old coupling alive and risks the flag-off path. A clean v3 fork (P1-DL-3) lets the old strip die untouched at Phase 4 cutover.
- **Close = hide (reuse), not a new engine fn:** the engine's existing hide/extract + the hook's `setPaneHidden` already express removal; re-adding from the palette (cv3c-03) is the inverse. Zero engine edits keeps v3-DL-1 intact.
- **Drag deferred to Phase 2:** rendering inert plain tabs now (no dnd-kit in cv3c-02) keeps this task small and keeps DnD concerns in one place (R-DND3).

## References

- [`frontend/components/patient-profile/PaneTabStrip.tsx`](../../../../../../frontend/components/patient-profile/PaneTabStrip.tsx) — fork source (props at L51, overflow at L95, customize gate at L33/37 to remove).
- [`frontend/lib/patient-profile/layout-tree-mutations.ts`](../../../../../../frontend/lib/patient-profile/layout-tree-mutations.ts) — `extractFromTabsNode` (L614), `hideLeaf` (L195), `findLeaf` (L54); reuse via `foundation.ts`.
- [`frontend/lib/patient-profile/useShellLayout.ts`](../../../../../../frontend/lib/patient-profile/useShellLayout.ts) — `setActiveTab` / `setPaneHidden` / `applyLayout`.
- cv3c-01: [`task-cv3c-01-recursive-editor-group-renderer.md`](./task-cv3c-01-recursive-editor-group-renderer.md) — the `CockpitLeafView` + `useCockpitV3Layout` this task edits.
- Batch: [`plan-p1-cockpit-v3-shell-batch.md`](../plan-p1-cockpit-v3-shell-batch.md) · Order: [`EXECUTION-ORDER-p1-cockpit-v3-shell.md`](./EXECUTION-ORDER-p1-cockpit-v3-shell.md).

---

**Status:** `Done` (2026-05-31).  
**Done when:** acceptance criteria checked; status stamped here.
