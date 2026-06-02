# cpfd-04 · Tab drag source — drag a tab out of its strip onto a zone

> **Wave 2, step 2** of [p2-cockpit-pane-freedom-dnd](../plan-p2-cockpit-pane-freedom-dnd-batch.md). The last drag source — makes individual tabs draggable so a tab can be dropped onto another container's zone (tab-into / split) or pulled out into a new split.

| **Size** | S | **Model** | Auto | **Wave** | 2 | **Depends on** | cpfd-03 (drop routing + `handleDragEnd`) | **Blocks** | cpfd-05 (smoke) |

---

## Why this task

cpfd-03 made the pane-header grip a drag source. But a tabbed container has no per-pane header — the tab strip replaces it (DL-6). To re-home a pane that lives as a tab, the doctor must be able to grab the **tab** itself. This realises the vision's "drag tab strip header out → extract to new split": a tab dropped on any edge zone calls `dropPaneIntoZone` with an edge (which creates the sibling split), and a tab dropped on another container's center tabs it in.

The data contract is identical to the header grip — `useDraggable({ data: { paneId } })` — so cpfd-03's `handleDragEnd` already handles a tab-sourced drag with zero changes. This task only adds the draggable affordance to the tab buttons.

---

## What to do

### 1. Make each tab a drag source in `frontend/components/patient-profile/PaneTabStrip.tsx`

The strip renders one `<button role="tab">` per visible pane id (and overflow items in a dropdown). Wrap each visible tab button as a `useDraggable` source. The cleanest path that doesn't fight the existing `onClick` / `onContextMenu` / `wrapTab` is a small inner component so each tab gets its own hook:

```tsx
import { useDraggable } from "@dnd-kit/core";

function DraggableTab({
  paneId,
  draggable,
  children,
}: {
  paneId: string;
  draggable: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tab-drag-${paneId}`,
    data: { paneId },
    disabled: !draggable,
  });
  return (
    <span
      ref={setNodeRef}
      className={cn("inline-flex", isDragging && "opacity-40")}
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
    >
      {children}
    </span>
  );
}
```

Then wrap the rendered `tabElement` for each visible tab:

```tsx
const wrapped = <DraggableTab paneId={paneId} draggable={isTabDraggable(paneId)}>{tabElement}</DraggableTab>;
// then feed `wrapped` to the existing wrapTab(paneId, wrapped) path (or render directly when no wrapTab).
```

Add an optional prop to gate draggability (so `body`-as-a-tab during a live consult can't drag — DL-8):

```ts
export interface PaneTabStripProps {
  // ...existing props...
  /** cpfd-04 — false → that tab cannot be dragged (e.g. body during a live consult). Defaults to draggable. */
  isTabDraggable?: (paneId: string) => boolean;
}
```

Default `isTabDraggable` to `() => true` when not provided.

### 2. Reconcile drag vs click vs context-menu on a tab

- **Click to activate** must still work. The `<DndContext>` `PointerSensor` already has `activationConstraint: { distance: 8 }` (cpfd-03 / existing), so a click that doesn't move 8px fires `onClick`; a drag that crosses 8px starts the drag instead. Verify the tab's `onClick={() => onActivateTab(paneId)}` still fires on a plain click.
- **Right-click context menu** (the `wrapTab` `<PaneContextMenu>` from cpf-04) must still open. `useDraggable` listeners are pointer-based; `onContextMenu` is unaffected. Keep the existing `onContextMenuTab` / `wrapTab` wiring; the `DraggableTab` span sits inside/around it without stealing the context-menu event.
- **Spread order:** apply the draggable `listeners` to the wrapper span, not the `<button>`, so the button keeps its own click semantics and ARIA.

### 3. Pass `isTabDraggable` from the renderer (`Shell.tsx`)

In the multi-pane leaf branch where `<PaneTabStrip>` is rendered (around line 1084), pass:

```tsx
isTabDraggable={(paneId) =>
  paneMoveUx?.canDropSource?.(paneId, /* any target */ node.id) ?? true
}
```

Reuse `canDropSource` (cpfd-03) — for `body` during live it returns false, which is exactly the per-tab guard we want. (The predicate's target arg is irrelevant for the source-side check; pass the leaf id.)

### 4. Tests in `frontend/components/patient-profile/__tests__/PaneTabStrip.test.tsx`

Add to the existing suite:

```ts
describe("<PaneTabStrip> draggable tabs (cpfd-04)", () => {
  it("each visible tab is wrapped in a draggable with id `tab-drag-<paneId>` and data { paneId }");
  it("a plain click still calls onActivateTab (does not start a drag)");
  it("right-click still fires onContextMenuTab");
  it("isTabDraggable(paneId) === false disables that tab's draggable");
  it("defaults every tab to draggable when isTabDraggable is not provided");
});
```

> These need a `<DndContext>` wrapper (the `useDraggable` hook requires it). Add a tiny test helper that wraps the strip in `<DndContext>`. Keep assertions on the data contract (`id`, `data.paneId`, `disabled`) + the click/context-menu coexistence.

### 5. Verify

```powershell
cd frontend
npx tsc --noEmit
npm test components/patient-profile/__tests__/PaneTabStrip.test.tsx
```

---

## Acceptance gate

- [x] Each visible tab in `<PaneTabStrip>` is a `useDraggable` source keyed `tab-drag-<paneId>` with `data: { paneId }`.
- [x] Dragging a tab onto a container zone routes through cpfd-03's `handleDragEnd` unchanged (center = tab-into, edge = split / extract).
- [x] A plain click still activates the tab; right-click still opens the per-tab context menu; the 8px activation distance separates click from drag.
- [x] `isTabDraggable(paneId)` gates draggability; `body` cannot be dragged as a tab during `state === "live"` (DL-8), via `canDropSource`.
- [x] `isTabDraggable` defaults to draggable when omitted (unit-test mounts without the page).
- [x] Overflow-dropdown tabs are unaffected (they remain click-to-activate; dragging from the overflow popover is out of scope).
- [x] New tests green; existing `<PaneTabStrip>` tests (cpf-03) still green; `cd frontend; npx tsc --noEmit` clean.

---

## Anti-goals

- ❌ Don't reorder tabs WITHIN a strip by dragging — Phase 3 polish (sortable strip). This task only makes a tab a drag source for cross-container drops + extraction.
- ❌ Don't change the drop side — cpfd-03 already routes a tab-sourced drag (same `{ paneId }` data contract).
- ❌ Don't make the overflow-dropdown items draggable — keep them click-only.
- ❌ Don't put the draggable listeners on the `<button>` itself — wrap it, so click + ARIA stay intact.
- ❌ Don't add a separate telemetry event — cpfd-03's `cockpit_pane_freedom.drag_drop` covers tab-sourced drops too.

---

## Risks (executor-facing)

- **Click vs drag on the same element.** This is the classic dnd-kit footgun. The `PointerSensor` `activationConstraint: { distance: 8 }` is what makes both work; confirm it's set on the shared `<DndContext>` (it already is in `DesktopShell`). If clicks feel "sticky", the listeners are on the wrong node — move them to the wrapper span.
- **`wrapTab` interaction (cpf-04).** Tabs are already wrapped by `<PaneContextMenu>` via the `wrapTab` render prop. Nest carefully: `DraggableTab` (drag) > `PaneContextMenu` (right-click) > `tabElement` (click), or place the draggable span inside the context-menu trigger. Verify all three gestures coexist in the smoke test.
- **`isDragging` opacity vs the active tab style.** The active tab already has a distinct background; the `opacity-40` while dragging should read clearly on top of it. Tune if the dragged active tab looks invisible.
- **Activation distance shared with header grip.** Both the grip and tabs share the one `PointerSensor`. 8px suits both; don't add a second sensor with a different constraint.
