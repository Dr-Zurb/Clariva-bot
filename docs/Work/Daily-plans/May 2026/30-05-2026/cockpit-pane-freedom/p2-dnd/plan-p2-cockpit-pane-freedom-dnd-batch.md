# Cockpit pane freedom — Phase 2: drag-drop with 5-zone overlay — 30 May 2026 batch plan

> **Phase 2 of the pane-freedom vision.** The full multi-phase vision + decision lock (DL-1..DL-10) live in the [Phase 1 plan doc](../p1-tabs/plan-p1-cockpit-pane-freedom-batch.md). This batch does **not** re-derive them — it inherits them and adds the drag-drop interaction layer on top of the data model + mutation ops Phase 1 shipped. This batch ships **Phase 2 only**. Phases 3 (Customize mode) and 4 (chrome lift) remain outlined in the Phase 1 plan and become their own batches.
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). Zero Opus build tasks. Four Auto (cpfd-01..04) + one Composer 2 Fast (cpfd-05). One optional Opus close-gate on `cpfd-01`'s `dropPaneIntoZone` op (same silent-corruption surface that justified the Phase 1 close-gate — a wrong directional insert can drop a pane or build an invalid tree).
>
> **Source plan:** None — this batch is the source for "the drag-drop layer of pane freedom." The cockpit-v2 program ([archive](../../../../../Product%20plans/archive/plan-cockpit-v2.md)) closed 2026-05-24; the pane-freedom phases are post-program shell evolution. The [Phase 1 batch](../p1-tabs/) is the canonical reference for the vision + decision lock; this doc is the canonical reference for the DnD interaction model.
>
> **Predecessor batch:**
> - [p1-tabs](../p1-tabs/) — **Phase 1.** Shipped the v5 tabs schema (`paneIds[]` + `activeTabId`), the four mutation ops (`addToTabsNode`, `extractFromTabsNode`, `moveLeafBetweenTabs`, `setActiveTab`), `<PaneTabStrip>`, the `<PaneSubtreeGroup>` leaf wire, and the context-menu "Move pane to…" workflow. **Sequencing dependency:** every task in this batch consumes Phase 1's ops + renderer. Phase 2 is a pure interaction layer — it adds no new persisted shape.
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-p2-cockpit-pane-freedom-dnd.md`](./Tasks/EXECUTION-ORDER-p2-cockpit-pane-freedom-dnd.md).

---

## What Phase 2 adds (one sentence)

> **Doctors can drag any pane (by its header grip or its tab) onto a 5-zone overlay that appears on every container — drop Center to tab into it, drop N/S/E/W to split it as a sibling.**

Everything underneath is already built. Phase 1's `addToTabsNode` is the Center drop; this batch adds one new mutation primitive (`dropPaneIntoZone`) for the four edge drops, one new presentational component (`<PaneDropOverlay>`), and the dnd-kit wiring that maps a drop gesture onto those ops. No new schema, no new migration, no new persisted shape.

---

## What's already in place (so the scope stays small)

A surprising amount of the DnD substrate already exists from earlier cockpit work and Phase 1. The batch leans on it:

- **`@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` are installed** (`frontend/package.json`). **No new package install.**
- **`<DndContext>` already wraps the recursive root** in `Shell.tsx` (`DesktopShell`), with a `PointerSensor` (8px activation distance) and a `handleDragEnd` callback.
- **The pane header already has a drag grip** — `ShellPaneHeader` calls `useDraggable({ id: "pane-drag-<id>", data: { paneId } })` and `useDroppable({ id: "pane-drop-<id>" })`. Today `handleDragEnd` only calls `reorderPane(fromId, toId)` (a flat same-row reorder); the long comment above `DesktopShell` explicitly flags cross-container reorder as a deferred future phase. **That future phase is this batch.**
- **The mutation engine + renderer are done.** `addToTabsNode` / `extractFromTabsNode` / `setActiveTab` (`layout-tree-mutations.ts`), `<PaneTabStrip>` + the `<PaneSubtreeGroup>` multi-pane leaf branch (`Shell.tsx`), and the `paneMoveUx` page handler + live-consult guard (`PatientProfilePage.tsx`) all shipped in Phase 1.

The net new surface area is therefore: **one mutation op, one overlay component, the drag-source + drop-routing wiring, and the page-level drop handler.**

---

## Decision lock

Phase 1's **DL-1 through DL-10 carry forward unchanged** (see [Phase 1 plan §"Decision lock"](../p1-tabs/plan-p1-cockpit-pane-freedom-batch.md#decision-lock-frozen-for-the-entire-vision-not-just-this-batch)). In particular this batch is bound by **DL-2 (five hard guardrails: MAX_LEAVES=10, last-leaf protection, pixel mins, single-home, always-reachable Reset)**, **DL-7 (mobile stays flat — no DnD on `<MobileShell>`)**, **DL-8 (live-consult guard extends to moves)**, **DL-9 (pane instances survive re-parenting)**, and **DL-10 (single-home refused at the mutation layer)**.

These six are **Phase-2-specific** decisions, frozen for this batch:

**P2-DL-1: Five zones, one droppable per zone.** Each visible container exposes five drop targets — `center`, `north`, `south`, `east`, `west`. `center` → tab into the container (`addToTabsNode`). The four edges → split as a sibling (`dropPaneIntoZone`). Each zone is its own `useDroppable`; collision detection uses dnd-kit's `pointerWithin` so the pointer position picks the zone unambiguously.

**P2-DL-2: Edge-drop semantics are target-relative.** Dropping pane A on container B's **west** zone puts A as a new sibling leaf **to the left of B** (and **north** = above, **east** = right, **south** = below). This is NOT the same as Phase 1's `extractFromTabsNode`, which is source-relative and always inserts right/below. The new `dropPaneIntoZone` op resolves the target's parent orientation and either inserts into the existing split or wraps the target in a fresh nested split of the correct axis.

**P2-DL-3: Drag sources are the header grip and the tabs — never body content.** A pane is dragged by its `ShellPaneHeader` grip (already draggable) or, for a tabbed container, by an individual tab button in `<PaneTabStrip>`. Body content is never a drag source (would fight scroll/selection). This preserves the "drag a tab strip header out → extract to new split" gesture from the vision: a tab dropped on an edge zone (its own container's or another's) calls `dropPaneIntoZone`.

**P2-DL-4: The overlay is visible only during an active drag.** No persistent drop hints, no always-on handles. `<PaneDropOverlay>` mounts when `useDndContext().active` is set and unmounts on drop/cancel. The cockpit looks identical to today during normal use. (A persistent "Customize layout" affordance is **Phase 3** — explicitly out of scope here.)

**P2-DL-5: The context menu remains the accessible / no-pointer path.** Phase 1's "Move pane to…" submenu stays. DnD is a progressive enhancement layered on top of the same ops; it is not the only way to reshape a layout. A keyboard-driven DnD sensor is **not** in scope (deferred to Phase 3 polish); the context menu is the keyboard-accessible equivalent and that is sufficient for this batch.

**P2-DL-6: Zone drops supersede the legacy flat reorder.** The current `handleDragEnd` → `reorderPane(fromId, toId)` cross-pane path is retired in favour of zone drops (reorder-within-a-row becomes "drop on a sibling's west/east edge"). `reorderPane` stays in `useShellLayout` for the toggle-bar / hotkey callers; only the DnD handler stops calling it. No two parallel drag behaviours.

---

## Why this batch (Phase 2 specifically)

Phase 1 proved the data model end-to-end through the context menu: a doctor can right-click → "Move pane to…" → pick a target → the pane re-homes as a tab, and it round-trips through localStorage. That validated `addToTabsNode` / `extractFromTabsNode` / `setActiveTab` against real renders. But the context menu is a *discovery-poor, multi-click* path. Every IDE a doctor has ever used (VS Code, Cursor, JetBrains, even browser tabs) teaches the same muscle memory: **grab a thing, drag it where you want it, drop it.** Until the cockpit speaks that language, "freedom" is technically present but practically invisible.

Three reasons this is the right next batch:

1. **The ops are proven; the gesture is missing.** Phase 1 deliberately shipped the workflow behind a context menu precisely so the mutation layer could be validated *before* layering visual drag affordances on top. That de-risking is done. Phase 2 is "wire the proven ops to the obvious gesture" — low architectural risk, high UX payoff.
2. **The DnD scaffold is already half-built.** `<DndContext>`, sensors, the draggable grip, and a (currently flat) `handleDragEnd` already exist. We are completing an intentionally-stubbed surface, not greenfielding one. The earlier shell-rebuild comment literally says cross-group reorder is "a Phase 3 UX feature per the plan's out-of-scope list" — that deferral pointer resolves here.
3. **It unblocks Phase 3 cleanly.** Phase 3's "Customize layout" toggle is pure UI state that *gates the visibility* of the same overlay + drag affordances this batch builds. If the overlay and drop routing don't exist, Phase 3 has nothing to toggle. Build the interaction now; gate it later.

The architectural unlock is the same as Phase 1's: **every drop emits one of the ops the context menu already emits** (`addToTabsNode` for Center, `dropPaneIntoZone` — which itself composes `removePaneFromCurrentContainer` + a directional insert — for edges). The tree, the persistence, the renderer, the alignment guard: all untouched. Phase 2 is an input method, not a data change.

This batch closes Phase 2 with **5 tasks across 3 waves**, **~10-14h wall-clock single-engineer**, **zero new migrations** (no persisted-shape change at all), **zero Opus build tasks** (one optional close-gate on `cpfd-01`'s new mutation op). The visible artifact at the close-gate: pick up any pane by its grip or tab → a 5-zone overlay lights up on every other container → drop on Center to tab in, or on an edge to split → the tree updates, persists, and survives a refresh; `body` refuses to drag during a live consult.

---

## Cross-cutting acceptance gate (whole batch)

These items must all be green before the batch is considered closed.

### Mutation op (extending `layout-tree-mutations.ts`)

- [ ] `dropPaneIntoZone(tree, sourcePaneId, targetGroupId, zone)` exported, where `zone: DropZone = "center" | "north" | "south" | "east" | "west"`.
- [ ] `center` delegates to `addToTabsNode(tree, sourcePaneId, targetGroupId, "end")` (tab-into; reuses Phase 1's cap + single-home logic).
- [ ] `north` / `south` / `east` / `west` insert `sourcePaneId` as a new single-pane sibling leaf relative to `targetGroupId` (west = left, east = right, north = above, south = below), wrapping the target in a fresh nested split when the parent's orientation doesn't match the zone axis.
- [ ] **Single-home (DL-10):** `sourcePaneId` is removed from its current container before insertion; no mutation ever yields a `paneId` in two `paneIds` arrays.
- [ ] **Caps:** edge drops respect `MAX_LEAVES = 10` (`cap-reached`); center drops respect `MAX_PANES_PER_TABS = 6` via `addToTabsNode`.
- [ ] **No-op cases:** dropping a pane on its own single-pane container's edge, or any drop that would not change the tree, returns `{ ok: false, reason: "no-op" }` (callers swallow silently — no toast).
- [ ] **`activeTabId` invariant** holds after every successful drop (`paneIds.includes(activeTabId)`).
- [ ] Failure reasons: `not-found | already-in-target | cap-reached | last-pane-in-tree | no-op`.
- [ ] Truth table covers every zone × (same-axis-parent / cross-axis-parent / root-target / single-pane-target / multi-pane-target / self-drop) combination, plus the round-trip `dropPaneIntoZone(...) → move back → structurally equal`.

### Overlay component (`<PaneDropOverlay>`)

- [ ] `<PaneDropOverlay>` renders five absolutely-positioned zone regions over a container; each region is a `useDroppable` keyed `drop-<groupId>-<zone>` with `data: { groupId, zone }`.
- [ ] Renders nothing unless a drag is active (reads `useDndContext().active` or an `isDragActive` prop).
- [ ] The zone under the pointer is visually highlighted (ring + fill); a label communicates the action ("Add as tab" for center, "Split left/right/up/down" for edges).
- [ ] When the drop would be a no-op or guarded (e.g. dragging `body` during live), the overlay shows a "blocked" affordance and does not accept the drop.
- [ ] Pure of layout-tree knowledge — props in, droppable refs out.

### DnD wiring (`Shell.tsx` + `PatientProfilePage.tsx`)

- [ ] Each visible container in `<PaneSubtreeGroup>` renders `<PaneDropOverlay>` for its leaf id during an active drag.
- [ ] `handleDragEnd` reads the source pane id from `active.data` and `{ groupId, zone }` from `over.data`, then calls the page's `onDropPaneOnZone(sourcePaneId, targetGroupId, zone)`.
- [ ] The legacy flat `reorderPane(fromId, toId)` cross-pane call is removed from `handleDragEnd` (P2-DL-6).
- [ ] A `<DragOverlay>` renders a lightweight drag preview (the dragged pane's icon + title).
- [ ] `paneMoveUx` is extended with `onDropPaneOnZone`; `PatientProfilePage.handleDropPaneOnZone` calls `dropPaneIntoZone`, applies the result via `shell.applyLayout({ version: 5, paneTree })`, and reuses the existing live-consult guard (`sourcePaneId === "body" && state === "live"` → toast + refuse).
- [ ] **DL-9:** dragging a pane to a new container does not remount its body — the `pane-<id>` key keeps the same React Fiber.
- [ ] **DL-7:** `<MobileShell>` renders no overlay and no drag sources (DnD code is desktop-branch only).

### Tab drag source (`<PaneTabStrip>`)

- [ ] Each tab button is (or is wrapped by) a `useDraggable` source carrying `data: { paneId }`.
- [ ] Dragging a tab onto another container's zone moves it there (center = tab-into, edge = split); dragging a tab onto an edge of any container extracts it into a new split.
- [ ] Tab drag does not conflict with tab click (8px activation distance separates click from drag), and right-click still opens the existing per-tab context menu.

### Behaviour

- [ ] **Existing layouts look and behave identically when no drag is in progress** — zero visual diff at rest.
- [ ] Drag a pane → overlay appears on every OTHER container (and on the source's own container for in-place edge extraction) → drop on a zone → tree updates + persists.
- [ ] Center drop → pane becomes the active tab in the target container.
- [ ] Edge drop → pane becomes a new sibling leaf on the chosen side; sibling sizes rebalance.
- [ ] Drop a pane back to its origin → tree returns to the original shape (reversible).
- [ ] Drag-resize handles still work after a drop; the cap toast fires on a 11th-leaf edge drop.
- [ ] Live-consult guard (DL-8): `body` cannot be dragged (grip disabled) and any drop targeting a move of `body` during `state === "live"` is refused with the existing toast.
- [ ] Hotkeys `mod+1..9` and the toggle bar still enumerate every visible pane after DnD reshuffles (no change to `paneTreeToFlat`).

### Quality

- [ ] `cd frontend; npx tsc --noEmit` clean.
- [ ] `cd frontend; npm run lint` clean (warnings only).
- [ ] `cd frontend; npm test` clean — new `layout-tree-mutations` (dropPaneIntoZone) rows + new `<PaneDropOverlay>` tests + existing `Shell` / `PaneTabStrip` / `layout-tree-mutations` / `PaneContextMenu` suites still green.
- [ ] No new Sentry errors in a 10-min smoke session: open `/dashboard/appointments/[id]`, drag 3 panes onto various zones, switch tabs, drag back, reset layout, refresh.
- [ ] One new telemetry event firing: `cockpit_pane_freedom.drag_drop` with `{ sourcePaneId, targetGroupId, zone }`.

### Documentation

- [ ] `docs/Reference/product/cockpit/COCKPIT.md` gains a "Drag-and-drop layout editing (Phase 2)" sub-section right after the existing §11 "Tabs grammar (Phase 1)".
- [ ] `docs/Work/capture/inbox.md` gains 4-6 lines for Phase 3-4 follow-ups surfaced by this batch (keyboard DnD sensor; persistent customize-mode overlay; tab reorder-within-strip; cross-axis size heuristics).
- [ ] No source-plan update — the pane-freedom phases are self-sourcing; this batch IS the source for the DnD layer.

---

## Phase plan position

This is **Phase 2 of 4** in the pane-freedom vision. The full ladder (from the [Phase 1 plan](../p1-tabs/plan-p1-cockpit-pane-freedom-batch.md#phase-plan-whole-vision-four-batches)):

| Phase | Scope | Status |
|---|---|---|
| Phase 1 | Tabs foundation + context-menu move | ✅ Shipped 2026-05-29 (cpf-01..06) |
| **Phase 2** | **Drag-drop with 5-zone overlay** | **This batch (cpfd-01..05)** |
| Phase 3 | Customize mode + preset workflow polish | Future batch |
| Phase 4 | `groupWrapper` refactor: action chrome → shell-level docks | Future batch |

---

## Out-of-scope (rolled forward to follow-up batches)

| Out-of-scope item | Where it lands |
|---|---|
| **"Customize layout" toggle + `Cmd+Shift+L` hotkey** (persistent overlay/handles) | Phase 3 batch |
| **Save-as-preset bar in customize mode** | Phase 3 batch |
| **Reset-to-default button surfaced in layout dropdown** | Phase 3 batch |
| **Cramped-layout soft warning** (> 5 horizontal siblings) | Phase 3 batch |
| **Keyboard-driven DnD sensor** (dnd-kit `KeyboardSensor` + arrow-key zone selection) | Phase 3 batch — context menu is the a11y path for now (P2-DL-5) |
| **Reorder tabs within a single strip by dragging** | Phase 3 polish (sortable tab strip) |
| **Animated tween of panes into their new position** | Phase 3 polish |
| **`<PlanActionFooter>` / `<SafetyStickyStrip>` / `<RxFormActionsBridgeProvider>` lift** | Phase 4 batch |
| **Mobile DnD** | OUT — preserves DL-7 forever |
| **Multi-home panes (same pane in two containers)** | OUT — preserves DL-2.4 / DL-10 forever |

---

## Cost estimate

| Wave | Tasks | Auto chats | Composer 2 chats | Opus chats | Wall-clock |
|---|---|---|---|---|---|
| Wave 1 | cpfd-01 | 1/1 | 0/1 | 0/1 | ~3-4h |
| Wave 2 | cpfd-02, cpfd-03, cpfd-04 | 3/3 | 0/3 | 0/3 | ~6-8h (single lane sequential — cpfd-03 needs cpfd-02; cpfd-04 needs cpfd-03) |
| Wave 3 | cpfd-05 | 0/1 | 1/1 | 0/1 | ~1-2h |
| **Total** | **5** | **4** | **1** | **0** | **~10-14h (~1.5 dev-days single-engineer)** |

Token estimate (rough): ~180k input / ~110k output across the batch. Total batch spend (excluding optional close-gate review): ~$9-13.

**One optional Opus close-gate turn after cpfd-01** budgeted on top. **Recommended** — `dropPaneIntoZone` is the only silent-corruption surface in the batch (a wrong directional insert can drop a pane or produce a tree where a split has one child / a leaf has an empty `paneIds`). Skip if cpfd-01's truth table covers every zone × parent-orientation combination + the round-trip property cleanly.

---

## Sequencing notes (the why behind the waves)

The 3-wave shape:

- **Wave 1 is the load-bearing mutation op (cpfd-01).** Everything in Wave 2 calls `dropPaneIntoZone`. It also defines the `DropZone` type that both the overlay (cpfd-02) and the wiring (cpfd-03) import, so it must land first.
- **Wave 2 is a single sequential lane (cpfd-02 → cpfd-03 → cpfd-04).** The overlay component (cpfd-02) is a new file consumed by the renderer wiring (cpfd-03); the tab drag source (cpfd-04) needs cpfd-03's `handleDragEnd` to interpret a tab-sourced drag. All three touch the renderer surface (`Shell.tsx` / `PaneTabStrip.tsx`), so there is **no honest second lane** — biasing to sequential per [`EXECUTION-ORDER-GUIDELINES.md` §7](../../../../../process/EXECUTION-ORDER-GUIDELINES.md).
- **Wave 2 → Wave 3 is Cut 3 (kind-of-work change).** Wave 2 = Build (DnD wire-up). Wave 3 = QA + Docs + Telemetry confirm + capture-inbox.

**Why no Opus build tasks?** Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) hard-rules: no PHI columns, no RLS surface, no migrations, no novel security. `cpfd-01`'s mutation op is the only candidate (silent-corruption risk) — handled with the truth table + the optional close-gate. The wiring tasks extend an existing dnd-kit scaffold and an existing op surface.

**Optional close-gate Opus turn** — recommended after cpfd-01, mirroring the Phase 1 pattern. Focus: (1) every zone × parent-orientation insert produces a structurally valid tree; (2) single-home holds across the remove-then-insert; (3) the round-trip property; (4) `no-op` is returned (not a malformed tree) for self-drops. Budget: ~1 Opus chat / ~10k tokens.

---

## References

- [p1-tabs](../p1-tabs/) — **Phase 1.** The vision, the decision lock (DL-1..DL-10), the schema, the ops, the renderer, the context-menu workflow. This batch's foundation.
- [`frontend/lib/patient-profile/layout-tree-mutations.ts`](../../../../../../frontend/lib/patient-profile/layout-tree-mutations.ts) — mutation engine (cpfd-01 extends with `dropPaneIntoZone`; reuses `addToTabsNode` / `removePaneFromCurrentContainer` / `compactSingleChildSplits`).
- [`frontend/lib/patient-profile/layout-tree.ts`](../../../../../../frontend/lib/patient-profile/layout-tree.ts) — `PaneTreeNode` v5 schema + `listTabsContainers` (read-only here).
- [`frontend/components/patient-profile/Shell.tsx`](../../../../../../frontend/components/patient-profile/Shell.tsx) — `<DndContext>`, `ShellPaneHeader` draggable grip, `handleDragEnd`, `<PaneSubtreeGroup>` renderer (cpfd-03 wires the overlay + drop routing).
- [`frontend/components/patient-profile/PaneTabStrip.tsx`](../../../../../../frontend/components/patient-profile/PaneTabStrip.tsx) — tab strip (cpfd-04 makes tabs draggable).
- [`frontend/components/patient-profile/PatientProfilePage.tsx`](../../../../../../frontend/components/patient-profile/PatientProfilePage.tsx) — `paneMoveUx`, `handleMovePaneTo`, the live-consult guard (cpfd-03 adds `onDropPaneOnZone`).
- [`frontend/lib/patient-profile/telemetry.ts`](../../../../../../frontend/lib/patient-profile/telemetry.ts) — `trackCockpitPaneFreedomMoveViaContextMenu` (cpfd-03 adds `trackCockpitPaneFreedomDragDrop`).
- [`docs/Reference/product/cockpit/COCKPIT.md`](../../../../../../Reference/product/cockpit/COCKPIT.md) — §11 "Tabs grammar (Phase 1)"; cpfd-05 appends §12 "Drag-and-drop layout editing (Phase 2)".
- [`docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules.
- [`docs/Work/process/EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md) — wave / lane shape rules.
- Sibling: [`Tasks/EXECUTION-ORDER-p2-cockpit-pane-freedom-dnd.md`](./Tasks/EXECUTION-ORDER-p2-cockpit-pane-freedom-dnd.md) — wave / lane matrix.
