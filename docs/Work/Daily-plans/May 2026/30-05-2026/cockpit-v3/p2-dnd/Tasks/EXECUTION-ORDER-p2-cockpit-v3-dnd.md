# Execution order — Cockpit v3 Phase 2 (interaction: Cursor-style drag-and-drop)

> Batch: [`plan-p2-cockpit-v3-dnd-batch.md`](../plan-p2-cockpit-v3-dnd-batch.md) · Product plan: [`plan-cockpit-v3.md`](../../../../../../Product%20plans/plan-cockpit-v3.md)
>
> **3 waves, 4 tasks.** This is the interaction layer — but behind the Phase 0 flag, reusing the kept engine (`dropPaneIntoZone`) and the Phase 1 `movePane` method. Net new code is one pure geometry helper + one translucent overlay + drag wiring. Read this file top-to-bottom before starting; it is the contract for *order*, the task files are the contract for *content*.

---

## TL;DR for the executor

1. **cv3d-01 first, alone.** Make every `PaneTabStripV3` tab a `useDraggable` source, mount one `<DndContext>` + `<DragOverlay>` in the v3 shell, and thread the `body`-during-`live` guard from the page. No drop targets yet — dropping does nothing until cv3d-02/03.
2. **cv3d-02 next.** The heart of R-DND3: the pure `resolveDropZoneFromPointer` geometry (truth-tabled) + the `CockpitDropOverlay` (one translucent half/quadrant preview + tab-bar `center`) mounted per leaf group. Exposes the resolved zone as `over` data; **no commit yet**.
3. **cv3d-03 after the overlay resolves a zone.** Wire `handleDragEnd` → `layout.movePane`, the caps toast, the guard refusal, within-strip reorder (V3-Q2), and the one telemetry event.
4. **cv3d-04 last.** Integration, truth-table parity, accidental-drag/mobile/flag checks, the Phase 2 gate, and tests.
5. **Flag stays OFF in committed config.** Verify flag-off parity at the start of cv3d-01 and again in cv3d-04. Turn the flag on only locally to dogfood.

---

## Wave / lane matrix

| Wave | Task | Title | Depends on | Lane | Size | Model |
|---|---|---|---|---|---|---|
| **1** | **cv3d-01** | Tab drag sources + single `<DndContext>` + drag preview + live-consult guard | Phase 1 (cv3c-01..04) | Lane A | **M** | **Auto** |
| **2** | **cv3d-02** | Cursor-style drop overlay + pointer-geometry zone resolver (truth-tabled) | cv3d-01 | Lane A | **M–L** | **Auto** (optional Opus close-gate) |
| **2** | **cv3d-03** | Drop routing + guards + caps toast + within-strip reorder + telemetry | cv3d-02 | Lane A (serial) | **M** | **Auto** |
| **3** | **cv3d-04** | Integration + truth-table parity + mobile + Phase 2 gate + tests | cv3d-01..03 | Lane A | **M** | **Auto** (optional light review) |

> **There is only one honest lane.** All four tasks converge on the v3 DnD surface (`PaneTabStripV3` / `CockpitGroupView` / `CockpitLeafView` / the new overlay / `useCockpitV3Layout`), so they serialise. This is by design ([`EXECUTION-ORDER-GUIDELINES.md`](../../../../../EXECUTION-ORDER-GUIDELINES.md): do not invent parallel lanes that fight over the same files). The waves exist to create clean review/commit checkpoints, not parallelism.

---

## Critical path

```
Phase 1 (renderer + tabs + palette + movePane)
        │
        ▼
   cv3d-01  ── tabs draggable + one DndContext + DragOverlay + body/live guard
        │
        ▼
   cv3d-02  ── resolveDropZoneFromPointer (truth-tabled) + CockpitDropOverlay (one preview)
        │
        ▼
   cv3d-03  ── handleDragEnd → movePane + caps toast + guard + within-strip reorder + telemetry
        │
        ▼
   cv3d-04  ── integrate + parity + accidental-drag/mobile/flag + Phase 2 GATE + tests
        │
        ▼
   Phase 2 closed → promote Phase 3 (R-CHROME3, R-PERSIST3, R-MOBILE3) to its own batch
```

Single chain. The leverage is **cv3d-02**: a sound pointer→zone function and a single clean preview make cv3d-03 a thin commit layer; a shaky geometry makes the whole interaction feel wrong. Spend the care there (and the optional Opus close-gate).

---

## Wave detail

### Wave 1 — the DnD spine (cv3d-01, alone)

**Goal:** a tab you can pick up and a context that tracks the drag — no targets, no commit yet.

- **cv3d-01 — Tab drag sources + context + preview + guard.** Re-add `useDraggable({ id, data: { paneId, groupId } })` to each `PaneTabStripV3` tab (cv3c-02 deliberately removed it and left a Phase 2 note). Mount exactly one `<DndContext>` (PointerSensor, `activationConstraint: { distance: 8 }`, `collisionDetection={pointerWithin}`) + `<DragOverlay dropAnimation={null}>` (dragged pane's icon + title) in `CockpitV3Shell`/`CockpitCanvas` (desktop only). Thread the `body`-during-`live` guard from the page (reuse `canDropSource` / a `consultActive` flag — **do not invent a second guard**) so the `body` tab's draggable is `disabled` during a live consult. **Gate:** a tab lifts on drag past 8px; a plain click still activates; `<DragOverlay>` shows the pane chip; dropping anywhere is a no-op (targets are cv3d-02); flag-off byte-identical; mobile renders no context.

**Why alone:** it establishes the single context + drag-source contract every later task consumes; small and contained.

### Wave 2 — the Cursor-style interaction (cv3d-02 → cv3d-03, sequential)

**Goal:** one translucent preview that resolves a zone, then commits the drop through the kept engine.

- **cv3d-02 — Drop overlay + geometry.** New pure `resolveDropZoneFromPointer(rect, point)` → `DropZone` (`west`/`east`/`north`/`south`/`center`) with documented thresholds + deterministic ties, fully unit-tested (truth table) *before* wiring. New `CockpitDropOverlay`: one `useDroppable` per leaf group whose `data` carries `{ groupId }`; on hover it renders **exactly one** translucent region (the half/quadrant under the cursor) + a tab-bar highlight when the pointer is over the tab strip (→ `center`). Mount it inside `CockpitLeafView` (over the body) and make `PaneTabStripV3` a `center` droppable. **No commit** — the overlay only computes + paints the zone and surfaces it via `over`/local state. **Gate:** exactly one preview at a time; left/right halves, top/bottom halves, and tab-bar all resolve to the right `DropZone`; no five-box dashed overlay; old `PaneDropOverlay` not imported.

- **cv3d-03 — Routing + guards + reorder + telemetry.** A `handleDragEnd` (in the shell, re-authored from `Shell.tsx`'s `routePaneDropFromDragEnd`) reads the active `{ paneId }` + the resolved `{ groupId, zone }` and calls `layout.movePane(sourcePaneId, groupId, zone)`, wrapping the result in `toastOnCapRejection`. Refuse guarded drops (`body` + `live`) silently (toast already shown by the guard) and fire **no** telemetry. Add within-strip reorder (V3-Q2): a tab dragged over another tab in the **same** group reorders via the kept `moveLeafBetweenTabs` (use `@dnd-kit/sortable` within the strip *or* an index swap on drop — choose the lighter integration). Add one telemetry event (`trackCockpitV3DragDrop` in `telemetry.ts`) on **successful** drops only. **Gate:** half→column, half→row, bar→tab match `dropPaneIntoZone`; caps toast; guard refuses; within-strip reorder works; telemetry fires once per successful drop, never on no-op/guarded/capped.

**Why sequential:** cv3d-03 consumes cv3d-02's resolved-zone `over` data and both edit the v3 DnD surface.

### Wave 3 — close the phase (cv3d-04)

**Goal:** prove the Phase 2 gate and lock parity.

- **cv3d-04 — Integration + parity + mobile + gate + tests.** End-to-end drag-build-up (split via half, tab via bar, reorder within strip) persists across reload (rides `useShellLayout`). Flag-off re-verified byte-identical. Accidental micro-drags (< 8px) do not reparent. Docks anchored in every arrangement; footer sends. Mobile flat, no overlay/sources. Tests: geometry truth table (import from cv3d-02), drag-source render, drop routing → `movePane` calls, within-strip reorder, guard refusal, flag on/off mount, no-op/cap no-fire. Inbox line. **Gate:** the cross-cutting acceptance gate in the batch plan is fully green.

---

## Model-selection rationale

Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

- **cv3d-01 — Auto (M).** Re-adding a `useDraggable` + mounting an existing dnd-kit scaffold + threading a guard. Mechanical, bounded; the old `Shell.tsx` is the reference.
- **cv3d-02 — Auto (M–L).** A pure geometry helper + a presentational overlay owning one `useDroppable`. Largest surface, but the only *logic* is `resolveDropZoneFromPointer`, which is unit-testable in isolation. **Optional Opus close-gate** (recommended-light): confirm every region × aspect-ratio resolves to the intended zone and ties are deterministic. Not consult-critical — a wrong zone splits the wrong way but the engine still yields a valid tree (no state corruption), and the whole path is flag-gated off.
- **cv3d-03 — Auto (M).** Routing one event into an existing method (`movePane`) + a caps toast + reorder + one telemetry call. Each piece is a one-liner against kept code.
- **cv3d-04 — Auto (M).** Integration + tests. Optional light review of accidental-drag / guard parity. No PHI, no security, no migration.

**No Opus build tasks. No Composer tasks** (the multi-file work is interdependent interaction on a shared surface, better kept coherent under Auto).

---

## Optional close-gate review turn

**Recommended after cv3d-02 (end of the geometry build).** `resolveDropZoneFromPointer` is the only new judgement surface in the batch. Budget ~1 Opus chat / ~8k tokens focused on:

1. **Region coverage** — every (x, y) within the group rect maps to exactly one `DropZone`; no dead pixels, no overlaps.
2. **Tab-bar precedence** — a pointer over the tab strip always resolves to `center`, regardless of the half/quadrant math below it.
3. **Threshold sanity** — the half/quadrant thresholds feel right at 16:9, 4:3, and tall narrow panels (the dogfood monitors: 1366 / 1920 / 2560 px wide).
4. **Determinism** — exact-midline and corner ties resolve the same way every time (documented tie-break).

Skip if cv3d-02's truth table covers these explicitly with no skipped/`xit`'d rows.

---

## Global anti-goals (apply to every task)

- ❌ Do **not** edit `layout-tree.ts`, `layout-tree-mutations.ts`, `types.ts`, `panes/*`, or any migration. The model + engine + bodies are reused as-is (v3-DL-1).
- ❌ Do **not** add a new layout-mutation method — drops call the existing `movePane` / `moveLeafBetweenTabs` (P2-DL-1).
- ❌ Do **not** import the old `PaneDropOverlay`, `Shell.tsx`, `customize-mode-context`, or `CustomizeBar` from any `v3/` file (P0-DL-4 / P2-DL-2).
- ❌ Do **not** import kept model/engine directly — go through `foundation.ts` (P0-DL-4). (Telemetry is a kept non-engine module; import it directly.)
- ❌ Do **not** render five dashed zone boxes — exactly one translucent preview (v3-DL-4 / P2-DL-2).
- ❌ Do **not** introduce a second `<DndContext>` — there is exactly one, at the desktop v3 shell root (P2-DL-3).
- ❌ Do **not** gate drag behind a customize mode or a grip — dragging is always on (v3-DL-3 / P2-DL-4).
- ❌ Do **not** invent a second live-consult guard — reuse the page's `canDropSource` / `computeMoveDisabled` (v3-DL-6).
- ❌ Do **not** ship a keyboard-DnD sensor — the context menu is the no-pointer path (P2-DL-5).
- ❌ Do **not** render the overlay or any drag source on mobile (`<lg`) (v3-DL-8).
- ❌ Do **not** flip `NEXT_PUBLIC_COCKPIT_V3` on in committed `.env*`. Local dogfooding only.

## Global definition of done (every task)

- [ ] `cd frontend; npx tsc --noEmit` clean.
- [ ] `cd frontend; npm run lint` clean (warnings ok).
- [ ] Task's own v3 test suite green (targeted — full `npm test` may hang on the pre-existing inbox issue).
- [ ] Flag-off path unchanged (spot-check at cv3d-01 and cv3d-04).
- [ ] Task file's checklist ticked + a one-line status stamp at the bottom.

---

## Notes for the executor

- **Read [`foundation.ts`](../../../../../../frontend/lib/patient-profile/v3/foundation.ts) first.** It already re-exports `dropPaneIntoZone`, `moveLeafBetweenTabs`, `resolveMoveSourcePaneId`, `DropZone`, and the caps. If something you need isn't re-exported, add it there (with a one-line note) rather than importing the source module directly.
- **`movePane` already exists.** `useCockpitV3Layout.movePane(paneId, targetGroupId, zone)` calls `dropPaneIntoZone` and commits + returns `{ ok, reason }`. cv3d-03's `handleDragEnd` is essentially one call to it wrapped in `toastOnCapRejection`. Do not rebuild the mutation.
- **`Shell.tsx` is a reference, not a copy source.** Read its `<DndContext>` / `PointerSensor` (8px) / `routePaneDropFromDragEnd` / `<DragOverlay>` (~L606–767) to match behaviour, but re-author cleanly into the v3 surface — and **replace** its 5-zone `PaneDropOverlay` with the single Cursor-style preview. Do not paste its `customizeMode` / grip branches.
- **Reuse the page guard.** `PatientProfilePage` already has `canDropSource` / `canTabInto` / `computeMoveDisabled` (`body` + `live`). Thread the needed piece into `CockpitV3Shell` (an additive, flag-gated prop) — do not author a second guard.
- **Geometry before pixels.** Write `resolveDropZoneFromPointer` + its truth table first (cv3d-02), like the pane-freedom DnD batch wrote `dropPaneIntoZone`'s truth table before wiring. The preview just paints what the function returns.
- **Tab-bar is `center`.** The tab strip is a first-class droppable resolving to `center` (add-as-tab) — no dashed center box. The body region resolves to the half/quadrant.
- **Telemetry pattern from cpf/cpfd.** One event per *successful* drop; payload `{ sourcePaneId, targetGroupId, zone }`. Don't fire on no-op / guarded / capped / failed drops. Telemetry imports directly from `@/lib/patient-profile/telemetry` (it is kept, not the old shell).
- **Dogfood with the flag on locally**, then make sure your committed `.env*` leaves it off.

---

## References

- [`../plan-p2-cockpit-v3-dnd-batch.md`](../plan-p2-cockpit-v3-dnd-batch.md) — Phase 2 plan (what + why + P2-DL locks).
- [Phase 1 batch](../../p1-shell/) — the renderer + tabs + `movePane` this batch drives.
- [Phase 1 EXECUTION-ORDER](../../p1-shell/Tasks/EXECUTION-ORDER-p1-cockpit-v3-shell.md) — sibling exec-order shape.
- [Pane-freedom Phase 2 (dnd)](../../../30-05-2026/cockpit-pane-freedom/p2-dnd/) — the *old* 5-zone DnD this supersedes; its `dropPaneIntoZone` engine is the one v3 reuses.
- [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../EXECUTION-ORDER-GUIDELINES.md) — wave / lane shape rules.
- [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules.
