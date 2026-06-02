# Cockpit pane freedom — Phase 2 (drag-drop) execution order — 30 May 2026 batch

> **Sibling plan doc:** [`../plan-p2-cockpit-pane-freedom-dnd-batch.md`](../plan-p2-cockpit-pane-freedom-dnd-batch.md). The plan answers "what + why" + how Phase 2 sits in the four-phase vision; this doc answers "who-runs-what-when" + which model.
>
> **Authoring conventions:** [`docs/Work/process/EXECUTION-ORDER-GUIDELINES.md`](../../../../../EXECUTION-ORDER-GUIDELINES.md). Biased to single sequential lanes — the whole batch concentrates on the renderer DnD surface, so there is no honest second lane.
>
> **Cost-aware model strategy:** [`docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md). TL;DR: zero Opus build tasks (one optional close-gate after Wave 1); four Auto (cpfd-01..04) + one Composer 2 Fast (cpfd-05).
>
> **Phase scope:** This doc covers **Phase 2 only**. Phase 1 shipped (cpf-01..06). Phases 3 (Customize mode) and 4 (chrome lift) are outlined in the [Phase 1 plan](../../p1-tabs/plan-p1-cockpit-pane-freedom-batch.md) and become their own batches.

---

## Wave plan (3 waves)

```
Wave 1 (Drop mutation engine — ~3-4h, single lane sequential):
  Lane α  ──── cpfd-01 (M, Auto)

                                  ── optional Opus close-gate review here ──

Wave 2 (Drag-drop interaction — ~6-8h, single lane sequential):
  Lane α  ──── cpfd-02 (S, Auto) ──> **cpfd-03 (M, Auto)** ──> cpfd-04 (S, Auto)

Wave 3 (Verify + docs + telemetry confirm — ~1-2h, single lane sequential):
  Lane α  ──── cpfd-05 (XS, Composer 2 Fast)
```

**Total wall-clock with parallelism:** ~10-14h (no parallelism — single lane throughout).
**Total agent-time (sequential equivalent):** ~10-14h.

The bottleneck is **Wave 2 — single-lane sequential** because every task touches the renderer DnD surface (`Shell.tsx` / `PaneTabStrip.tsx`) and each consumes the previous (`cpfd-03` mounts `cpfd-02`'s overlay; `cpfd-04` rides `cpfd-03`'s `handleDragEnd`). `cpfd-03` is the highest-cost task in the batch.

---

## Lane-by-lane details

### Wave 1 — Drop mutation engine (single lane sequential)

**Goal:** Land `dropPaneIntoZone` + the `DropZone` type that the whole Wave 2 imports.

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [cpfd-01](./task-cpfd-01-drop-mutation-engine.md) | M | Auto | `layout-tree-mutations.ts`, `layout-tree.ts`, the cpf-02 task file | Pure tree logic. Reuses `removePaneFromCurrentContainer`, `compactSingleChildSplits`, `addToTabsNode`. Truth table BEFORE implementation (like cpf-02). |

**Acceptance gate (Wave 1 close):**

- [ ] `dropPaneIntoZone(tree, sourcePaneId, targetGroupId, zone)` exported with `DropZone = "center" | "north" | "south" | "east" | "west"`.
- [ ] `center` delegates to `addToTabsNode`; edges insert a target-relative sibling (west=left, east=right, north=above, south=below).
- [ ] Cross-axis parent → target wrapped in a fresh nested split of the zone axis; same-axis parent → inserted into the existing split at the right index.
- [ ] Single-home preserved (remove-then-insert); `activeTabId` invariant holds after every drop.
- [ ] Caps enforced (`MAX_LEAVES` for edges, `MAX_PANES_PER_TABS` for center); `no-op` returned for self-drops that change nothing.
- [ ] Round-trip property green: `dropPaneIntoZone` then move back is structurally equal.
- [ ] `cd frontend; npx tsc --noEmit` + `npm test lib/patient-profile/__tests__/layout-tree-mutations.test.ts` clean.

### Wave 2 — Drag-drop interaction (single lane sequential)

**Goal:** Build the overlay, wire the drop routing, and make tabs a drag source — the user-visible DnD.

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [cpfd-02](./task-cpfd-02-pane-drop-overlay.md) | S | Auto | `DropZone` (from cpfd-01), `@dnd-kit/core` `useDroppable`, an existing shadcn overlay/styling for reference | New file `PaneDropOverlay.tsx`. Owns five `useDroppable`s. Renders only during an active drag. |
| 1 | **[cpfd-03](./task-cpfd-03-shell-dnd-wiring.md)** | **M** | **Auto** | `Shell.tsx` (DndContext, ShellPaneHeader, handleDragEnd, PaneSubtreeGroup), `PatientProfilePage.tsx` (paneMoveUx, guard), `telemetry.ts` | Highest-cost task. Mount overlay per container; rewrite `handleDragEnd` → `onDropPaneOnZone`; add `<DragOverlay>` preview; extend `paneMoveUx`; add telemetry; retire flat reorder. |
| 2 | [cpfd-04](./task-cpfd-04-tab-drag-source.md) | S | Auto | `PaneTabStrip.tsx`, cpfd-03's `handleDragEnd` data shape | Make each tab a `useDraggable` source `{ paneId }`. Click vs drag separated by the 8px activation distance. |

**Acceptance gate (Wave 2 close):**

- [ ] All Wave 1 gates still green.
- [ ] During a drag, every visible container shows the 5-zone overlay; the pointer-over zone is highlighted with an action label.
- [ ] Drop Center → `addToTabsNode` (pane becomes active tab); drop edge → `dropPaneIntoZone` (new sibling leaf on the chosen side).
- [ ] `handleDragEnd` no longer calls the flat `reorderPane`; all cross-container drops route through `onDropPaneOnZone` (P2-DL-6).
- [ ] `<DragOverlay>` shows the dragged pane's icon + title; dropped pane body is NOT remounted (DL-9, `pane-<id>` key).
- [ ] Tabs are draggable; dragging a tab onto a zone moves/extracts it; tab click + right-click still work.
- [ ] Live-consult guard: `body` grip disabled during `state === "live"`; a guarded drop is refused with the existing toast.
- [ ] `<MobileShell>` renders no overlay / no drag sources (DL-7).
- [ ] Integration smoke (drag pane by grip → drop on a sibling's east edge → split appears → drag back → original shape) passes manually.

### Wave 3 — Verify + docs + telemetry confirm (single lane sequential)

**Goal:** Cross-cutting gate, the one telemetry event, COCKPIT.md, capture follow-ups for Phases 3-4.

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [cpfd-05](./task-cpfd-05-verification-and-close-out.md) | XS | Composer 2 Fast | `COCKPIT.md` §11, `docs/Work/capture/inbox.md`, the smoke matrix in this doc | Docs + smoke + telemetry confirm. No production logic changes. |

**Acceptance gate (Wave 3 close):**

- [ ] All Wave 2 gates still green.
- [ ] All cross-cutting gates from [`plan-p2-cockpit-pane-freedom-dnd-batch.md` §"Cross-cutting acceptance gate"](../plan-p2-cockpit-pane-freedom-dnd-batch.md#cross-cutting-acceptance-gate-whole-batch) pass.
- [ ] `cockpit_pane_freedom.drag_drop` fires on every successful drop with `{ sourcePaneId, targetGroupId, zone }`; does NOT fire on no-op / guarded / failed drops.
- [ ] `docs/Reference/product/cockpit/COCKPIT.md` has a new "Drag-and-drop layout editing (Phase 2)" sub-section after §11.
- [ ] `docs/Work/capture/inbox.md` has 4-6 new follow-up lines (Phase 3-4).
- [ ] `cd frontend; npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] **No source plan update** — the pane-freedom phases are self-sourcing.

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| cpfd-01 | M | Auto | Pure tree mutation extending a shipped pattern (cpf-02). Truth-table-driven; well-spec'd. Optional Opus close-gate after. |
| cpfd-02 | S | Auto | Presentational component owning `useDroppable`s; mirrors the cpf-03 `<PaneTabStrip>` shape. |
| cpfd-03 | M | Auto | Renderer wiring on an existing dnd-kit scaffold. The batch's heaviest task but bounded — extend `handleDragEnd`, mount overlay, add page handler + telemetry. |
| cpfd-04 | S | Auto | Add a draggable to existing tab buttons; small, contained. |
| cpfd-05 | XS | Composer 2 Fast | Docs + smoke + telemetry confirm; no judgement-heavy code. |

**Caps check:** zero Opus build tasks (≤1/wave, ≤2/batch satisfied trivially). One optional Opus close-gate review turn after cpfd-01 (not a build task).

---

## Optional close-gate review turn

Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md` "Use Opus sparingly"](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

**Recommended after cpfd-01 (end of Wave 1).** `dropPaneIntoZone` is the only silent-corruption surface in the batch — a wrong directional insert can drop a pane, leave a single-child split, or build a leaf with an empty `paneIds`, all of which can pass a shallow structural check but crash the renderer or silently lose a pane on the next persist. Budget ~1 Opus chat / ~10k tokens focused on:

1. **Insert soundness** — every zone × parent-orientation (same-axis / cross-axis / root / single-pane target / multi-pane target) yields a structurally valid tree.
2. **Single-home** — the remove-then-insert never yields a `paneId` in two `paneIds` arrays.
3. **Round-trip** — `dropPaneIntoZone(...)` followed by a move back returns a structurally equal tree.
4. **`no-op` integrity** — self-drops that change nothing return `{ ok: false, reason: "no-op" }`, never a malformed tree.

Skip if cpfd-01's truth table covers all four explicitly with no skipped/`xit`'d rows.

---

## Critical path

`cpfd-01 → cpfd-02 → cpfd-03 → cpfd-04 → cpfd-05`. Fully sequential. Single-engineer wall-clock ~10-14h. No parallelism credit — there is no independent second lane (every Wave 2 task touches the renderer DnD surface and consumes its predecessor).

---

## Anti-goals

- ❌ Don't ship the "Customize layout" toggle / `Cmd+Shift+L` — Phase 3.
- ❌ Don't ship a keyboard DnD sensor — Phase 3; the context menu is the a11y path (P2-DL-5).
- ❌ Don't keep the legacy flat `reorderPane` in `handleDragEnd` — zone drops supersede it (P2-DL-6).
- ❌ Don't add a new persisted shape or migration — Phase 2 is an input method, not a data change.
- ❌ Don't render the overlay or any drag affordance on `<MobileShell>` — DL-7.
- ❌ Don't allow `body` to drag during a live consult — DL-8.
- ❌ Don't add tab reorder-within-a-strip — Phase 3 polish (capture-inbox it).
- ❌ Don't introduce a second `<DndContext>` — there is exactly one, at the desktop root.

---

## Notes for the executor

- **Branch off `main` for Wave 1.** cpfd-01 touches only `layout-tree-mutations.ts` + its test file.
- **Wave 1 → Wave 2 is a Cut 1 (dependency cliff).** Without `dropPaneIntoZone` + the `DropZone` type, neither the overlay nor the wiring can compile.
- **cpfd-01 is load-bearing + a silent-corruption surface.** Write the truth table first (like cpf-02 did). Spend the optional Opus close-gate.
- **The DnD scaffold already exists** — `<DndContext>`, `PointerSensor` (8px), `ShellPaneHeader` draggable grip, and a (flat) `handleDragEnd`. cpfd-03 *extends* this; it does not greenfield a DnD system. Read the comment block above `DesktopShell` in `Shell.tsx` — it explicitly anticipated this batch.
- **No new package installs.** `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` are already in `frontend/package.json`. `<DragOverlay>` and `useDroppable` come from `@dnd-kit/core`.
- **Reuse the page guard.** `PatientProfilePage` already has `computeMoveDisabled` (body + live). cpfd-03's `onDropPaneOnZone` reuses the same condition — do not invent a second guard.
- **Telemetry pattern from cpf-05.** One event per successful drop; payload `{ sourcePaneId, targetGroupId, zone }`. Don't fire on no-op / guarded / failed drops.

---

## References

- [`../plan-p2-cockpit-pane-freedom-dnd-batch.md`](../plan-p2-cockpit-pane-freedom-dnd-batch.md) — Phase 2 plan (what + why + decision lock inheritance).
- [Phase 1 batch](../../p1-tabs/) — the foundation (schema + ops + renderer + context-menu workflow).
- [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../EXECUTION-ORDER-GUIDELINES.md) — wave / lane shape rules.
- [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules.
- Sibling exec-order (prior day): [Phase 1 EXECUTION-ORDER](../../p1-tabs/Tasks/EXECUTION-ORDER-p1-cockpit-pane-freedom.md).
