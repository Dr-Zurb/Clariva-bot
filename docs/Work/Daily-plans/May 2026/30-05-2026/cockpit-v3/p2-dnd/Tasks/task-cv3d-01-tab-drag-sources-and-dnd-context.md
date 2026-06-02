# cv3d-01 — Tab drag sources + single `<DndContext>` + drag preview + live-consult guard

| Field | Value |
|---|---|
| **Batch** | [Cockpit v3 Phase 2 — interaction](../plan-p2-cockpit-v3-dnd-batch.md) |
| **Wave** | 1 (Lane A — first, alone) |
| **Depends on** | Phase 1 (cv3c-01..04 — renderer, `PaneTabStripV3`, `useCockpitV3Layout`) |
| **Blocks** | cv3d-02, cv3d-03, cv3d-04 |
| **Size** | **M** |
| **Model** | **Auto** |
| **Decision locks** | v3-DL-3, v3-DL-6, v3-DL-8, P0-DL-4, P2-DL-3, P2-DL-4 |

---

## Objective

Stand up the drag *source* + *context* half of v3 DnD — no drop targets, no commit yet:

1. **Tabs are drag sources.** Re-add `useDraggable` to each `PaneTabStripV3` tab (cv3c-02 removed the drag wiring and left an explicit Phase 2 note), carrying `data: { paneId, groupId }`. A plain click still activates the tab; a drag begins only past the 8px activation distance.
2. **One `<DndContext>` at the v3 shell root.** Mount a single `<DndContext>` (PointerSensor, `activationConstraint: { distance: 8 }`, `collisionDetection={pointerWithin}`) wrapping the desktop canvas, plus a `<DragOverlay dropAnimation={null}>` that shows the dragged pane's icon + title (P2-DL-3).
3. **Live-consult guard, reused not reinvented.** Thread the `body`-during-`live` guard from `PatientProfilePage` into `CockpitV3Shell` so the `body` tab's draggable is `disabled` during a live consult (v3-DL-6). Do **not** author a second guard — reuse the page's existing `canDropSource` / a `consultActive` flag.
4. **Desktop only.** Mobile (`<lg`) renders no context and no drag sources (v3-DL-8).

This task makes a tab *pick-up-able*. cv3d-02 adds the targets + preview; cv3d-03 commits the drop. Dropping anywhere in this task is a no-op.

## Why this task

Establishing the single-context + drag-source contract first means cv3d-02's overlay and cv3d-03's routing have a stable, already-guarded thing to react to. Keeping it source-only (no targets) keeps the task small and isolates the 8px click-vs-drag tuning + the guard threading from the geometry work. Re-adding drag here (rather than in cv3c-02) was a deliberate Phase 1 deferral so all DnD concerns live in Phase 2.

## Files

| File | Change |
|---|---|
| `frontend/components/patient-profile/v3/PaneTabStripV3.tsx` | **Edit** — wrap each visible tab button (and overflow rows) in a `useDraggable` source `{ paneId, groupId }`; add a new `isTabDraggable?(paneId): boolean` prop (default true) so the leaf can disable the `body` tab during a live consult. Keep click/activate, close (×), context-menu, overflow, ARIA. |
| `frontend/components/patient-profile/v3/CockpitDndContext.tsx` | **New** — the single `<DndContext>` wrapper: PointerSensor (8px), `pointerWithin`, `onDragStart`/`onDragEnd` (end is a no-op stub here; cv3d-03 fills it), and the `<DragOverlay>` rendering the active pane chip (icon + title). Tracks `activeDragPaneId` in state and exposes it via context/prop for the overlay (cv3d-02). |
| `frontend/components/patient-profile/v3/CockpitV3Shell.tsx` | **Edit** — wrap the desktop canvas in `<CockpitDndContext>`; accept + forward a `consultActive` (or `canDragPane`) prop into the canvas/leaf so the `body` guard reaches the tab strip. Docks stay `shrink-0` siblings **outside** the context (v3-DL-6). Mobile branch unchanged (no context). |
| `frontend/components/patient-profile/v3/CockpitCanvas.tsx` | **Edit (thin)** — thread `canDragPane` down to `CockpitGroupView` → `CockpitLeafView` → `PaneTabStripV3`'s `isTabDraggable`. |
| `frontend/components/patient-profile/v3/CockpitLeafView.tsx` | **Edit (thin)** — pass `isTabDraggable={(id) => canDragPane(id)}` to `PaneTabStripV3`. |
| `frontend/components/patient-profile/PatientProfilePage.tsx` | **Edit (additive, flag-gated)** — pass the live-consult guard into `<CockpitV3Shell>` (e.g. `consultActive={state === "live"}` or reuse `canDropSource`). Only the v3 branch (~L1126) changes; the flag-off `<PatientProfileShell>` branch is untouched. |
| `frontend/components/patient-profile/v3/__tests__/PaneTabStripV3.dnd.test.tsx` | **New** — drag-source presence, click-vs-drag, `isTabDraggable=false` disables the source, no customize import. |

> **Import discipline (P0-DL-4):** `@dnd-kit/core` for `DndContext` / `DragOverlay` / `useDraggable` / `useSensor` / `PointerSensor` / `pointerWithin`. Model/engine/types via `foundation.ts`. **No** import of the old `Shell.tsx` / `PaneDropOverlay` / `customize-mode-context`.

## Implementation sketch

### `PaneTabStripV3` — re-add the draggable

```tsx
// New prop:
isTabDraggable?: (paneId: string) => boolean; // default () => true

// Wrap each tab button (replaces cv3c-02's plain button) — keep onClick/onContextMenu/close.
function DraggableTab({ paneId, groupId, draggable, children }: {...}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `cockpit-v3-tab-${groupId}-${paneId}`,
    data: { paneId, groupId },
    disabled: !draggable,
  });
  return (
    <span
      ref={setNodeRef}
      className={cn("inline-flex", isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
    >
      {children}
    </span>
  );
}
```

- **Click vs drag:** the 8px `activationConstraint` (on the sensor in `CockpitDndContext`) means a click fires `onActivateTab` and a >8px pointer move starts a drag. Keep the existing `onClick`; do not `preventDefault` it.
- **Close + context menu unaffected:** the `×` button `stopPropagation`s already (cv3c-02); right-click still opens `onContextMenuTab`. Verify drag listeners don't swallow these.
- **`isTabDraggable`:** when it returns false for a pane, pass `disabled: true` to that tab's `useDraggable` (the `body` tab during a live consult).

### `CockpitDndContext` — the single context + preview

```tsx
"use client";
export default function CockpitDndContext({
  paneById,
  onDragEnd,            // cv3d-03 passes the real router; default no-op here
  children,
}: Props) {
  const [activeDragPaneId, setActiveDragPaneId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(e) => setActiveDragPaneId((e.active.data.current?.paneId as string) ?? null)}
      onDragEnd={(e) => { setActiveDragPaneId(null); onDragEnd?.(e); }}
      onDragCancel={() => setActiveDragPaneId(null)}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {activeDragPaneId && paneById[activeDragPaneId] ? (
          <div className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs font-medium shadow-md">
            {/* icon + title — mirror Shell.tsx's overlay chip */}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
```

> Mirror `Shell.tsx`'s sensor + overlay chip (~L606–767) but re-author cleanly — no `customizeMode`. Expose `activeDragPaneId` to the overlay (cv3d-02) via a small context or a render-prop; cv3d-02 needs it to know a drag is in progress.

### `CockpitV3Shell` — wrap the canvas, keep docks outside

```tsx
{safetyDock ? <div className="shrink-0">{safetyDock}</div> : null}
<CockpitPalette … className="shrink-0" />
<CockpitDndContext paneById={paneByIdRecord}>
  <div className="min-h-0 flex-1">
    <CockpitCanvas panes={panes} layout={layout} canDragPane={canDragPane} />
  </div>
</CockpitDndContext>
{actionDock ? <div className="shrink-0">{actionDock}</div> : null}
```

- **`canDragPane`:** derive from the new `consultActive` prop — `(paneId) => !(paneId === "body" && consultActive)`. (Resolve the source pane id the same way the page does for the body/active tab; the strip passes the tab's own `paneId`, which for the body leaf is `"body"`.)
- **Docks outside the context** (v3-DL-6 / P1-DL-6): they must never be drag sources or droppables.

### Page wiring (additive, flag-gated)

```tsx
// PatientProfilePage.tsx — only the v3 branch (~L1126):
<CockpitV3Shell
  panes={panes}
  storageKey={storageKey}
  consultActive={state === "live"}   // NEW — reuse the existing CockpitState
  safetyDock={<SafetyStickyStrip appointmentId={appt.id} />}
  actionDock={<PlanActionFooter … />}
/>
```

> The page already computes `state === "live"` (`isConsultActive`) and uses it in `canDropSource` / `computeMoveDisabled`. Pass that same signal; do not duplicate the guard logic in v3.

## Tests (`PaneTabStripV3.dnd.test.tsx`)

Follow the `@dnd-kit/core` mock pattern from the kept `Shell-dnd.test.tsx` if the real sensors fight jsdom.

- [x] **Drag source present** → each tab renders with draggable attributes/listeners; `data` = `{ paneId, groupId }`.
- [x] **Click still activates** → a click (no pointer move) calls `onActivateTab`, not a drag.
- [x] **Guard disables source** → `isTabDraggable=(id)=>id!=="body"` (or `consultActive`) → the `body` tab's draggable is `disabled`.
- [x] **Close + context menu intact** → `×` still calls `onCloseTab`; right-click still calls `onContextMenuTab`; drag listeners don't swallow them.
- [x] **Overlay chip** → during an active drag (mock `active`), `<DragOverlay>` renders the dragged pane's title.
- [x] **No customize coupling** → no `useCustomizeMode` / `customize-mode-context` import.

## Acceptance criteria

- [x] Every `PaneTabStripV3` tab is a `useDraggable` source `{ paneId, groupId }`; click vs drag separated by 8px (v3-DL-3 / P2-DL-4).
- [x] Exactly one `<DndContext>` (PointerSensor 8px, `pointerWithin`) wraps the desktop canvas; `<DragOverlay>` shows the dragged pane chip (P2-DL-3).
- [x] `body` tab not draggable during a live consult; guard reuses the page signal (no second guard) (v3-DL-6).
- [x] Dropping is a **no-op** (targets + commit are cv3d-02/03); no console errors on drop.
- [x] Mobile (`<lg`) renders no context / no drag sources (v3-DL-8).
- [x] No import of `Shell.tsx` / `PaneDropOverlay` / `customize-mode-context` in any `v3/` file (P0-DL-4).
- [x] Flag off → byte-identical to today; the page's v3 branch is the only diff and it's gated.
- [x] `npx tsc --noEmit` + `npm run lint` clean; the new dnd test green.

## Out of scope (explicit)

- Drop targets / the Cursor-style preview / pointer geometry → cv3d-02.
- Commit on drop / caps toast / telemetry / within-strip reorder → cv3d-03.
- Deleting the old `PaneDropOverlay` → Phase 4 (v3 just never imports it).

## Decision log

- **Source-only first:** isolating drag pickup + the guard from geometry keeps the 8px click-vs-drag tuning reviewable on its own and gives cv3d-02/03 a stable contract (`{ paneId, groupId }` on `active.data`).
- **Reuse the page guard:** the `body`-during-`live` rule already lives on the page (`canDropSource` / `computeMoveDisabled`); threading `consultActive` keeps one source of truth (v3-DL-6) instead of a v3-local copy that could drift.
- **New `CockpitDndContext` component, not inline in the shell:** a dedicated wrapper keeps `CockpitV3Shell` readable and gives cv3d-02 a clean place to read `activeDragPaneId`; it also keeps the single-context invariant (P2-DL-3) obvious.

## References

- [`frontend/components/patient-profile/v3/PaneTabStripV3.tsx`](../../../../../../frontend/components/patient-profile/v3/PaneTabStripV3.tsx) — tabs (cv3c-02 left the "Phase 2 re-adds drag" note; `data-pane-tab-id` hooks).
- [`frontend/components/patient-profile/Shell.tsx`](../../../../../../frontend/components/patient-profile/Shell.tsx) — sensor + `<DragOverlay>` reference (~L606–767); `ShellPaneHeader` draggable (~L296–335). Re-author, don't copy.
- [`frontend/components/patient-profile/v3/CockpitV3Shell.tsx`](../../../../../../frontend/components/patient-profile/v3/CockpitV3Shell.tsx) — where the context mounts; docks stay outside.
- [`frontend/components/patient-profile/PatientProfilePage.tsx`](../../../../../../frontend/components/patient-profile/PatientProfilePage.tsx) — `state === "live"` / `canDropSource` (~L717) + the v3 flag branch (~L1126).
- [`frontend/lib/patient-profile/v3/foundation.ts`](../../../../../../frontend/lib/patient-profile/v3/foundation.ts) — model/engine/types door.
- Batch: [`plan-p2-cockpit-v3-dnd-batch.md`](../plan-p2-cockpit-v3-dnd-batch.md) · Order: [`EXECUTION-ORDER-p2-cockpit-v3-dnd.md`](./EXECUTION-ORDER-p2-cockpit-v3-dnd.md).

---

**Status:** `Done` (2026-05-31).  
**Done when:** acceptance criteria checked; status stamped here.
