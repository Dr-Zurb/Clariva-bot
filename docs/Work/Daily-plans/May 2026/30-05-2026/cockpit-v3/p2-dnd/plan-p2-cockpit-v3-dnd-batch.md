# Cockpit v3 — Phase 2: interaction (Cursor-style always-on drag-and-drop) — 31 May 2026 batch plan

> **Phase 2 of the Cockpit v3 program — the interaction layer.** Phase 1 shipped a real editor-group shell (recursive renderer, always-on tabbed leaves, a header palette, a per-leaf context menu) behind the `NEXT_PUBLIC_COCKPIT_V3` flag. Phase 2 makes the doctor *grab a tab and drop it* — a single translucent half/quadrant preview (left/right → column, top/bottom → row, on the tab bar → tab), replacing the old five-dashed-box overlay. **Still behind the flag** — the live cockpit is untouched.
>
> **Source plan:** [`Product plans/plan-cockpit-v3.md`](../../../../../Product%20plans/plan-cockpit-v3.md) — **R-DND3** in §R-item details / §Sequencing Phase 2. Resolves **V3-Q2** (tab reorder within a strip) and re-affirms **V3-Q4** (keep the context-menu fallback).
>
> **Prefix note:** tasks are `cv3d-*` (`cv3` = cockpit v3, `d` = dnd). Phase 0 was `cv3s` (scaffold); Phase 1 was `cv3c` (core shell); later phases take their own prefixes (platform, cutover).
>
> **Builds on Phase 1 ([p1-cockpit-v3-shell](../p1-shell/)).** The renderer (`CockpitGroupView` / `CockpitLeafView`), the always-on `PaneTabStripV3`, and the state wrapper (`useCockpitV3Layout`) all landed. Critically, **`useCockpitV3Layout.movePane(paneId, targetGroupId, zone)` already wraps the kept `dropPaneIntoZone` engine** — so Phase 2 is "resolve a zone from the pointer, then call a method that already exists," not "build a mutation."
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). Zero Opus build tasks; four Auto (cv3d-01..04). One optional Opus close-gate after cv3d-02 — the pointer→zone geometry is the only new judgement surface (a wrong half/quadrant silently splits the wrong way), so a focused truth-table review is cheap insurance (still flag-gated, so not consult-critical).
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-p2-cockpit-v3-dnd.md`](./Tasks/EXECUTION-ORDER-p2-cockpit-v3-dnd.md).

---

## What Phase 2 does (one sentence)

> **Make every tab a drag source under one `<DndContext>`, render a single Cursor-style translucent preview (resolved by pointer geometry to a left/right/top/bottom half or the tab bar) over the hovered group, and commit the drop through the kept engine via the `movePane` method Phase 1 already wired — preserving the `body`-during-a-live-consult guard and keeping the context menu as the permanent no-pointer path — all behind the flag, with zero engine, model, or persistence changes.**

With the flag on, the doctor can: grab any tab → a translucent preview follows the cursor → drop on a group's **left/right half** to split into a column, its **top/bottom half** to split into a row, or onto a **tab bar** to add it as a tab; drag a tab **within its own strip** to reorder it. There is no mode, no "Customize" button, and exactly **one** preview on screen at a time (never five dashed boxes). What Phase 2 does *not* touch: the model, the mutation engine, persistence, or the safety docks — and it does not delete the old shell's `PaneDropOverlay` (that dies at Phase 4 cutover; v3 simply never imports it).

---

## What's already in place (so the scope stays bounded)

Phase 2 is an *input method*, and almost everything it needs already exists:

- **`useCockpitV3Layout.movePane(paneId, targetGroupId, zone)`** already calls `dropPaneIntoZone` and commits via `applyLayout`, returning `{ ok, reason }` for cap toasts. A drop is one call to this. `splitLeafDir`, `closeTab`, `addPane`, `removePane` are also already there.
- **The kept engine is complete and tested** — `dropPaneIntoZone(tree, sourcePaneId, targetGroupId, zone)` with `DropZone = "center" | "north" | "south" | "east" | "west"`, plus `moveLeafBetweenTabs` for within-strip reorder, and `MAX_LEAVES` / `MAX_PANES_PER_TABS` caps. Phase 2 never edits it (v3-DL-1).
- **`@dnd-kit/core` + `@dnd-kit/sortable` are already installed** (`frontend/package.json`) and used by the old `Shell.tsx` — no new packages. `useDraggable`, `useDroppable`, `DndContext`, `DragOverlay`, `PointerSensor`, `pointerWithin` all come from `@dnd-kit/core`.
- **The old shell is the behavioural reference** — `Shell.tsx` has a working `<DndContext>` (PointerSensor, 8px activation), `routePaneDropFromDragEnd(event)`, a `<DragOverlay>` preview, and the live-consult guard (`canDropSource` / `canTabInto` / `computeMoveDisabled` in `PatientProfilePage.tsx`). Phase 2 **re-authors the Cursor-style overlay** but reuses these patterns and the *same page-level guard*.
- **`PaneTabStripV3` already renders tabs** with stable `data-pane-tab-id` hooks and an `onContextMenuTab` slot. cv3c-02 deliberately rendered tabs as plain buttons and **left a note that Phase 2 re-adds drag** — this batch fulfils that.
- **`CockpitLeafView` / `CockpitGroupView` already carry `data-cockpit-leaf` / `data-cockpit-group` / `data-cockpit-orientation`** attributes and a clean leaf container — the natural mount points for a per-group droppable + preview.
- **The context menu (`CockpitLeafMenu`) is already the move path** — Split right/down, Move-to-group (tab-into), Close — all dispatching the same engine ops drag will. Phase 2 layers drag *over* this; it does not replace it (V3-Q4 / P1-DL-5).

Net new surface: **one new Cursor-style overlay component, one pure pointer→zone geometry helper (+ its truth-table test), drag wiring re-added to `PaneTabStripV3`, one `<DndContext>` + `<DragOverlay>` in the v3 shell, within-strip sortable reorder, and one telemetry event** — all under `frontend/components/patient-profile/v3/` + `frontend/lib/patient-profile/v3/`, plus one additive flag-gated prop thread in `PatientProfilePage.tsx`.

---

## Decision lock

The product plan's **v3-DL-1 .. v3-DL-10**, Phase 0's **P0-DL-1 .. P0-DL-5**, and Phase 1's **P1-DL-1 .. P1-DL-6** carry forward unchanged. Especially binding here: **v3-DL-1 (reuse the engine)**, **v3-DL-3 (no modes; dragging always on)**, **v3-DL-4 (Cursor-style single preview)**, **v3-DL-6 (anchored docks + `body`-during-`live` guard)**, **v3-DL-7 (soft caps, toasted)**, **P0-DL-4 (import via `foundation.ts`)**.

These seven are **Phase-2-specific**, frozen for this batch:

**P2-DL-1: Every drop commits through the kept engine via `movePane` — no new mutation.** A cross-group drop calls `layout.movePane(sourcePaneId, targetGroupId, zone)` (already wired to `dropPaneIntoZone`); `east/west` → column split, `north/south` → row split, `center` (tab bar) → add as tab. Within-strip reorder uses the kept `moveLeafBetweenTabs`. No engine edit, no new layout method beyond thin wiring (v3-DL-1).

**P2-DL-2: One translucent preview; the five-dashed-box overlay is gone from v3.** A new `CockpitDropOverlay` renders exactly **one** region preview over the hovered group, resolved by pointer geometry. The old `PaneDropOverlay` (5-zone) is **never imported** by any `v3/` file (P0-DL-4) and is deleted at Phase 4 cutover, not here.

**P2-DL-3: A single `<DndContext>` at the v3 shell root.** Exactly one context (PointerSensor, `activationConstraint: { distance: 8 }`, `collisionDetection={pointerWithin}`) wraps the desktop canvas. Tabs are the drag sources; each leaf group (body region) and its tab bar are the droppables. No second `<DndContext>`; no DnD on mobile (`<lg`, v3-DL-8).

**P2-DL-4: Always-on drag; no customize mode, no grip gate.** Tabs are draggable at all times (v3-DL-3), separated from click by the 8px activation distance. The only block is the `body`-during-`live` guard (v3-DL-6). No `useCustomizeMode`, no `GripVertical`-gated handle, no `⌘⇧L`.

**P2-DL-5: The context menu stays — V3-Q4 locked = keep.** Phase 1's `CockpitLeafMenu` is the permanent no-pointer / keyboard / a11y path. Phase 2 adds drag as an *additional* affordance over the same engine ops; it does **not** remove the menu and does **not** ship a keyboard-DnD sensor (the menu is that path).

**P2-DL-6: Tab reorder within a strip — V3-Q2 locked = yes, in-phase.** Dragging a tab within its own group reorders it (sortable), using the kept `moveLeafBetweenTabs`. Cross-group moves route through the overlay/geometry. If within-strip sortable proves costly to integrate cleanly with the cross-group overlay, it splits to a fast-follow (captured), but the lean and the plan-of-record is in-phase.

**P2-DL-7: Input method only — no persisted-shape or schema change; telemetry is additive.** Persistence rides `useShellLayout` exactly as Phase 1 left it (P1-DL-1); no migration, no new key. One telemetry event fires per *successful* drop (`{ sourcePaneId, targetGroupId, zone }`); it does **not** fire on no-op / guarded / capped / failed drops.

---

## Why this batch (Phase 2 specifically)

Phase 1 made the cockpit *buildable* (palette + context menu); Phase 2 makes it *feel like Cursor* — the whole reason v3 exists (the doctor rejected the "activate a mode to move tabs" model). Three reasons it's scoped exactly this way:

1. **The hard part is already done, twice over.** The mutation engine (`dropPaneIntoZone`) is kept and tested; the `movePane` method that calls it shipped in Phase 1. So Phase 2's new code is *pointer geometry + a translucent preview + drag wiring* — a rendering/interaction problem, not a correctness-of-layout problem. That is why it's four Auto tasks and the only review is a geometry truth-table.

2. **One preview, resolved by geometry, is the entire product delta.** The old overlay painted five labelled dashed boxes on every container; doctors who use modern editors expect a single fluid preview. The risk concentrates in one pure function — `resolveDropZoneFromPointer(rect, point) → DropZone` — which is unit-testable in isolation (cv3d-02) before any pixels move.

3. **The safety guard and the no-pointer path are inherited, not reinvented.** The `body`-during-`live` block already exists on the page (`canDropSource` / `computeMoveDisabled`); Phase 2 reuses it rather than authoring a second guard. The context menu (P1-DL-5) remains the keyboard/a11y path, so always-on drag doesn't strand non-pointer users.

This batch closes Phase 2 with **4 tasks across 3 waves**, **~6–9 dev-days** (the overlay + geometry is the heavy item), **zero migrations, zero backend changes, zero model/engine changes, zero Opus build tasks**. The visible artifact at the close-gate: flag on → grab the *Plan* tab, drag it over *Snapshot*'s right half → a single translucent preview fills the right half → drop → two columns; drag *Subjective* onto *Snapshot*'s tab bar → it joins as a tab; drag *History* within its strip → it reorders; try to drag *Body* during a live consult → refused with the existing toast; and there are no dashed boxes and no "Customize" button anywhere.

---

## Cross-cutting acceptance gate (whole batch)

All must be green before the batch is closed.

### Drag sources + context (cv3d-01)

- [ ] Every tab in `PaneTabStripV3` is a `useDraggable` source carrying `{ paneId, groupId }`; click vs drag separated by the 8px activation distance (a plain click still activates the tab).
- [ ] Exactly one `<DndContext>` (PointerSensor 8px, `pointerWithin`) wraps the desktop canvas; `<DragOverlay>` shows the dragged pane's icon + title (P2-DL-3).
- [ ] The dragged pane's **body is not remounted** during/after a drag (stable `pane-body-<id>` keying); no flicker of sibling leaves.
- [ ] `body` tab is **not** draggable during a live consult (guard threaded from the page; reuses `canDropSource`); no second guard invented (v3-DL-6 / P2-DL-4).
- [ ] No DnD wiring on mobile (`<lg`) — `CockpitMobileFallback` renders no drag sources / no context (v3-DL-8).

### Cursor-style overlay + geometry (cv3d-02)

- [ ] `resolveDropZoneFromPointer(rect, point)` is pure, exported, and truth-tabled: left/right thirds-or-halves → `west`/`east`; top/bottom → `north`/`south`; tab-bar region → `center`; with documented thresholds and tie-breaks.
- [ ] `CockpitDropOverlay` renders **exactly one** translucent region preview over the hovered group (half or quadrant) + a tab-bar highlight for `center`; **no** five-box dashed overlay anywhere (P2-DL-2).
- [ ] Each leaf group is a single `useDroppable`; the tab bar is a first-class droppable that resolves to `center` without a dashed center box.
- [ ] The old `PaneDropOverlay` is **not** imported by any `v3/` file (P0-DL-4 / P2-DL-2).

### Drop routing + guards + telemetry + reorder (cv3d-03)

- [ ] `handleDragEnd` resolves `{ sourcePaneId, targetGroupId, zone }` and commits via `layout.movePane(...)`; `west/east` → column, `north/south` → row, `center` → tab — verified against the kept `dropPaneIntoZone` truth table.
- [ ] Cap hits (`MAX_LEAVES` / `MAX_PANES_PER_TABS`) surface `toastOnCapRejection` and no-op; self-drops / no-ops produce no mutation and no toast.
- [ ] Guarded drops (`body` during `live`) are refused with the existing toast; no telemetry fires.
- [ ] Dragging a tab **within its own strip** reorders it via `moveLeafBetweenTabs` (V3-Q2 / P2-DL-6).
- [ ] One telemetry event per successful drop with `{ sourcePaneId, targetGroupId, zone }`; does **not** fire on no-op / guarded / capped / failed drops (P2-DL-7).

### Integration + behaviour (cv3d-04)

- [ ] Flag on: full drag-build-up (split via half, tab via bar, reorder within strip) works end-to-end and **persists across reload** (rides `useShellLayout`, P1-DL-1).
- [ ] Flag off: byte-identical to today (P0-DL-1 re-verified — no v3 path runs).
- [ ] Accidental micro-drags (< 8px) do **not** reparent panes; the context menu still works as the no-pointer path (P2-DL-4 / P2-DL-5).
- [ ] Docks stay anchored above/below the canvas in every arrangement (v3-DL-6 / P1-DL-6); the "Send Rx & finish" footer still sends.
- [ ] Mobile (`<lg`): flat fallback, no overlay / no drag sources (v3-DL-8).

### Quality

- [ ] `cd frontend; npx tsc --noEmit` clean.
- [ ] `cd frontend; npm run lint` clean (warnings only).
- [ ] Phase 2 v3 test suites green (geometry truth table, drag-source render, drop routing, reorder, guard refusal, flag on/off mount). Full `npm test` may still hang on the pre-existing `useShellLayout` / `Shell.test.tsx` issue (inbox) — run targeted suites.
- [ ] No edit to `layout-tree*.ts` / `types.ts` / `panes/*` / any migration; no new persistence layer; no edit to the old `Shell.tsx` / `PaneDropOverlay` (v3-DL-1 / P1-DL-1).

### Documentation

- [ ] `docs/Work/capture/inbox.md` gains a line noting Phase 2 shipped behind the flag + any rough edges found dogfooding (e.g. geometry threshold tuning at odd aspect ratios).
- [ ] **No `COCKPIT.md` change** — still flag-gated, nothing user-visible by default. `COCKPIT.md` updates at the Phase 4 cutover.

---

## Phase plan position

This is **Phase 2 of 5 (Interaction)**. The ladder (from [`plan-cockpit-v3.md` §Sequencing](../../../../../Product%20plans/plan-cockpit-v3.md#sequencing)):

| Phase | Scope | Status |
|---|---|---|
| Phase 0 | Scaffold: flag + parallel mount + foundation boundary | ✅ Shipped (cv3s-01..02) |
| Phase 1 | Core shell: editor-group renderer + pane palette (R-SHELL3, R-PALETTE) | ✅ Shipped (cv3c-01..04) |
| **Phase 2** | **Interaction: Cursor-style always-on drag/drop (R-DND3)** | ▶ This batch (cv3d-01..04) |
| Phase 3 | Safety + platform: anchored chrome, persistence reuse, mobile (R-CHROME3, R-PERSIST3, R-MOBILE3) | Pending |
| Phase 4 | Cutover: parity, flag flip, delete old (R-CUTOVER) | Pending |

---

## Out-of-scope (rolled forward)

| Out-of-scope item | Where it lands |
|---|---|
| Persistence hardening (migration, per-doctor remember, reset-to-seed) | Phase 3 (R-PERSIST3) — Phase 2 rides `useShellLayout` as-is |
| Anchored-chrome refinements beyond "docks stay put + footer sends" | Phase 3 (R-CHROME3) |
| Mobile editor-group behaviour / drag-on-touch | Stays flat (v3-DL-8); Phase 2 ships no mobile DnD |
| Keyboard-DnD sensor | Not built — the context menu is the no-pointer path (P2-DL-5) |
| Type-aware default seed | Deferred (V3-Q1) — blank for now |
| Animated drag/tab micro-interaction polish | Deferred (V3-D6) — rides after parity |
| Deleting the old shell / `PaneDropOverlay` / customize mode | Phase 4 (R-CUTOVER) — v3 simply never imports them |
| `COCKPIT.md` user-facing doc | Phase 4 |

---

## Cost estimate

| Wave | Tasks | Auto | Composer 2 | Opus | Wall-clock |
|---|---|---|---|---|---|
| Wave 1 | cv3d-01 | 1/1 | 0/1 | 0/1 | ~3–4h |
| Wave 2 | cv3d-02, cv3d-03 | 2/2 | 0/2 | 0/2 | ~6–9h (sequential — both build the v3 DnD surface) |
| Wave 3 | cv3d-04 | 1/1 | 0/1 | 0/1 | ~2–3h |
| **Total** | **4** | **4** | **0** | **0** | **~11–16h (~1.5–2 dev-days)** |

Token estimate (rough): ~170k input / ~105k output. **One optional Opus close-gate after cv3d-02** — recommended-light: review the `resolveDropZoneFromPointer` truth table for soundness (every region × aspect-ratio yields the intended zone; ties are deterministic). The geometry is the only silent-misbehaviour surface (a wrong half splits the wrong way, but the *engine* still produces a valid tree, so it can't corrupt state — hence light, not a hard gate). Skip if cv3d-02's truth table covers the regions explicitly with no skipped rows.

---

## Sequencing notes (the why behind the waves)

- **Wave 1 (cv3d-01) is the spine** — drag sources + one context + the drag preview. Until a tab is draggable and the context exists, neither the overlay nor the routing has anything to react to. It is small and contained (re-add `useDraggable`, mount `<DndContext>`/`<DragOverlay>`, thread the guard).
- **Wave 2 is a single sequential lane (cv3d-02 → cv3d-03).** cv3d-02 builds the visual overlay + the pure geometry and exposes the resolved zone as `over` data; cv3d-03 consumes that in `handleDragEnd` to commit + guard + toast + add reorder + telemetry. They share the v3 DnD surface, so they serialise (no honest second lane) per [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md). cv3d-02 is the heaviest task.
- **Wave 2 → Wave 3 is a kind-of-work cut.** Waves 1–2 = build; Wave 3 (cv3d-04) = integration + truth-table parity + accidental-drag/mobile/flag checks + the Phase 2 gate + tests.
- **No Opus build tasks** per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md): no PHI, no RLS, no migration, no novel security, no persisted-state *mutation* logic (the kept engine + `movePane` own that). The work is interaction + a pure geometry helper behind an off-by-default flag.

---

## References

- **Source:** [`Product plans/plan-cockpit-v3.md`](../../../../../Product%20plans/plan-cockpit-v3.md) — R-DND3, v3-DL-1..10, V3-Q2, V3-Q4.
- [Phase 1 — p1-cockpit-v3-shell](../p1-shell/) — the renderer, tabs, palette, and `useCockpitV3Layout.movePane` Phase 2 drives.
- [Phase 0 — p0-cockpit-v3-scaffold](../p0-scaffold/) — the flag, stub, and `foundation.ts` boundary.
- [`frontend/components/patient-profile/v3/PaneTabStripV3.tsx`](../../../../../../frontend/components/patient-profile/v3/PaneTabStripV3.tsx) — tabs (re-add `useDraggable`; cv3c-02 left the Phase 2 note).
- [`frontend/components/patient-profile/v3/CockpitGroupView.tsx`](../../../../../../frontend/components/patient-profile/v3/CockpitGroupView.tsx) + [`CockpitLeafView.tsx`](../../../../../../frontend/components/patient-profile/v3/CockpitLeafView.tsx) — droppable + overlay mount points (`data-cockpit-leaf` / `data-cockpit-orientation`).
- [`frontend/lib/patient-profile/v3/useCockpitV3Layout.ts`](../../../../../../frontend/lib/patient-profile/v3/useCockpitV3Layout.ts) — `movePane` / `splitLeafDir` / `closeTab` (the commit surface).
- [`frontend/components/patient-profile/Shell.tsx`](../../../../../../frontend/components/patient-profile/Shell.tsx) — the kept DnD reference: `<DndContext>` / `PointerSensor` / `routePaneDropFromDragEnd` / `<DragOverlay>` (re-authored, not copied).
- [`frontend/components/patient-profile/PaneDropOverlay.tsx`](../../../../../../frontend/components/patient-profile/PaneDropOverlay.tsx) — the **5-zone overlay v3 replaces** (never imported by `v3/`; deleted at Phase 4).
- [`frontend/components/patient-profile/PatientProfilePage.tsx`](../../../../../../frontend/components/patient-profile/PatientProfilePage.tsx) — the live-consult guard (`canDropSource` / `computeMoveDisabled`) Phase 2 reuses; the flag branch (~L1126) where the guard prop is threaded.
- [`frontend/lib/patient-profile/layout-tree-mutations.ts`](../../../../../../frontend/lib/patient-profile/layout-tree-mutations.ts) — `dropPaneIntoZone` / `moveLeafBetweenTabs` / caps (via `foundation.ts`).
- [`frontend/lib/patient-profile/telemetry.ts`](../../../../../../frontend/lib/patient-profile/telemetry.ts) — `trackCockpitPaneFreedomDragDrop` pattern; Phase 2 adds a v3 event.
- [`docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) · [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md)
- Sibling: [`Tasks/EXECUTION-ORDER-p2-cockpit-v3-dnd.md`](./Tasks/EXECUTION-ORDER-p2-cockpit-v3-dnd.md).

---

**Created:** 2026-05-31.  
**Status:** `Committed` (Phase 2 of the v3 program).  
**Closes:** when all four cv3d tasks' gates + the cross-cutting gate above pass.  
**Next phase:** Phase 3 — Safety + platform (R-CHROME3, R-PERSIST3, R-MOBILE3), promoted to its own batch after this lands.
