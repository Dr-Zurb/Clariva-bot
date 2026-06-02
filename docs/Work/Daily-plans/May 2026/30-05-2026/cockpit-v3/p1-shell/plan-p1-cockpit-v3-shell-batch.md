# Cockpit v3 — Phase 1: core shell (editor-group renderer + pane palette) — 30 May 2026 batch plan

> **Phase 1 of the Cockpit v3 program — the core shell.** This is the real rewrite: a new recursive editor-group renderer over the kept `PaneTreeNode`, always-on tabbed leaves (no customize mode), and a header pane palette that builds the cockpit up from blank. Everything ships **behind the `NEXT_PUBLIC_COCKPIT_V3` flag** stood up in Phase 0 — the live cockpit is untouched.
>
> **Source plan:** [`Product plans/plan-cockpit-v3.md`](../../../../../Product%20plans/plan-cockpit-v3.md) — R-SHELL3 + R-PALETTE in §R-item details / §Sequencing Phase 1.
>
> **Prefix note:** tasks are `cv3c-*` (`cv3` = cockpit v3, `c` = core shell). Phase 0 was `cv3s` (scaffold); later phases take their own prefixes (dnd, platform, cutover).
>
> **Builds on Phase 0 ([p0-cockpit-v3-scaffold](../p0-scaffold/)).** The flag, the parallel mount, the `CockpitV3Shell` stub (with anchored docks), and the `foundation.ts` import boundary all landed. Phase 1 fills the stub's placeholder with the real renderer — importing the kept model + engine through `foundation.ts` only (P0-DL-4).
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). Zero Opus build tasks; four Auto (cv3c-01..04). One optional Opus close-gate after Wave 3 (cv3c-04) — the renderer + persistence parity is the foundation every later phase builds on, so a correctness review is cheap insurance (still flag-gated, so not consult-critical).
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-p1-cockpit-v3-shell.md`](./Tasks/EXECUTION-ORDER-p1-cockpit-v3-shell.md).

---

## What Phase 1 does (one sentence)

> **Replace the Phase 0 stub with a real, always-on editor-group shell — a recursive renderer over `PaneTreeNode` (resizable splits + a tab strip on every leaf), built up from a blank canvas via a header pane palette and a minimal no-pointer context menu — all behind the flag, reusing `useShellLayout` for state + persistence and the engine for every mutation.**

The doctor (with the flag on) can: start from a blank canvas, add panes from a palette (each becomes a column), switch and close tabs, split a group into a row, move a pane into another group as a tab — and the arrangement survives reload. **No "Customize" mode exists.** What Phase 1 does *not* yet have is the Cursor-style drag-and-drop preview — that's Phase 2 (R-DND3); Phase 1's creation paths are the palette + a lightweight context menu so the shell is dogfoodable before DnD lands.

---

## What's already in place (so the scope stays bounded)

The rewrite is smaller than "new shell" implies because the state layer is kept:

- **`useShellLayout` already owns everything stateful** — it holds the `PaneTreeNode`, persists it (v5 localStorage, 200ms debounce), and exposes `paneTree`, `setGroupSizes`, `setLeafSize`, `setActiveTab`, `reorderPane`, `setPaneHidden`, `applyLayout`, `resetLayout`, `hydrated`, `layoutVersion`. Phase 1 **consumes this hook** for state + persistence + resize; it does not write a new persistence layer (P1-DL-1; R-PERSIST3 hardens it in Phase 3).
- **The mutation engine is complete** — `dropPaneIntoZone`, `addToTabsNode`, `extractFromTabsNode`, `restoreLeaf`, `setActiveTab`, with `MAX_LEAVES` / `MAX_PANES_PER_TABS`. Phase 1 applies structural moves by calling the engine, then `applyLayout({ version: 5, paneTree: result.tree })`. The engine isn't touched (v3-DL-1).
- **`foundation.ts` (Phase 0) is the import surface** — the renderer imports the model + engine + `PaneDefinition` through it.
- **Pane bodies are reused by reference** — `paneById[activeTabId].render()` mounts the kept `SnapshotPane` / `RxPane` / etc. unchanged.
- **`PaneTabStrip` already renders tabs + overflow** — Phase 1 forks it to drop the `useCustomizeMode` gate (always interactive); the markup + overflow popover are kept.
- **`PaneToggleBar` is the palette seed** — it already maps `PaneDefinition`s to icon buttons with on/off state; the palette evolves it into an add/remove surface.
- **The docks are already anchored** — Phase 0's `CockpitV3Shell` renders `safetyDock` / `actionDock` around the pane area; Phase 1 only changes what's *between* them.

Net new surface: **one recursive renderer component, one forked always-on tab strip, one palette, one minimal context menu, and the v3 layout-state wiring** — all under `frontend/components/patient-profile/v3/` + `frontend/lib/patient-profile/v3/`.

---

## Decision lock

The product plan's **v3-DL-1 .. v3-DL-10** and Phase 0's **P0-DL-1 .. P0-DL-5** carry forward unchanged. Especially binding here: **v3-DL-1 (reuse the engine)**, **v3-DL-2 (uniform tabs)**, **v3-DL-3 (no modes)**, **v3-DL-5 (blank start + palette)**, **v3-DL-6 (anchored docks)**, **P0-DL-4 (import via `foundation.ts`)**.

These six are **Phase-1-specific**, frozen for this batch:

**P1-DL-1: Reuse `useShellLayout` for state + persistence + resize.** v3 does not write a new persistence layer. The renderer consumes `useShellLayout` (same v5 `PaneTreeNode`, same localStorage key strategy). Structural moves (split / tab-into / extract / add / remove) call the engine and commit via `applyLayout`. Resize commits via `setGroupSizes` / `setLeafSize`; tab switches via `setActiveTab`. R-PERSIST3 (Phase 3) hardens migration + per-doctor remember + reset; Phase 1 just rides the existing hook.

**P1-DL-2: Every leaf renders a tab strip (uniform).** A single-pane leaf renders a one-tab strip; a multi-pane leaf renders the full strip + overflow. No pane is special; the body/consultation pane is a tab like any other (v3-DL-2).

**P1-DL-3: No customize mode anywhere in the v3 path.** Tabs, close buttons, the palette, and the context menu are always live. The forked tab strip has no `useCustomizeMode`. `customize-mode-context` / `CustomizeBar` are never imported by `v3/` code.

**P1-DL-4: Blank default; the palette builds up.** v3's default layout is empty (the renderer shows an empty-state prompt). Panes appear only when the doctor adds them from the palette. The type-aware default *seed* is deferred (V3-Q1) — Phase 1 is "blank for now."

**P1-DL-5: Pre-DnD creation = palette + minimal context menu.** Because the Cursor-style drag overlay is Phase 2, Phase 1 provides the non-drag creation paths so the shell is usable: the **palette** adds a pane as a new column; a **lightweight per-leaf context menu** offers "Split right / Split down / Move to group / Close". This resolves **V3-Q4** (keep a no-pointer creation path permanently — it's the a11y/keyboard fallback). Phase 2 layers the drag overlay over the same engine ops; it does not remove the context menu.

**P1-DL-6: Docks unchanged.** The Phase 0 `safetyDock` / `actionDock` keep wrapping the shell as `shrink-0` siblings (v3-DL-6). Phase 1 changes only the pane area between them; it never moves a dock into the tree.

---

## Why this batch (Phase 1 specifically)

Phase 0 proved the parallel surface; Phase 1 makes it a real cockpit (behind the flag). Three reasons it's scoped exactly this way:

1. **The renderer is the spine everything else hangs off.** R-DND3 (Phase 2) needs a renderer to drop onto; R-CHROME3 / R-PERSIST3 (Phase 3) need a shell to dock around and persist. Building the renderer + tabs + palette first — without DnD — gives a usable, testable shell that later phases enhance rather than block on.
2. **Reusing `useShellLayout` collapses the risk.** The scariest part of a layout rewrite is state + persistence correctness. By consuming the already-tested hook (and the already-tested engine), Phase 1's new code is *rendering and wiring*, not state machinery. That's why this is four Auto tasks, not an Opus odyssey.
3. **Non-drag creation makes it dogfoodable now.** A shell where you can't make a row or merge a tab until Phase 2 ships is hard to evaluate. The palette + a minimal context menu (P1-DL-5) let the team actually build layouts and find the rough edges before the DnD polish, and they double as the permanent keyboard/a11y path.

This batch closes Phase 1 with **4 tasks across 3 waves**, **~10–14 dev-days** (the renderer is the heavy item), **zero migrations, zero backend changes, zero model/engine changes, zero Opus build tasks**. The visible artifact at the close-gate: flag on → a blank cockpit with a palette; add Snapshot, Plan, Subjective → three columns; close a tab, split Plan into a row with Investigations, move Subjective into Snapshot's group as a tab → reload → the exact arrangement returns; the safety strip and "Send Rx & finish" footer stay pinned throughout; and there is no "Customize" button anywhere.

---

## Cross-cutting acceptance gate (whole batch)

All must be green before the batch is closed.

### Renderer + state (cv3c-01)

- [ ] `CockpitV3Shell` renders the live `PaneTreeNode` recursively: split nodes → resizable `Panel`/`PanelGroup` (horizontal/vertical per `direction`); leaf nodes → a group container with a body area showing `paneById[activeTabId].render()`.
- [ ] Resize commits via `useShellLayout` (`setGroupSizes` / `setLeafSize`) and persists across reload.
- [ ] The renderer consumes the kept `useShellLayout`; imports the model + engine via `foundation.ts` (P0-DL-4 / P1-DL-1).
- [ ] Renders correctly for arbitrary trees (nested splits, multi-tab leaves) — round-trip through serialise/deserialise.

### Always-on tabs (cv3c-02)

- [ ] Every leaf renders a tab strip (one-tab for single panes) — `PaneTabStripV3`, forked from `PaneTabStrip` with the `useCustomizeMode` gate removed (P1-DL-2 / P1-DL-3).
- [ ] Tab click → `setActiveTab`; the body swaps with no remount of sibling panes.
- [ ] Tab close (×) removes the pane (engine: extract/remove, last-leaf protected); overflow popover preserved beyond the visible tab limit.
- [ ] No `useCustomizeMode` import in any `v3/` file.

### Palette + build-up + context menu (cv3c-03)

- [ ] A header pane palette lists every available `PaneDefinition` (title + icon), marking on-canvas vs available; selecting one adds it (engine: `restoreLeaf` → new column) (R-PALETTE / v3-DL-5).
- [ ] Removing a pane from the palette / closing its last tab updates the tree (last-leaf protected; caps toast on hit, v3-DL-7).
- [ ] Blank canvas shows a discoverable empty-state ("Add a pane to begin").
- [ ] A minimal per-leaf context menu offers Split right / Split down / Move to group / Close, dispatching the engine (`dropPaneIntoZone` / `extractFromTabsNode` / `addToTabsNode`) + `applyLayout` (P1-DL-5 / V3-Q4).

### Integration + behaviour (cv3c-04)

- [ ] Flag on: the full build-up flow works end-to-end and **persists across reload** (the Phase 1 gate).
- [ ] Flag off: byte-identical to today (P0-DL-1 re-verified — no v3 path runs).
- [ ] Docks stay anchored above/below the pane area in every arrangement (v3-DL-6 / P1-DL-6); the "Send Rx & finish" footer still sends.
- [ ] Mobile (`<lg`): flat stacked fallback, no splits/DnD (v3-DL-8).
- [ ] No customize mode, no `PaneDropOverlay`, no fixed template pre-fill in the v3 path.

### Quality

- [ ] `cd frontend; npx tsc --noEmit` clean.
- [ ] `cd frontend; npm run lint` clean (warnings only).
- [ ] Phase 1 v3 test suites green (renderer round-trip, tab activate/close, palette add/remove, resize persist, empty-state). Full `npm test` may still hang on the pre-existing `useShellLayout` / `Shell.test.tsx` issue (inbox) — run targeted suites.
- [ ] No edit to `layout-tree*.ts` / `types.ts` / `panes/*` / any migration; no new persistence layer (v3-DL-1 / P1-DL-1).

### Documentation

- [ ] `docs/Work/capture/inbox.md` gains a line noting Phase 1 shipped behind the flag + any rough edges found while dogfooding.
- [ ] **No `COCKPIT.md` change** — still flag-gated, nothing user-visible by default. `COCKPIT.md` updates at Phase 4 cutover.

---

## Phase plan position

This is **Phase 1 of 5 (Core shell)**. The ladder (from [`plan-cockpit-v3.md` §Sequencing](../../../../../Product%20plans/plan-cockpit-v3.md#sequencing)):

| Phase | Scope | Status |
|---|---|---|
| Phase 0 | Scaffold: flag + parallel mount + foundation boundary | ✅ Shipped (cv3s-01..02) |
| **Phase 1** | **Core shell: editor-group renderer + pane palette (R-SHELL3, R-PALETTE)** | ▶ This batch (cv3c-01..04) |
| Phase 2 | Interaction: Cursor-style always-on drag/drop (R-DND3) | Pending |
| Phase 3 | Safety + platform: anchored chrome, persistence reuse, mobile (R-CHROME3, R-PERSIST3, R-MOBILE3) | Pending |
| Phase 4 | Cutover: parity, flag flip, delete old (R-CUTOVER) | Pending |

---

## Out-of-scope (rolled forward)

| Out-of-scope item | Where it lands |
|---|---|
| Cursor-style drag overlay (translucent half/quadrant preview; drop-on-tab-bar = tab) | Phase 2 (R-DND3) |
| Drag-to-reorder tabs within a strip | Phase 2 (V3-Q2) |
| Persistence hardening (migration, per-doctor remember, reset-to-seed) | Phase 3 (R-PERSIST3) — Phase 1 rides `useShellLayout` as-is |
| Type-aware default seed | Deferred (V3-Q1) — blank for now |
| Mobile editor-group behaviour | Stays flat (v3-DL-8); only the flat fallback is wired here |
| Deleting the old shell / customize mode | Phase 4 (R-CUTOVER) |
| `COCKPIT.md` user-facing doc | Phase 4 |

---

## Cost estimate

| Wave | Tasks | Auto | Composer 2 | Opus | Wall-clock |
|---|---|---|---|---|---|
| Wave 1 | cv3c-01, cv3c-02 | 2/2 | 0/2 | 0/2 | ~6–8h (sequential — both build `CockpitV3Shell`) |
| Wave 2 | cv3c-03 | 1/1 | 0/1 | 0/1 | ~3–4h |
| Wave 3 | cv3c-04 | 1/1 | 0/1 | 0/1 | ~2–3h |
| **Total** | **4** | **4** | **0** | **0** | **~11–15h (~1.5–2 dev-days)** |

Token estimate (rough): ~180k input / ~110k output. **One optional Opus close-gate after cv3c-04** — recommended-light: review the renderer's tree round-trip + resize/active-tab persistence (the foundation later phases build on). Not consult-critical (flag-gated), so skip if cv3c-04's tests cover round-trip + persistence explicitly.

---

## Sequencing notes (the why behind the waves)

- **Wave 1 is a single sequential lane (cv3c-01 → cv3c-02).** Both progressively build `CockpitV3Shell`: cv3c-01 lays the recursive renderer + resize spine; cv3c-02 adds the always-on tab strip to each leaf. They share the same component, so they serialise (no honest second lane) per [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md).
- **Wave 2 (cv3c-03) depends on a working renderer + tabs** — the palette adds panes the renderer must render and the tabs must surface; the context menu dispatches engine ops the renderer reflects.
- **Wave 2 → Wave 3 is a kind-of-work cut.** Waves 1–2 = build; Wave 3 (cv3c-04) = integration + persistence parity + the Phase 1 gate + tests.
- **No Opus build tasks** per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md): no PHI, no RLS, no migration, no novel security, no persisted-state *mutation* logic (the kept hook + engine own that). The work is rendering + wiring behind an off-by-default flag.

---

## References

- **Source:** [`Product plans/plan-cockpit-v3.md`](../../../../../Product%20plans/plan-cockpit-v3.md) — R-SHELL3, R-PALETTE, v3-DL-1..10.
- [Phase 0 — p0-cockpit-v3-scaffold](../p0-scaffold/) — the flag, stub, and `foundation.ts` boundary Phase 1 builds on.
- [`frontend/lib/patient-profile/useShellLayout.ts`](../../../../../../frontend/lib/patient-profile/useShellLayout.ts) — the kept state + persistence hook Phase 1 consumes (P1-DL-1).
- [`frontend/lib/patient-profile/layout-tree-mutations.ts`](../../../../../../frontend/lib/patient-profile/layout-tree-mutations.ts) — the engine Phase 1 dispatches (via `foundation.ts`).
- [`frontend/components/patient-profile/Shell.tsx`](../../../../../../frontend/components/patient-profile/Shell.tsx) — the kept shell whose renderer/resize behaviour is the parity reference (not copied — re-authored without the customize-mode tangle).
- [`frontend/components/patient-profile/PaneTabStrip.tsx`](../../../../../../frontend/components/patient-profile/PaneTabStrip.tsx) — forked to `PaneTabStripV3` (drop the customize gate).
- [`frontend/components/patient-profile/PaneToggleBar.tsx`](../../../../../../frontend/components/patient-profile/PaneToggleBar.tsx) — the palette seed.
- [`frontend/components/patient-profile/PaneContextMenu.tsx`](../../../../../../frontend/components/patient-profile/PaneContextMenu.tsx) — the context-menu pattern the v3 minimal menu reuses.
- [`frontend/lib/patient-profile/v3/foundation.ts`](../../../../../../frontend/lib/patient-profile/v3/foundation.ts) — the import boundary (Phase 0).
- [`docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) · [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md)
- Sibling: [`Tasks/EXECUTION-ORDER-p1-cockpit-v3-shell.md`](./Tasks/EXECUTION-ORDER-p1-cockpit-v3-shell.md).

---

**Created:** 2026-05-30.  
**Status:** `Committed` (Phase 1 of the v3 program).  
**Closes:** when all four cv3c tasks' gates + the cross-cutting gate above pass.  
**Next phase:** Phase 2 — Interaction (R-DND3: Cursor-style drag/drop), promoted to its own batch after this lands.
