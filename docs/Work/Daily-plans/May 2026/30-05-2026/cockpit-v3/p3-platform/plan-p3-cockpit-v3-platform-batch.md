# Cockpit v3 — Phase 3: safety + platform (anchored chrome · persistence reuse · mobile flat) — 31 May 2026 batch plan

> **Phase 3 of the Cockpit v3 program — safety + platform.** Phases 1–2 shipped the editor-group shell and Cursor-style drag-and-drop behind the `NEXT_PUBLIC_COCKPIT_V3` flag. Now that panes *actually move* (Phase 2 DnD), Phase 3 makes the cockpit **safe and durable across that movement**: the clinical-safety chrome can never be hidden, the doctor's arrangement survives reload (and existing saved layouts migrate for free), and mobile keeps a flat fallback with safety/send reachable. **Still behind the flag** — the live cockpit is untouched.
>
> **Source plan:** [`Product plans/plan-cockpit-v3.md`](../../../../../Product%20plans/plan-cockpit-v3.md) — **R-CHROME3 + R-PERSIST3 + R-MOBILE3** in §R-item details / §Sequencing Phase 3. Resolves **V3-Q6** (persistence scope) and re-affirms the deferral of **V3-Q1** (seed; reset → blank for now).
>
> **Prefix note:** tasks are `cv3p-*` (`cv3` = cockpit v3, `p` = platform). Phase 0 = `cv3s` (scaffold), Phase 1 = `cv3c` (core shell), Phase 2 = `cv3d` (dnd); Phase 4 takes its own prefix (cutover).
>
> **Builds on Phases 1–2 ([p1-cockpit-v3-shell](../p1-shell/), [p2-cockpit-v3-dnd](../p2-dnd/)).** Phase 0/1 already render `safetyDock` / `actionDock` as `shrink-0` shell docks and ride `useShellLayout` for persistence; Phase 2 put the canvas inside one `<CockpitDndContext>` with the docks outside it. Phase 3 **hardens and proves** those inheritances against real reshaping, plus upgrades the minimal Phase-1 mobile fallback.
>
> **Why this phase is lighter than it sounds:** the heavy lifting was done earlier or inherited from the pane-freedom program. `validateLayout` already migrates v2→v3→v4→v5; `ChartRailWithEmptyState` is already leaf-anchored on the `snapshot` pane's `render` (pane-freedom P4-DL-3) so it travels by reference; the Rx providers are already page-root so the docked footer reads live state for free. Phase 3 is mostly **verification + hardening + a real mobile view**, with a small amount of net-new code (reset affordance, per-doctor lock, mobile upgrade).
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). Zero Opus build tasks; four Auto (cv3p-01..04). One optional Opus close-gate after cv3p-01 — the anchored-chrome "Send Rx & finish must survive any arrangement" path is the one consult-critical, silent-breakage surface (V3-R2), exactly the kind pane-freedom Phase 4 (cpfg-01) also gated.
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-p3-cockpit-v3-platform.md`](./Tasks/EXECUTION-ORDER-p3-cockpit-v3-platform.md).

---

## What Phase 3 does (one sentence)

> **Prove and harden that the clinical-safety chrome (safety strip + "Send Rx & finish" footer) stays anchored and functional in every drag-built arrangement, that the doctor's layout persists across reload with pane-freedom-era layouts migrating for free on the kept `PaneTreeNode` shape, and that mobile falls back to a flat view with safety + send reachable — all behind the flag, with zero engine, schema, or migration changes.**

After Phase 3, with the flag on: drag *Plan* to the far-left column, tab *Rx* under *Snapshot*, split *Investigations* out — and the safety strip still pins to the top, the "Send Rx & finish" footer still pins to the bottom and still **sends**, and the chart-rail empty-state rides along with *Snapshot*. Reload → the exact arrangement returns; a doctor who customised under the old pane-freedom shell sees their saved layout load unchanged. On a phone, the cockpit is a clean flat stack with the safety banner and a reachable finish action — no splits, no drag.

---

## What's already in place (so the scope stays bounded)

Phase 3 is verification-heavy because the architecture was built to make it so:

- **Docks already anchored (Phase 0/1).** `CockpitV3Shell` renders `safetyDock` (top) + `actionDock` (bottom) as `shrink-0` siblings around the canvas; Phase 2 placed the canvas inside `<CockpitDndContext>` with the docks **outside** it. Phase 3 formalises + tests "unhideable in every arrangement, including a drag-reshaped one."
- **Providers already page-root.** `RxFormProvider` / `RxSafetyProvider` / `RxFormActionsBridgeProvider` wrap `pageContent` (PatientProfilePage), which contains the v3 shell — so the docked footer reads `useRxFormActions` and the strip reads `useRxSafety()` regardless of where *Plan*/*Rx* sit. No provider move needed (the pane-freedom P4-DL-2 lift already did it).
- **Visual chrome already leaf-anchored.** `ChartRailWithEmptyState` wraps the `snapshot` pane's `render` in `templates.tsx` (pane-freedom P4-DL-3). v3 mounts panes by reference (`paneById[id].render()`), so the empty-state **travels with `snapshot` for free** — Phase 3 verifies it, doesn't rebuild it.
- **Persistence + migration already kept.** `useShellLayout` writes the v5 tree to `patient-profile/v4-tree-layout::<storageKey>` (200 ms debounce) and `validateLayout` already migrates v2→v3→v4→v5 (`upgradeV4LeavesToV5`). v3 shares the **same `storageKey`** as the old shell, so a pane-freedom-era saved tree loads in v3 by construction. `resetLayout` already returns to the (blank) default.
- **Mobile already falls back (minimally).** Phase 1's `CockpitMobileFallback` renders a flat stacked list of visible panes for `<lg`. Phase 3 upgrades it (titled cards / `MobilePillBar` lineage) and makes safety + send reachable.
- **`doctor_settings.cockpit_layout_presets` (migration 112) unchanged.** The preset *data* shape is untouched; v3 keeps it valid and applualbe.

Net new surface: **a reset-to-blank affordance, a per-doctor persistence lock (V3-Q6) + round-trip/migration tests, an upgraded mobile fallback with reachable safety/send, and verification suites for the chrome-after-drag and persistence paths** — under `frontend/components/patient-profile/v3/` + `frontend/lib/patient-profile/v3/`. No engine, no schema, no migration.

---

## Decision lock

The product plan's **v3-DL-1..10**, Phase 0's **P0-DL-1..5**, Phase 1's **P1-DL-1..6**, and Phase 2's **P2-DL-1..7** carry forward unchanged. Especially binding here: **v3-DL-6 (anchored docks + `body`/`live` guard)**, **v3-DL-8 (mobile flat)**, **v3-DL-10 (persistence reuse; layouts migrate)**, **P0-DL-4 (import via `foundation.ts`)**.

These seven are **Phase-3-specific**, frozen for this batch:

**P3-DL-1: Safety chrome is consult-scoped, outside the tree AND outside the DnD context.** `SafetyStickyStrip` (top) + `PlanActionFooter` (bottom) render exactly once as `shrink-0` shell docks, never inside the pane tree and never inside `<CockpitDndContext>` — so they can never be dragged, tabbed, hidden, or made a drop target. Providers stay page-root. (carries pane-freedom P4-DL-1/2 into v3; mitigates V3-R2)

**P3-DL-2: Visual chrome is leaf-anchored and travels.** The chart-rail empty-state rides the `snapshot` pane's `render` (inherited via the reused `PaneDefinition`); v3 verifies it travels when `snapshot` is dragged/tabbed/split. v3 has no `groupWrapper`, so there is no group-level chrome to strand.

**P3-DL-3: Persistence reuses the kept hook + the same key; no new schema or migration.** v3 persists the same v5 `PaneTreeNode` at `patient-profile/v4-tree-layout::<storageKey>`; `validateLayout`'s existing v2→v5 migration *is* the migration (idempotent, reversible-by-no-op). No new localStorage key, no `doctor_settings` change, migration 112 untouched. (v3-DL-10 / P1-DL-1)

**P3-DL-4: Per-doctor remember — V3-Q6 locked = per-doctor.** v3 remembers one arrangement per doctor, satisfied by the stable per-route localStorage key (per-browser = per-doctor in practice). Per-(doctor × consult-type) is deferred to ride V3-Q1's seed. The blank-seed effect must **never clobber a hydrated saved layout** (it only seeds when storage is empty — proven by test).

**P3-DL-5: Reset returns to blank.** v3's "reset" → the blank all-hidden default (`resetLayout`); the type-aware seed (V3-Q1) replaces "blank" later. Phase 3 surfaces a discoverable reset affordance (palette overflow / empty-state), it does not invent a new reset path.

**P3-DL-6: Mobile stays flat; safety + send reachable.** `<lg` renders the flat stacked fallback (no splits, no DnD, no palette columns — v3-DL-8), **but** the safety strip + a finish/send affordance remain **reachable** on mobile (the R-MOBILE3 delta — the old shell was desktop-dock-only with a header CTA; v3 mobile must surface safety + send). No editor groups on touch.

**P3-DL-7: Preset CRUD UI deferred; preset *data* preserved.** Existing `doctor_settings.cockpit_layout_presets` (migration 112) stay valid and applualbe via `applyLayout`; the full preset save/manage *UI* is **not** ported into the v3 palette in Phase 3 (captured as a fast-follow, alongside V3-Q1's seed). "Presets keep working" (v3-DL-10) = the data + migration are untouched and loadable, not that the v3 shell grows a preset picker now.

---

## Why this batch (Phase 3 specifically)

Phase 2 gave doctors the freedom to reshape; Phase 3 makes that freedom *safe and durable*. Three reasons it's scoped exactly this way:

1. **The single highest risk in the whole program is "you reshaped and the Send button vanished."** V3-R2 (safety chrome reachable-to-hide / unreachable) is rated **High**. Phase 2 made reshaping routine, so Phase 3 must *prove* — with drag-reshaped arrangements, not just the default — that the footer still pins and still sends, and the safety strip is unhideable. This is why R-CHROME3 (cv3p-01) is consult-critical and gets the optional Opus close-gate.

2. **Durability is the difference between a shell and a toy.** A cockpit you rebuild every reload isn't a workspace. R-PERSIST3 proves the kept persistence carries v3 for free *and* that a doctor's pane-freedom-era layout migrates without churn (v3-DL-10) — the promise that lets the eventual flag-flip not reset anyone's customisation.

3. **The platform must not strand mobile.** Editor groups don't work on phones (v3-DL-8); Phase 1 shipped a minimal stack. R-MOBILE3 makes it a real flat view with safety + send reachable, so the flag can be turned on for a doctor who sometimes opens a consult on their phone without losing the controls that end a visit.

The batch is deliberately verification-forward: the architecture (page-root providers, leaf-anchored visual chrome, kept migration) was *designed* in earlier phases to make Phase 3 cheap. The value here is **proof under reshaping** + a few real additions (reset, mobile upgrade, per-doctor lock), not a big build.

This batch closes Phase 3 with **4 tasks across 3 waves** (a genuine 2-lane Wave 1 — chrome ∥ persistence are independent surfaces), **~5–8 dev-days**, **zero migrations, zero backend changes, zero model/engine changes, zero Opus build tasks**. The visible artifact at the close-gate: flag on → reshape the layout several ways via drag → safety strip pinned, footer pinned + sends, empty-state travels with Snapshot → reload → exact arrangement returns; load a pane-freedom-era saved layout → it renders unchanged; reset → blank canvas; shrink to `<lg` → flat stack with the safety banner + a reachable finish action.

---

## Cross-cutting acceptance gate (whole batch)

All must be green before the batch is closed.

### Anchored chrome (cv3p-01 · R-CHROME3)

- [ ] `SafetyStickyStrip` (top) + `PlanActionFooter` (bottom) render once as `shrink-0` shell docks, **outside** the pane tree and **outside** `<CockpitDndContext>` — never draggable / tabbable / hideable / a drop target (P3-DL-1 / v3-DL-6).
- [ ] In a drag-reshaped arrangement (Plan to the left column; Rx tabbed under Snapshot; Investigations split out), the docked footer still renders and **its "Send Rx & finish" handler fires** (reads live `useRxFormActions` — provider scope intact).
- [ ] The chart-rail empty-state travels with `snapshot` when it is dragged / tabbed / split (leaf-anchored; P3-DL-2).
- [ ] Safety strip pins to the shell top regardless of where `plan` lives; a drug/allergy clash still surfaces it.
- [ ] `body`-during-`live` guard intact (v3-DL-6); docks behave across cockpit states (live / ended / terminal).
- [ ] Docks render even on a **blank canvas** (empty-state) — present before any pane is added.

### Persistence + migration (cv3p-02 · R-PERSIST3)

- [ ] A drag-built arrangement persists across reload via `useShellLayout` (same v5 `PaneTreeNode`, same key); resize + active-tab survive remount (P3-DL-3).
- [ ] A representative pane-freedom-era layout (nested splits + multi-tab leaves + hidden panes) loads correctly in v3 — round-trip test; `validateLayout`'s migration is idempotent and reversible-by-no-op (v3-DL-10).
- [ ] The blank-seed effect **never clobbers** a hydrated saved layout (seeds only when storage is empty) — explicit test.
- [ ] Per-doctor remember (V3-Q6): the stable per-route key restores the doctor's last arrangement across appointments (P3-DL-4).
- [ ] "Reset" returns to the blank default (`resetLayout`); a discoverable reset affordance exists (P3-DL-5).
- [ ] No new persisted schema / localStorage key; `doctor_settings` + migration 112 untouched; preset data still valid (P3-DL-3 / P3-DL-7).

### Mobile flat fallback (cv3p-03 · R-MOBILE3)

- [ ] `<lg` renders the flat stacked fallback — no `ResizablePanelGroup`, no DnD, no palette columns (v3-DL-8).
- [ ] The safety strip + a finish/send affordance are **reachable** on mobile (P3-DL-6).
- [ ] `lg+` renders the editor-group shell (no regression).
- [ ] Mobile fallback hydrates from the same persisted layout (shows the visible panes), and shows the empty-state when nothing is visible.

### Integration + behaviour (cv3p-04)

- [ ] Full flow: flag on → drag-reshape → chrome holds + sends → reload → arrangement returns → shrink to mobile → flat + reachable → restore desktop. End-to-end green.
- [ ] Flag off: byte-identical to today (P0-DL-1 re-verified — no v3 path runs).
- [ ] No customize mode, no `PaneDropOverlay`, no fixed template pre-fill in the v3 path.

### Quality

- [ ] `cd frontend; npx tsc --noEmit` clean.
- [ ] `cd frontend; npm run lint` clean (warnings only).
- [ ] Phase 3 v3 suites green (chrome-after-drag, provider-scope, persistence round-trip, blank-seed-no-clobber, reset, mobile flat). Full `npm test` may still hang on the pre-existing `useShellLayout` / `Shell.test.tsx` issue (inbox) — run targeted suites.
- [ ] No edit to `layout-tree*.ts` / `types.ts` / `panes/*` / any migration; no new persistence layer / key (v3-DL-1 / P1-DL-1 / P3-DL-3).

### Documentation

- [ ] `docs/Work/capture/inbox.md` gains a line noting Phase 3 shipped behind the flag + deferred items (preset CRUD UI port, per-consult-type persistence, InvestigationsAutoMerge narrow-merge in v3's flat-pane model).
- [ ] **No `COCKPIT.md` change** — still flag-gated, nothing user-visible by default. `COCKPIT.md` updates at the Phase 4 cutover.

---

## Phase plan position

This is **Phase 3 of 5 (Safety + platform)**. The ladder (from [`plan-cockpit-v3.md` §Sequencing](../../../../../Product%20plans/plan-cockpit-v3.md#sequencing)):

| Phase | Scope | Status |
|---|---|---|
| Phase 0 | Scaffold: flag + parallel mount + foundation boundary | ✅ Shipped (cv3s-01..02) |
| Phase 1 | Core shell: editor-group renderer + pane palette (R-SHELL3, R-PALETTE) | ✅ Shipped (cv3c-01..04) |
| Phase 2 | Interaction: Cursor-style always-on drag/drop (R-DND3) | ✅ Shipped (cv3d-01..04) |
| **Phase 3** | **Safety + platform: anchored chrome, persistence reuse, mobile (R-CHROME3, R-PERSIST3, R-MOBILE3)** | ▶ This batch (cv3p-01..04) |
| Phase 4 | Cutover: parity, flag flip, delete old (R-CUTOVER) | Pending |

---

## Out-of-scope (rolled forward)

| Out-of-scope item | Where it lands |
|---|---|
| Preset save/manage **UI** in the v3 palette | Deferred fast-follow (P3-DL-7) — preset *data* stays valid |
| Type-aware default seed (vs blank) | Deferred (V3-Q1) — reset → blank for now |
| Per-(doctor × consult-type) persistence | Deferred (V3-Q6 fast-follow) — rides the seed |
| `InvestigationsAutoMerge` narrow-merge container query in v3's flat-pane model | Capture/verify — the `@container/middle-bottom` wrapper is old-shell-only; assess whether the Plan pane needs its own container query in v3 |
| Deleting the old shell / customize mode / `PaneDropOverlay` | Phase 4 (R-CUTOVER) |
| `COCKPIT.md` user-facing doc | Phase 4 |
| Mobile editor-group behaviour / touch DnD | OUT — flat forever (v3-DL-8) |

---

## Cost estimate

| Wave | Tasks | Auto | Composer 2 | Opus | Wall-clock |
|---|---|---|---|---|---|
| Wave 1 | cv3p-01 (Lane A) ∥ cv3p-02 (Lane B) | 2/2 | 0/2 | 0/2 | ~4–6h (parallel — independent files) |
| Wave 2 | cv3p-03 (Lane A) | 1/1 | 0/1 | 0/1 | ~2–3h |
| Wave 3 | cv3p-04 | 1/1 | 0/1 | 0/1 | ~2–3h |
| **Total** | **4** | **4** | **0** | **0** | **~8–12h (~1.5 dev-days; less with the Wave-1 parallel pair)** |

Token estimate (rough): ~150k input / ~90k output. **One optional Opus close-gate after cv3p-01** — recommended: confirm the docked footer reads its registrar (`useRxFormActions`) and fires "Send Rx & finish" after `rx`/`plan` are dragged out of their default positions, and that no arrangement can hide the safety strip. This is the only consult-critical, silent-breakage surface (V3-R2) — exactly what pane-freedom Phase 4's cpfg-01 close-gate covered. Skip if cv3p-01's re-parent-after-drag tests assert the footer-sends path explicitly.

---

## Sequencing notes (the why behind the waves)

- **Wave 1 is a genuine 2-lane parallel pair.** cv3p-01 (R-CHROME3) touches `CockpitV3Shell` dock wiring + the pane registry/provider verification; cv3p-02 (R-PERSIST3) touches `useCockpitV3Layout` / the `useShellLayout` lineage + storage tests. They share **no files**, so they run in parallel chats — the first honest second lane in the v3 program (Phases 1–2 were single-lane because everything converged on the renderer/DnD surface). Per [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md), this is a real lane split, not an invented one.
- **Wave 2 (cv3p-03 · mobile) is Lane A, after cv3p-01.** Both touch `CockpitV3Shell` (cv3p-01 the desktop dock region; cv3p-03 the mobile branch + docks-on-mobile), so they serialise. The reachable-safety-on-mobile requirement also depends on cv3p-01 settling the dock contract.
- **Wave 2 → Wave 3 is a kind-of-work cut.** Waves 1–2 = build/harden; Wave 3 (cv3p-04) = integration + the Phase 3 gate + the cross-cutting suites.
- **No Opus build tasks** per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md): no PHI, no RLS, no migration, no novel security, no persisted-state *mutation* logic (the kept hook + engine own that). The one consult-critical surface (chrome reachability) is handled with re-parent-after-drag tests + the optional close-gate.

---

## References

- **Source:** [`Product plans/plan-cockpit-v3.md`](../../../../../Product%20plans/plan-cockpit-v3.md) — R-CHROME3, R-PERSIST3, R-MOBILE3, v3-DL-6/8/10, V3-Q1, V3-Q6.
- [Phase 2 — p2-cockpit-v3-dnd](../p2-dnd/) — the DnD that made reshaping routine (and put the docks outside `<CockpitDndContext>`).
- [Phase 1 — p1-cockpit-v3-shell](../p1-shell/) — the renderer + docks + `useCockpitV3Layout` Phase 3 hardens.
- [Pane-freedom Phase 4 — p4-cockpit-pane-freedom-chrome](../../30-05-2026/cockpit-pane-freedom/p4-chrome/) — the chrome-dock + provider-lift + leaf-anchor architecture v3 inherits (P4-DL-1..6).
- [`frontend/components/patient-profile/v3/CockpitV3Shell.tsx`](../../../../../../frontend/components/patient-profile/v3/CockpitV3Shell.tsx) — dock wiring + mobile branch.
- [`frontend/components/patient-profile/v3/CockpitMobileFallback.tsx`](../../../../../../frontend/components/patient-profile/v3/CockpitMobileFallback.tsx) — the minimal Phase-1 mobile view R-MOBILE3 upgrades.
- [`frontend/lib/patient-profile/useShellLayout.ts`](../../../../../../frontend/lib/patient-profile/useShellLayout.ts) — `validateLayout` (v2→v5 migration), `resetLayout`, `readPersistedLayout`, the v4/v5 storage key.
- [`frontend/lib/patient-profile/v3/useCockpitV3Layout.ts`](../../../../../../frontend/lib/patient-profile/v3/useCockpitV3Layout.ts) — the blank-seed effect (must not clobber) + the v3 state surface.
- [`frontend/lib/patient-profile/templates.tsx`](../../../../../../frontend/lib/patient-profile/templates.tsx) — `ChartRailWithEmptyState` leaf-anchored on `snapshot` (L179–190); the `@container/middle-bottom` wrapper (old-shell only).
- [`frontend/components/cockpit/middle/PlanActionFooter.tsx`](../../../../../../frontend/components/cockpit/middle/PlanActionFooter.tsx) + [`SafetyStickyStrip.tsx`](../../../../../../frontend/components/cockpit/middle/SafetyStickyStrip.tsx) — the docked chrome (reused, unchanged).
- [`frontend/components/patient-profile/MobilePillBar.tsx`](../../../../../../frontend/components/patient-profile/MobilePillBar.tsx) — the mobile pill/sheet lineage R-MOBILE3 draws on.
- [`backend/migrations/112_doctor_settings_cockpit_layout_tree.sql`](../../../../../../backend/migrations/112_doctor_settings_cockpit_layout_tree.sql) — the preset schema (untouched; P3-DL-3/7).
- [`docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) · [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md)
- Sibling: [`Tasks/EXECUTION-ORDER-p3-cockpit-v3-platform.md`](./Tasks/EXECUTION-ORDER-p3-cockpit-v3-platform.md).

---

**Created:** 2026-05-31.  
**Status:** `Committed` (Phase 3 of the v3 program).  
**Closes:** when all four cv3p tasks' gates + the cross-cutting gate above pass.  
**Next phase:** Phase 4 — Cutover (R-CUTOVER: parity matrix, flag flip, delete old), promoted to its own batch after this lands. This is the **last phase before the seed (V3-Q1) and flag-flip decisions** must be answered.
