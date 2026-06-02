# Cockpit pane freedom — Phase 3: Customize mode + preset workflow polish — 30 May 2026 batch plan

> **Phase 3 of the pane-freedom vision.** The full multi-phase vision + decision lock (DL-1..DL-10) live in the [Phase 1 plan doc](../p1-tabs/plan-p1-cockpit-pane-freedom-batch.md). The drag-drop interaction layer (the 5-zone overlay, `dropPaneIntoZone`, draggable grips + tabs) lives in the [Phase 2 plan doc](../p2-dnd/plan-p2-cockpit-pane-freedom-dnd-batch.md). This batch does **not** re-derive either — it inherits both and adds the **on/off UI shell** that gates the Phase 2 affordances plus the **preset CRUD polish**. This batch ships **Phase 3 only**. Phase 4 (`groupWrapper` chrome lift) stays outlined in the Phase 1 plan and becomes its own batch.
>
> **⚠️ HARD DEPENDENCY — blocked on Phase 2 landing.** Every task here gates, mounts, or styles a surface Phase 2 builds (`<PaneDropOverlay>`, the draggable grip in `ShellPaneHeader`, the draggable tabs in `<PaneTabStrip>`, the `paneMoveUx.onDropPaneOnZone` wire). **Do not start Wave 1 until [p2-cockpit-pane-freedom-dnd](../p2-dnd/) (cpfd-01..05) is merged to `main`.** If Phase 2 is still in flight, this batch sits in the queue.
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). Zero Opus build tasks. Four Auto (cpfc-01..04) + one Composer 2 Fast (cpfc-05). No close-gate review needed — there is **no new persisted shape, no migration, no mutation primitive**; preset CRUD reuses endpoints that have shipped since CC-09.
>
> **Source plan:** None — this batch is the source for "the customize-mode shell of pane freedom." The cockpit-v2 program ([archive](../../../../../Product%20plans/archive/plan-cockpit-v2.md)) closed 2026-05-24; the pane-freedom phases are post-program shell evolution. The [Phase 1 batch](../p1-tabs/) is the canonical reference for the vision + decision lock; this doc is the canonical reference for the customize-mode UI state + preset workflow.
>
> **Predecessor batches:**
> - [p1-tabs](../p1-tabs/) — **Phase 1.** v5 tabs schema, the four mutation ops, `<PaneTabStrip>`, the context-menu "Move pane to…" workflow.
> - [Daily-plans/May 2026/30-05-2026/cockpit-pane-freedom/p2-dnd](../p2-dnd/) — **Phase 2.** `dropPaneIntoZone`, `<PaneDropOverlay>`, the draggable grip + tabs, the `<DragOverlay>` preview, the `onDropPaneOnZone` page handler. **Phase 3 toggles exactly these affordances on and off.**
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-p3-cockpit-pane-freedom-customize.md`](./Tasks/EXECUTION-ORDER-p3-cockpit-pane-freedom-customize.md).

---

## What Phase 3 adds (one sentence)

> **A "Customize layout" toggle (header button + `Cmd+Shift+L`, default OFF) that surfaces the Phase 2 drag affordances + a save / reset / rename / delete preset bar — so the cockpit is clean during normal consults and reshapeable only when the doctor opts in.**

Phase 2 shipped the *mechanics* of dragging panes; it left them always-on (any grip is always draggable). Phase 3 wraps those mechanics in an **explicit editing mode**: off by default (clean cockpit, identical to Phase 1 at rest), on when the doctor toggles it (grips + tabs become draggable, the 5-zone overlay can light up, and a customize bar appears with save / reset / cramped-layout hints). It also finishes the preset story Phase 1/clpm started: **rename** and **delete** custom presets, surfaced in customize mode.

---

## What's already in place (so the scope stays small)

Phase 3 is almost entirely **wiring an on/off bit through surfaces that already exist** plus surfacing endpoints that already ship:

- **The drag affordances exist (Phase 2).** `<PaneDropOverlay>`, the `useDraggable` grip in `ShellPaneHeader`, the `useDraggable` tabs in `<PaneTabStrip>`, the `<DragOverlay>` preview, and `handleDragEnd → onDropPaneOnZone`. Phase 3 adds a `customizeMode` gate (`disabled: !customizeMode`) to the drag sources and conditions the overlay mount on it. **No new DnD code.**
- **The preset API + hook exist.** `cockpit-layout-presets-tree.ts` already exports `listPresetsTree`, `savePresetTree` (5-preset cap), and **`deletePreset`** (DELETE `/:id`). The backend route `DELETE /api/v1/settings/doctor/cockpit-presets/:id` and the **full-array** `PUT` both shipped under CC-09 (migration 112's `cockpit_layout_presets` JSONB). **Rename is a read-modify-write through the existing PUT — no new endpoint, no migration.**
- **The preset picker exists.** `<PresetPicker>` (rendered via `CockpitHeader`'s `layoutTreeUx` prop) already lists built-ins + "My presets", offers "Save current layout" (popover), reset-to-template (per custom preset), and restore-hidden-pane. Phase 3 adds rename/delete affordances to the "My presets" rows (gated on customize mode) and a prominent always-reachable Reset.
- **The hotkey layer exists.** `useShellHotkeys` (stable-listener + `optsRef` pattern) already owns `Cmd+Shift+1/2/3` (presets) and `Cmd+1/2/3` (pane toggles). `Cmd+Shift+L` is free. Phase 3 adds one branch.
- **The header has a slot.** `CockpitHeader`'s right cluster renders `[RunningBehindBadge][primaryCta][PresetPicker][Kebab]`. The Customize toggle button drops in next to the Layout button.

The net new surface area is therefore: **one piece of page UI state, one toggle button, one hotkey branch, one customize bar component, rename/delete in the hook + API client + picker, one cramped-layout helper + banner, and three small telemetry events.**

---

## Decision lock

Phase 1's **DL-1 through DL-10** and Phase 2's **P2-DL-1 through P2-DL-6** carry forward unchanged (see [Phase 1 plan §"Decision lock"](../p1-tabs/plan-p1-cockpit-pane-freedom-batch.md#decision-lock-frozen-for-the-entire-vision-not-just-this-batch) and [Phase 2 plan §"Decision lock"](../p2-dnd/plan-p2-cockpit-pane-freedom-dnd-batch.md#decision-lock)). In particular this batch is bound by **DL-2.5 (Reset is always reachable)**, **DL-7 (mobile stays flat)**, **DL-8 (live-consult guard)**, and **P2-DL-5 (the context menu remains the no-pointer / a11y path)**.

These six are **Phase-3-specific** decisions, frozen for this batch:

**P3-DL-1: Customize mode gates the Phase 2 drag affordances; default OFF.** The grip (`ShellPaneHeader`) and tabs (`<PaneTabStrip>`) become `useDraggable` **only when `customizeMode === true`** (`disabled: !customizeMode`), and `<PaneDropOverlay>` mounts **only in customize mode**. At rest (mode off) the cockpit is pixel-identical to Phase 1 — no grips visible as draggable, no overlay, no hints. This **supersedes Phase 2's interim always-on DnD**: P2-DL-4 ("overlay only during an active drag") still holds, but a drag can only *start* in customize mode. The Phase 2 batch explicitly captured this hand-off (`cpfd` follow-up: "gate the drag overlay + grips behind a Customize toggle; default off").

**P3-DL-2: Customize mode is ephemeral UI state — NOT persisted.** It lives as React state in `PatientProfilePage` and resets to OFF on every page load / appointment change. We persist *layouts and presets*, never the editing mode. (Rationale: a doctor who left customize on yesterday should not return to a cockpit bristling with drag handles mid-consult.)

**P3-DL-3: `Cmd+Shift+L` toggles customize mode.** Registered in `useShellHotkeys` alongside the existing table, behind the same editable-element guard (no firing while typing in a field). `L` = "Layout"; it does not collide with `Cmd+Shift+1/2/3` (preset apply) or `Cmd+1/2/3` (pane toggle). The toggle button in the header carries the same `Cmd+Shift+L` hint.

**P3-DL-4: Preset CRUD reuses the shipped endpoints — no new migration, no backend change.** Save = existing `savePresetTree` (full-array `PUT`, 5-preset cap). Delete = existing `deletePreset` (`DELETE /:id`). **Rename = read-modify-write through the same `PUT`** (the server replaces the whole array; there is no PATCH and we do not add one). Migration 112's `cockpit_layout_presets` JSONB is the store. `MAX_PRESETS = 5` is unchanged.

**P3-DL-5: Reset-to-default is always reachable (inherits DL-2.5).** The customize bar always shows a "Reset to default" action — even at the preset cap, even mid-edit. It applies the **active template's** built-in tree (resolves `BUILT_IN_PRESETS` by `selectedTemplateId`, falling back to Telemed-Video), mirroring the existing `handleResetLayoutTreePreset`. Reset is never gated behind customize mode being "clean".

**P3-DL-6: The cramped-layout warning is a soft, dismissible hint — never a hard block.** When the **root** split carries **> 5 horizontal siblings** (the DL-3.1 threshold from Phase 1), the customize bar shows a dismissible "this layout is getting cramped" nudge. It never prevents a drop, a save, or any layout. Dismiss is per-session (not persisted). It only renders in customize mode.

---

## Why this batch (Phase 3 specifically)

Phase 2 made the cockpit reshapeable with the obvious gesture — grab, drag, drop. But it shipped that gesture **always-on**, which trades one problem for another: a doctor mid-consult who grabs a pane header to scroll or reposition their attention can now accidentally start a layout drag. The 8px activation distance mitigates it, but the deeper issue is *intent*: reshaping a cockpit is a deliberate, occasional act, not something you want one fat-finger away during a live patient encounter. Every serious editor solves this the same way — there is a **mode** (or an explicit "edit layout" affordance) that separates "I'm using the tool" from "I'm rearranging the tool."

Three reasons this is the right next batch:

1. **It closes the "clean during normal use" promise the vision made on day one.** The Phase 1 plan's Phase 3 line is explicit: *"Customize layout toggle in header (default off; clean cockpit during normal use)."* Phase 2 deliberately shipped DnD always-on as an interim so the mechanics could be validated before the mode shell was built. That de-risking is done; this batch adds the shell.
2. **The preset loop is half-finished.** Doctors can save and apply custom presets, and reset a customized preset back to its template — but they cannot **rename** a preset they misnamed or **delete** one they no longer want. The endpoints to do both already ship (`PUT` full-array, `DELETE /:id`); only the UI is missing. Customize mode is the natural home for that CRUD — you manage your presets while you're in "arrange the cockpit" headspace.
3. **It needs no new data surface.** No migration, no schema bump, no mutation primitive. This is a pure UI-state + endpoint-surfacing batch — the cheapest, lowest-risk phase in the vision. It is the right thing to do *immediately after* Phase 2, while the drag affordances are fresh, rather than letting always-on DnD soak in production.

The architectural shape is "one boolean, threaded well": `customizeMode` is page state, drilled (or contexted) into the Shell to gate the drag sources + overlay, read by the header to render the toggle, and read by the customize bar + picker to surface save / reset / rename / delete. Turn it off and the tree, the persistence, the renderer, every guard behave exactly as Phase 2 at rest.

This batch closes Phase 3 with **5 tasks across 3 waves**, **~9-13h wall-clock single-engineer**, **zero new migrations**, **zero backend changes**, **zero Opus build tasks**. The visible artifact at the close-gate: the cockpit looks like Phase 1 at rest; click "Customize" (or press `Cmd+Shift+L`) → grips + tabs become draggable, the 5-zone overlay arms, and a customize bar appears with Save-as-preset, Reset-to-default, rename/delete on each custom preset, and a cramped-layout nudge when the row gets busy; toggle off → clean cockpit again; the mode resets to off on refresh.

---

## Cross-cutting acceptance gate (whole batch)

These items must all be green before the batch is considered closed.

### Customize-mode state + toggle (`PatientProfilePage` + `CockpitHeader` + `useShellHotkeys`)

- [ ] `customizeMode` is React state in `PatientProfilePage`, default `false`, reset to `false` on page mount / appointment change (P3-DL-2 — never read from or written to storage).
- [ ] `CockpitHeader` renders a "Customize" toggle button in the right cluster (next to the Layout/`<PresetPicker>` button) when `onToggleCustomizeMode` is provided; it shows an active/pressed state when `customizeMode === true` and carries a `Cmd+Shift+L` hint.
- [ ] `useShellHotkeys` toggles `customizeMode` on `Cmd/Ctrl+Shift+L` (P3-DL-3), behind the existing editable-element guard; no collision with the digit/preset/bracket bindings.
- [ ] `customizeMode` is threaded into `<PatientProfileShell>` and gates the Phase 2 drag sources: the `ShellPaneHeader` grip and `<PaneTabStrip>` tabs are `useDraggable({ disabled: !customizeMode || <existing guard> })`; `<PaneDropOverlay>` mounts only when `customizeMode` is on.
- [ ] **At rest (mode off): zero visual + behavioural diff from Phase 2 at rest** — no grips draggable, no overlay, no customize bar.
- [ ] **DL-7:** `<MobileShell>` ignores `customizeMode` entirely — no toggle, no bar, no DnD.
- [ ] Telemetry: `cockpit_pane_freedom.customize_toggled` `{ enabled, source: "button" | "hotkey" }` on every toggle.

### Save / reset bar (`<CustomizeBar>`)

- [ ] A `<CustomizeBar>` renders (below the header, sticky) **only while `customizeMode` is on**.
- [ ] It offers "Save current layout as preset" (inline name input, reuses `layoutTreePresets.savePreset` via the existing `onSaveCurrentLayout` handler); honours the 5-preset cap (disabled + "5/5 presets" note at cap).
- [ ] It offers an always-visible "Reset to default" that applies the **active template's** built-in tree (P3-DL-5 / DL-2.5).
- [ ] The bar is keyboard-reachable and dismisses with the same toggle (button or `Cmd+Shift+L`).

### Preset rename + delete (`cockpit-layout-presets-tree.ts` + `useLayoutTreePresets` + `<PresetPicker>`)

- [ ] `renamePreset(token, id, name)` added to the API client — read-modify-write via the existing full-array `PUT` (P3-DL-4); trims + length-caps the name like `savePresetTree`.
- [ ] `useLayoutTreePresets` exposes `deletePreset(id)` (wraps the shipped `deletePreset` client fn) and `renamePreset(id, name)`, each calling `refresh()` after.
- [ ] `<PresetPicker>` "My presets" rows show rename + delete affordances **only when `customizeMode` is on** (passed through `layoutTreeUx`); at rest the rows look exactly as today.
- [ ] Delete asks for lightweight confirmation (or is undo-friendly); deleting the active preset does not crash the picker (the active-check tolerates a missing preset).
- [ ] Rename respects the same name constraints as save; empty/whitespace names are rejected.
- [ ] Telemetry: `cockpit_pane_freedom.preset_crud` `{ op: "rename" | "delete", presetCount }`.

### Cramped-layout warning + shape telemetry (`layout-tree.ts` + `<CustomizeBar>` + `telemetry.ts`)

- [ ] A pure helper (e.g. `maxHorizontalSiblingsAtRoot(tree)` / `describeLayoutShape(tree)`) added to `layout-tree.ts` with unit coverage.
- [ ] The customize bar shows a dismissible soft warning when the root split has **> 5 horizontal siblings** (P3-DL-6 / DL-3.1); dismiss is per-session; it never blocks anything.
- [ ] Telemetry: `cockpit_pane_freedom.layout_shape` `{ leafCount, tabContainers, maxRootSiblings }` emitted once when customize mode is turned **off** (a "what shape did they build" signal — not on every drop).

### Behaviour

- [ ] Toggle on → grips + tabs draggable, overlay arms on drag, customize bar visible. Toggle off → all of it gone; cockpit clean.
- [ ] Save a layout in customize mode → it appears under "My presets"; refresh → it persists (existing localStorage + server round-trip; no new shape).
- [ ] Rename a preset → the new name shows immediately and after refresh. Delete a preset → it disappears immediately and after refresh.
- [ ] Reset to default → layout returns to the active template's built-in shape; works at the preset cap.
- [ ] Build a 6-wide root row → the cramped nudge appears in the bar; dismiss it → it stays gone for the session; it never blocks the 6th pane.
- [ ] Live-consult guard (DL-8) still holds: even in customize mode, `body` cannot be dragged during `state === "live"`.
- [ ] Customize mode resets to off after a refresh (P3-DL-2).

### Quality

- [ ] `cd frontend; npx tsc --noEmit` clean.
- [ ] `cd frontend; npm run lint` clean (warnings only).
- [ ] `cd frontend; npm test` clean — new `<CustomizeBar>` / `layout-tree` (shape helper) / `useLayoutTreePresets` (rename/delete) / `useShellHotkeys` (Cmd+Shift+L) tests + existing `PresetPicker` / `Shell` / `PaneTabStrip` suites still green.
- [ ] No new Sentry errors in a 10-min smoke session: open `/dashboard/appointments/[id]`, toggle customize on/off, save / rename / delete a preset, reset, build a cramped row, refresh.
- [ ] Three new telemetry events firing: `cockpit_pane_freedom.customize_toggled`, `cockpit_pane_freedom.preset_crud`, `cockpit_pane_freedom.layout_shape`.

### Documentation

- [ ] `docs/Reference/product/cockpit/COCKPIT.md` gains a "Customize mode + preset management (Phase 3)" sub-section right after the existing §12 "Drag-and-drop layout editing (Phase 2)".
- [ ] `docs/Work/capture/inbox.md` gains 4-6 lines for Phase 4 + polish follow-ups surfaced by this batch (chrome lift; keyboard DnD sensor still open; per-preset hotkey binding; customize-mode onboarding hint).
- [ ] No source-plan update — the pane-freedom phases are self-sourcing; this batch IS the source for the customize-mode layer.

---

## Phase plan position

This is **Phase 3 of 4** in the pane-freedom vision. The full ladder (from the [Phase 1 plan](../p1-tabs/plan-p1-cockpit-pane-freedom-batch.md#phase-plan-whole-vision-four-batches)):

| Phase | Scope | Status |
|---|---|---|
| Phase 1 | Tabs foundation + context-menu move | ✅ Shipped 2026-05-29 (cpf-01..06) |
| Phase 2 | Drag-drop with 5-zone overlay | Planned (cpfd-01..05) — **must merge before this batch starts** |
| **Phase 3** | **Customize mode + preset workflow polish** | **This batch (cpfc-01..05)** |
| Phase 4 | `groupWrapper` refactor: action chrome → shell-level docks | Future batch |

---

## Out-of-scope (rolled forward to follow-up batches)

| Out-of-scope item | Where it lands |
|---|---|
| **Keyboard-driven DnD sensor** (dnd-kit `KeyboardSensor` + arrow-key zone selection) | Phase 3 polish follow-up — the context menu remains the a11y path (P2-DL-5); customize mode does not change that |
| **Per-preset hotkey binding** (Cmd+Shift+4/5 for custom presets) | Follow-up — Phase 1 deliberately scoped hotkeys to the three built-ins (avoids "renamed a preset, forgot the number") |
| **Reorder tabs within a single strip by dragging** | Phase 3 polish (sortable tab strip) — already captured by Phase 2 |
| **Animated tween of panes into their new position** | Phase 3 polish — already captured by Phase 2 |
| **Customize-mode onboarding / first-run coachmark** | Follow-up — ship the mode first, measure discovery via `customize_toggled` telemetry |
| **`<PlanActionFooter>` / `<SafetyStickyStrip>` / `<RxFormActionsBridgeProvider>` lift** | Phase 4 batch |
| **Persisting customize mode across reloads** | OUT — preserves P3-DL-2 forever |
| **Raising the 5-preset cap** | OUT — `MAX_PRESETS = 5` is a product decision, unchanged here |
| **Mobile customize mode / mobile DnD** | OUT — preserves DL-7 forever |

---

## Cost estimate

| Wave | Tasks | Auto chats | Composer 2 chats | Opus chats | Wall-clock |
|---|---|---|---|---|---|
| Wave 1 | cpfc-01 | 1/1 | 0/1 | 0/1 | ~3-4h |
| Wave 2 | cpfc-02, cpfc-03, cpfc-04 | 3/3 | 0/3 | 0/3 | ~5-7h (single lane sequential — all three touch the customize/preset surface + the page) |
| Wave 3 | cpfc-05 | 0/1 | 1/1 | 0/1 | ~1-2h |
| **Total** | **5** | **4** | **1** | **0** | **~9-13h (~1.5 dev-days single-engineer)** |

Token estimate (rough): ~150k input / ~90k output across the batch. Total batch spend: ~$7-11.

**No Opus close-gate budgeted.** Unlike Phase 2 (`dropPaneIntoZone` was a silent-corruption surface), Phase 3 adds **no mutation primitive and no persisted shape** — the highest-risk item is the rename read-modify-write, which is a list mutation behind a server-validated cap with an existing `PUT`. The truth-table-grade scrutiny Phase 1/2 needed does not apply. If anything warrants a second pair of eyes it is cpfc-03's "don't clobber concurrent edits" handling — covered by a refresh-before-write note in the task, not an Opus turn.

---

## Sequencing notes (the why behind the waves)

The 3-wave shape:

- **Wave 1 is the load-bearing mode state (cpfc-01).** It introduces `customizeMode`, the header toggle, the hotkey, and the Shell gating. Every Wave 2 surface (the bar, the rename/delete affordances, the cramped warning) only appears *in customize mode*, so the mode bit must exist first. It is also the one task that touches the Shell/header/hotkey trio.
- **Wave 2 is a single sequential lane (cpfc-02 → cpfc-03 → cpfc-04).** The customize bar (cpfc-02) is the container the cramped warning (cpfc-04) mounts into; rename/delete (cpfc-03) extends the same `layoutTreeUx`/hook/API surface the bar consumes; and **all three touch `PatientProfilePage.tsx`** (new handlers + extended `layoutTreeUx`). There is no honest second lane — biasing to sequential per [`EXECUTION-ORDER-GUIDELINES.md` §7](../../../../../process/EXECUTION-ORDER-GUIDELINES.md).
- **Wave 2 → Wave 3 is Cut 3 (kind-of-work change).** Wave 2 = Build (UI + endpoint surfacing). Wave 3 = QA + Docs + Telemetry confirm + capture-inbox.

**Why no Opus build tasks?** Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) hard-rules: no PHI columns, no RLS surface, no migrations, no novel security, no silent-corruption mutation. Phase 3 is page UI state + a customize bar + surfacing two endpoints that already ship. The heaviest judgement call (rename read-modify-write under a cap) is handled with a refresh-before-write note.

---

## References

- [p1-tabs](../p1-tabs/) — **Phase 1.** Vision, decision lock (DL-1..DL-10), schema, ops, renderer, context-menu workflow.
- [Daily-plans/May 2026/30-05-2026/cockpit-pane-freedom/p2-dnd/](../p2-dnd/) — **Phase 2.** The drag affordances this batch gates: `<PaneDropOverlay>`, draggable grip + tabs, `<DragOverlay>`, `onDropPaneOnZone`.
- [`frontend/components/patient-profile/PatientProfilePage.tsx`](../../../../../../frontend/components/patient-profile/PatientProfilePage.tsx) — owns `layoutTreeUx`, `paneMoveUx`, preset handlers, the live-consult guard (cpfc-01 adds `customizeMode` state + toggle wiring; cpfc-02/03/04 add bar mount + CRUD handlers + shape telemetry).
- [`frontend/components/patient-profile/PatientProfileHeader.tsx`](../../../../../../frontend/components/patient-profile/PatientProfileHeader.tsx) — `CockpitHeader`, the right-cluster slot + `<PresetPicker>` mount (cpfc-01 adds the Customize toggle button).
- [`frontend/components/patient-profile/PresetPicker.tsx`](../../../../../../frontend/components/patient-profile/PresetPicker.tsx) — built-ins + "My presets" + save/reset/restore (cpfc-03 adds rename/delete gated on customize mode).
- [`frontend/components/patient-profile/Shell.tsx`](../../../../../../frontend/components/patient-profile/Shell.tsx) — the recursive renderer + Phase 2 drag sources (cpfc-01 threads `customizeMode` to gate them).
- [`frontend/hooks/useShellHotkeys.ts`](../../../../../../frontend/hooks/useShellHotkeys.ts) — the hotkey table (cpfc-01 adds the `Cmd+Shift+L` branch).
- [`frontend/hooks/useLayoutTreePresets.ts`](../../../../../../frontend/hooks/useLayoutTreePresets.ts) — `{ presets, atCap, savePreset, refresh }` (cpfc-03 adds `deletePreset` + `renamePreset`).
- [`frontend/lib/api/cockpit-layout-presets-tree.ts`](../../../../../../frontend/lib/api/cockpit-layout-presets-tree.ts) — `listPresetsTree` / `savePresetTree` / `deletePreset` (cpfc-03 adds `renamePreset` via the existing PUT).
- [`frontend/lib/patient-profile/layout-tree.ts`](../../../../../../frontend/lib/patient-profile/layout-tree.ts) — `PaneTreeNode` + tree utilities (cpfc-04 adds the root-sibling/shape helper).
- [`frontend/lib/patient-profile/telemetry.ts`](../../../../../../frontend/lib/patient-profile/telemetry.ts) — `trackCockpitPaneFreedom*` (this batch adds `customize_toggled`, `preset_crud`, `layout_shape`).
- [`docs/Reference/product/cockpit/COCKPIT.md`](../../../../../../Reference/product/cockpit/COCKPIT.md) — §12 "Drag-and-drop (Phase 2)"; cpfc-05 appends §13 "Customize mode + preset management (Phase 3)".
- [`docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules.
- [`docs/Work/process/EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md) — wave / lane shape rules.
- Sibling: [`Tasks/EXECUTION-ORDER-p3-cockpit-pane-freedom-customize.md`](./Tasks/EXECUTION-ORDER-p3-cockpit-pane-freedom-customize.md) — wave / lane matrix.
