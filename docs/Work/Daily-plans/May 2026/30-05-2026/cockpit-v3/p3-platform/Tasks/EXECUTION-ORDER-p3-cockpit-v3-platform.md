# Execution order — Cockpit v3 Phase 3 (safety + platform)

> Batch: [`plan-p3-cockpit-v3-platform-batch.md`](../plan-p3-cockpit-v3-platform-batch.md) · Product plan: [`plan-cockpit-v3.md`](../../../../../../Product%20plans/plan-cockpit-v3.md)
>
> **3 waves, 4 tasks — with a genuine 2-lane Wave 1.** This phase is verification-forward: most of the architecture (page-root providers, leaf-anchored visual chrome, kept v2→v5 migration) was built earlier specifically so Phase 3 is cheap. Read this file top-to-bottom before starting; it is the contract for *order*, the task files are the contract for *content*.

---

## TL;DR for the executor

1. **Wave 1 runs two lanes in parallel.** cv3p-01 (anchored chrome — Lane A) and cv3p-02 (persistence — Lane B) touch **disjoint files**, so run them in parallel chats. This is the first honest second lane in the v3 program.
2. **cv3p-01 is consult-critical.** Prove the docked footer still **sends** and the safety strip stays unhideable after a Phase-2 drag reshapes the layout. This is the only silent-breakage surface (V3-R2) → optional Opus close-gate.
3. **cv3p-02 is mostly proof + small additions.** The migration already lives in `validateLayout`; the work is round-trip tests, the blank-seed-no-clobber guard, the per-doctor lock (V3-Q6), and a reset affordance.
4. **cv3p-03 (mobile) is Wave 2, Lane A.** It edits the same `CockpitV3Shell` cv3p-01 settled, so it follows chrome.
5. **cv3p-04 last.** Integration, the Phase 3 gate, the cross-cutting suites.
6. **Flag stays OFF in committed config.** Verify flag-off parity in cv3p-04. Turn the flag on only locally to dogfood.

---

## Wave / lane matrix

| Wave | Task | Title | Depends on | Lane | Size | Model |
|---|---|---|---|---|---|---|
| **1** | **cv3p-01** | Anchored chrome: docks outside the tree + DnD context, provider-scope-after-drag, leaf-anchored empty-state (R-CHROME3) | Phase 1–2 | Lane A | **M** | **Auto** (optional Opus close-gate) |
| **1** | **cv3p-02** | Persistence reuse + migration round-trip + per-doctor (V3-Q6) + reset-to-blank (R-PERSIST3) | Phase 1–2 | Lane B (∥ cv3p-01) | **M** | **Auto** |
| **2** | **cv3p-03** | Mobile flat fallback upgrade + reachable safety/send (R-MOBILE3) | cv3p-01 | Lane A | **S–M** | **Auto** |
| **3** | **cv3p-04** | Integration + Phase 3 gate + cross-cutting tests | cv3p-01..03 | Lane A | **S–M** | **Auto** |

> **Two honest lanes in Wave 1, one thereafter.** cv3p-01 (shell dock wiring + provider verification) and cv3p-02 (`useCockpitV3Layout` / `useShellLayout` lineage + storage tests) share no files → real parallelism. cv3p-03 re-enters Lane A because it edits `CockpitV3Shell` (mobile branch) after cv3p-01 settles the dock contract. Per [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md): split a lane only when the files are genuinely disjoint — here they are.

---

## Critical path

```
Phase 1–2 (renderer + tabs + palette + DnD; docks outside DndContext)
        │
        ├───────────────────────────────┬───────────────────────────────
        ▼ (Lane A)                       ▼ (Lane B)
   cv3p-01  ── anchored chrome      cv3p-02  ── persistence + migration
   (footer sends after drag;        (round-trip; blank-seed-no-clobber;
    safety unhideable; leaf-anchor)  per-doctor V3-Q6; reset → blank)
        │                                │
        ▼                                │
   cv3p-03  ── mobile flat + reachable safety/send (Lane A)
        │                                │
        └───────────────┬────────────────┘
                        ▼
   cv3p-04  ── integrate + Phase 3 GATE + cross-cutting tests
                        │
                        ▼
   Phase 3 closed → promote Phase 4 (R-CUTOVER) — and answer V3-Q1 (seed) + flag-flip
```

The leverage is **cv3p-01**: proving the safety chrome survives reshaping is the program's highest-risk gate (V3-R2). cv3p-02 de-risks the flag-flip (no doctor loses their layout). Spend the care on cv3p-01.

---

## Wave detail

### Wave 1 — chrome ∥ persistence (two parallel lanes)

**Goal:** prove the two durability promises — chrome can't be hidden, layout can't be lost — under real reshaping.

- **cv3p-01 — Anchored chrome (Lane A).** Verify + harden that `SafetyStickyStrip` / `PlanActionFooter` render as `shrink-0` docks **outside** the pane tree and **outside** `<CockpitDndContext>` (never draggable / tabbable / hideable / a drop target). Re-parent-after-drag tests: drag `plan` to the left column, tab `rx` under `snapshot`, split `investigations` out → the footer still renders and **fires "Send Rx & finish"** (reads live `useRxFormActions`); the safety strip still pins to the top; the chart-rail empty-state travels with `snapshot`. Docks present even on a blank canvas. **Gate:** footer sends in ≥3 reshaped arrangements; safety strip unhideable; empty-state leaf-anchored; `body`/`live` guard intact.

- **cv3p-02 — Persistence + migration (Lane B).** Prove a drag-built arrangement persists across reload (same v5 tree, same key) and a pane-freedom-era layout (nested splits + multi-tab + hidden) loads in v3 unchanged (round-trip via `validateLayout`). Add an explicit test that the blank-seed effect **never clobbers** a hydrated saved layout. Lock per-doctor remember (V3-Q6) — the stable per-route key restores the last arrangement across appointments. Surface a discoverable **reset → blank** affordance (`resetLayout`). **Gate:** round-trip + migration idempotent; blank-seed-no-clobber proven; reset returns to blank; no new key/schema.

**Why parallel:** disjoint files (shell/provider vs state/storage). No shared edit surface.

### Wave 2 — mobile (cv3p-03, Lane A)

**Goal:** a real flat mobile view with the controls that end a visit reachable.

- **cv3p-03 — Mobile flat fallback (Lane A, after cv3p-01).** Upgrade Phase 1's minimal `CockpitMobileFallback` (titled cards / `MobilePillBar` lineage) for `<lg`: flat stack of visible panes, no splits / DnD / palette columns (v3-DL-8). Make the **safety strip + a finish/send affordance reachable** on mobile (the R-MOBILE3 delta vs the old desktop-dock-only path) — decide between rendering the docks on mobile or a pill/sheet equivalent, leaning toward surfacing the safety banner + a reachable finish action. Hydrate from the same persisted layout; show the empty-state when nothing is visible. **Gate:** `<lg` flat, no drag; `lg+` unchanged; safety + send reachable on mobile.

**Why Lane A:** edits `CockpitV3Shell`'s mobile branch (+ docks-on-mobile), the same file cv3p-01 touches.

### Wave 3 — close the phase (cv3p-04)

**Goal:** prove the Phase 3 gate end-to-end.

- **cv3p-04 — Integration + gate + tests.** Full flow: flag on → drag-reshape → chrome holds + sends → reload → arrangement returns → shrink to mobile → flat + reachable → restore desktop. Flag-off re-verified byte-identical. Run the cross-cutting suites (chrome-after-drag, provider-scope, persistence round-trip, blank-seed-no-clobber, reset, mobile flat). Inbox line (incl. deferred preset-CRUD-UI + per-consult-type persistence). **Gate:** the batch's cross-cutting acceptance gate is fully green.

---

## Model-selection rationale

Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

- **cv3p-01 — Auto (M).** Verification + small hardening on an existing dock layout. The risk is *consult-critical* (footer must send after a re-parent) but the work is wiring + tests, not novel logic. **Optional Opus close-gate** (recommended): confirm the footer reads its registrar and sends after `rx`/`plan` move, and that no arrangement can hide the safety strip — the one silent-breakage surface (V3-R2), exactly what pane-freedom cpfg-01 gated.
- **cv3p-02 — Auto (M).** Mostly tests against kept behaviour (`validateLayout` migration already exists) + a small reset affordance + the per-doctor lock. No new persistence logic.
- **cv3p-03 — Auto (S–M).** A presentational mobile upgrade + reachable controls. Bounded; `MobilePillBar` is the lineage reference.
- **cv3p-04 — Auto (S–M).** Integration + cross-cutting tests. No PHI, no security, no migration.

**No Opus build tasks. No Composer tasks** (the work is interdependent verification/hardening on a shared shell, better kept coherent under Auto).

---

## Optional close-gate review turn

**Recommended after cv3p-01 (end of the chrome lane).** Budget ~1 Opus chat / ~8k tokens focused on:

1. **Footer-sends-after-reparent** — after dragging `rx`/`plan` out of their default positions, the docked `PlanActionFooter` still reads `useRxFormActions` and the "Send Rx & finish" handler fires (the provider scope holds because providers are page-root, not in the tree).
2. **Unhideable safety strip** — no drag/tab/close path can remove or relocate the safety strip; it is outside the tree AND the DnD context.
3. **Leaf-anchor travel** — the chart-rail empty-state renders with `snapshot` wherever it lands.
4. **State coverage** — docks behave across `live` / `ended` / `terminal` and on a blank canvas.

Skip if cv3p-01's re-parent-after-drag tests assert the footer-sends path + unhideable-strip explicitly.

---

## Global anti-goals (apply to every task)

- ❌ Do **not** edit `layout-tree*.ts`, `layout-tree-mutations.ts`, `types.ts`, `panes/*`, or any migration (incl. 112). The model + engine + bodies + preset schema are reused as-is (v3-DL-1 / v3-DL-10).
- ❌ Do **not** write a new persistence layer or a new localStorage key. Reuse `useShellLayout` + the existing v4/v5 key (P3-DL-3).
- ❌ Do **not** move the safety strip / footer into the pane tree or into `<CockpitDndContext>` — they are consult-scoped docks (P3-DL-1).
- ❌ Do **not** add group-level chrome — visual chrome is leaf-anchored on its pane (P3-DL-2).
- ❌ Do **not** port the preset save/manage UI into the v3 palette — deferred (P3-DL-7); preset *data* stays valid.
- ❌ Do **not** render editor groups / splits / DnD on mobile (`<lg`) (v3-DL-8 / P3-DL-6).
- ❌ Do **not** import kept model/engine directly — go through `foundation.ts` (P0-DL-4). (Components like `SafetyStickyStrip` / `PlanActionFooter` / `MobilePillBar` are kept UI, imported directly.)
- ❌ Do **not** invent a second live-consult guard or reset path — reuse the page's guard + `resetLayout` (v3-DL-6 / P3-DL-5).
- ❌ Do **not** flip `NEXT_PUBLIC_COCKPIT_V3` on in committed `.env*`. Local dogfooding only.

## Global definition of done (every task)

- [ ] `cd frontend; npx tsc --noEmit` clean.
- [ ] `cd frontend; npm run lint` clean (warnings ok).
- [ ] Task's own v3 test suite green (targeted — full `npm test` may hang on the pre-existing inbox issue).
- [ ] Flag-off path unchanged (spot-check at cv3p-04).
- [ ] Task file's checklist ticked + a one-line status stamp at the bottom.

---

## Notes for the executor

- **Most of Phase 3 is proof, not build.** Before writing code, confirm the inherited behaviour: providers are page-root (PatientProfilePage ~L1248), `ChartRailWithEmptyState` is leaf-anchored on `snapshot` (templates.tsx ~L179), `validateLayout` migrates v2→v5 (useShellLayout). Your job is to *prove these hold in the v3 shell under reshaping* and fill any gap.
- **The docks are already placed; keep them sacred.** `CockpitV3Shell` renders `safetyDock`/`actionDock` as `shrink-0` siblings; Phase 2 put the canvas inside `<CockpitDndContext>` with the docks outside. cv3p-01 verifies + tests this; it should not need to move them.
- **Persistence: assert, don't build.** v3 rides `useShellLayout` (P1-DL-1 / P3-DL-3). The migration is `validateLayout`. The one real guard to add is "blank-seed must not clobber a hydrated layout" — `useCockpitV3Layout`'s seed effect already checks `localStorage.getItem(v4Key)`; cv3p-02 proves it.
- **Per-doctor = the stable key.** `storageKey` is a per-route namespace (e.g. `TELEMED_VIDEO_LAYOUT_STORAGE_KEY`), and localStorage is per-browser — so "remember per doctor" is already true. cv3p-02 *locks* V3-Q6 and tests cross-appointment restore; it does not re-key storage.
- **Mobile: reachability is the delta.** The old shell was desktop-dock-only (mobile finish = header CTA). v3's R-MOBILE3 explicitly wants safety + send reachable on mobile — surface them (docks-on-mobile or a pill/sheet), but keep the flat, no-DnD view.
- **Dogfood with the flag on locally**, then make sure your committed `.env*` leaves it off.

---

## References

- [`../plan-p3-cockpit-v3-platform-batch.md`](../plan-p3-cockpit-v3-platform-batch.md) — Phase 3 plan (what + why + P3-DL locks).
- [Phase 2 batch](../p2-dnd/) — docks-outside-DndContext contract this phase tests.
- [Phase 1 batch](../../p1-shell/) — the renderer + docks + `useCockpitV3Layout`.
- [Pane-freedom Phase 4](../../../30-05-2026/cockpit-pane-freedom/p4-chrome/) — the chrome architecture v3 inherits (P4-DL-1..6); cpfg-01 is the close-gate analogue for cv3p-01.
- [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) — wave / lane shape rules (the honest 2-lane split).
- [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules.
