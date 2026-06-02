# Cockpit v3 — Phase 0: scaffold (feature flag + parallel mount + foundation boundary) — 30 May 2026 batch plan

> **Phase 0 of the Cockpit v3 program — the scaffold.** This batch ships **no user-visible cockpit change**. It stands up the parallel surface that every later phase builds inside: an off-by-default feature flag, a flag-gated v3 mount point next to today's shell, a stub v3 shell that proves the chrome-dock boundary, and an explicit "kept foundation" import boundary that mechanically enforces the reuse decision (v3-DL-1).
>
> **Source plan:** [`Product plans/plan-cockpit-v3.md`](../../../../../Product%20plans/plan-cockpit-v3.md) — the v3 product plan (north star, v3-DL-1..10, R-items, phasing). This batch promotes **Phase 0 (Scaffold)** of that plan's §Sequencing. Phases 1–4 promote to their own dated batches later.
>
> **Prefix note:** tasks are `cv3s-*` (`cv3` = cockpit v3, `s` = scaffold). Later phases take their own prefixes (e.g. shell, dnd, cutover) following the pane-freedom convention of one prefix per phase batch.
>
> **Relationship to the shipped cockpit:** v3 supersedes the pane-freedom *interaction layer* (customize mode + the 5-zone overlay) but **reuses its model + mutation engine wholesale** (v3-DL-1). Nothing the cockpit-v2 program or the pane-freedom program (Phases 1–4) shipped is touched in Phase 0 — this batch is purely additive and flag-gated.
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). Zero Opus tasks. One Auto (cv3s-01) + one Composer 2 Fast (cv3s-02). No close-gate review needed — flag-off is byte-identical to today, so there is no consult-critical surface in this batch.
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-p0-cockpit-v3-scaffold.md`](./Tasks/EXECUTION-ORDER-p0-cockpit-v3-scaffold.md).

---

## What Phase 0 does (one sentence)

> **Stand up a `NEXT_PUBLIC_COCKPIT_V3`-gated parallel mount that renders a labelled v3 stub (with the real safety/action docks already around it) instead of today's shell, plus a `foundation.ts` boundary module + isolation test proving the kept layout model + mutation engine work with zero dependency on the old `Shell.tsx` — so Phase 1 has a safe, empty room to build the real editor-group shell in.**

Phase 0 builds *nothing the doctor sees by default*. Its entire job is to make Phases 1–4 safe and fast:

| Deliverable | Why it exists |
|---|---|
| `NEXT_PUBLIC_COCKPIT_V3` env flag (off by default) | The Strangler Fig switch (v3-DL-9). Flag-off → today's cockpit, byte-identical. |
| Flag-gated mount branch in `PatientProfilePage.tsx` | The parallel route. v3 grows behind it; the live cockpit is never broken. |
| `CockpitV3Shell` stub + `v3/` directory | The empty room Phase 1 fills. Proves the mount, providers, and docks line up before any real shell exists. |
| Anchored safety + action docks around the stub | Proves v3-DL-6 (clinical chrome lives outside the pane area) from day one — the hardest constraint, locked first. |
| `foundation.ts` boundary + isolation test | Mechanically enforces v3-DL-1: v3 imports the kept model/engine/types from one surface and never reaches into the old shell. |

---

## What's already in place (so the scope stays tiny)

The investigation found Phase 0 is a few small additive files because the surrounding plumbing already exists:

- **Feature flags here are just `NEXT_PUBLIC_*` env vars** (`frontend/lib/api-base.ts`, `frontend/.env.example`). There is no flag service to wire — a one-line `cockpitV3Enabled()` helper reading `process.env.NEXT_PUBLIC_COCKPIT_V3` matches the repo's existing pattern exactly.
- **The shell mounts at a single point** — `PatientProfilePage.tsx` line ~1124 renders `<PatientProfileShell … />` inside `pageContent`. The v3 branch is one `if` at that mount; everything around it (providers, ribbon, dialogs) is untouched.
- **The Rx providers are already page-root** (`RxFormProvider` / `RxSafetyProvider` / `RxFormActionsBridgeProvider`, lifted in pane-freedom Phase 4). So a stub mounted at the same spot already has the context the safety strip + action footer need — the docks work in the stub with **no provider move**.
- **Desktop/mobile selection is internal to the shell** (`Shell.tsx` `useMediaQuery("(min-width: 1024px)")`, ~line 501). The stub reuses the same hook so it falls back flat on mobile (v3-DL-8) for free.
- **The kept model is already pure + JSON-serialisable** (`layout-tree.ts`, `layout-tree-mutations.ts`) — it has no dependency on `Shell.tsx`, so the isolation test in cv3s-02 just imports and exercises it; nothing has to be extracted first.

Net new surface area: **one env var, one flag helper, one stub component, one guarded mount branch, one boundary barrel, one isolation test.** No model change, no schema change, no migration, no change to any pane body.

---

## Decision lock

The product plan's **v3-DL-1 .. v3-DL-10** carry forward unchanged (see [`plan-cockpit-v3.md` §Decision locks](../../../../../Product%20plans/plan-cockpit-v3.md#decision-locks-v3-dl-1--v3-dl-10)). This batch is especially bound by **v3-DL-1 (reuse the engine)**, **v3-DL-6 (anchored safety chrome)**, **v3-DL-8 (mobile flat)**, and **v3-DL-9 (parallel + flag)**.

These five are **Phase-0-specific** decisions, frozen for this batch:

**P0-DL-1: One env flag gates everything; off by default.** `NEXT_PUBLIC_COCKPIT_V3` (truthy = `"1"`). When unset/falsy, the patient profile renders today's cockpit **byte-identically** — no branch is taken, no v3 code runs in the render path. This resolves **V3-Q7** *for Phase 0*: the rollout gate is an env flag for dogfood; a per-doctor opt-in setting is deferred to a later phase (when v3 is feature-complete enough to offer).

**P0-DL-2: Stub only — no real shell.** The v3 mount renders a clearly-labelled placeholder ("Cockpit v3 — scaffold"). There is **no** editor-group rendering, **no** drag-and-drop, **no** pane palette in Phase 0. Those are Phase 1+. Shipping a stub (not a half-built shell) keeps the flag flippable for dogfood without risking a broken consult surface.

**P0-DL-3: Docks from day one.** Even the stub renders the anchored `SafetyStickyStrip` (top) and `PlanActionFooter` (bottom) as `shrink-0` siblings around its placeholder body, desktop-only — exactly the dock geometry the real shell will use. This proves **v3-DL-6** (clinical chrome lives outside the rearrangeable pane area) before the pane area exists, so the hardest safety constraint is validated first, not retrofitted last.

**P0-DL-4: `foundation.ts` is the only import surface into the kept code.** All v3 code imports the kept model (`PaneTreeNode` + helpers), mutation engine, `PaneDefinition`, and pane icons via `frontend/lib/patient-profile/v3/foundation.ts`. v3 code **never** imports `Shell.tsx`, `customize-mode-context`, `CustomizeBar`, or the old `PaneDropOverlay`. This makes **v3-DL-1** mechanical: the boundary module *is* the kept/rewrite line, and the isolation test proves the engine runs without the old shell.

**P0-DL-5: Zero model / schema / pane change.** Phase 0 adds files, one env line, and one guarded branch. It does **not** edit `layout-tree.ts`, `layout-tree-mutations.ts`, `types.ts`, any file under `panes/`, or any migration. Persistence stays on the existing `PaneTreeNode` shape (v3-DL-10) — Phase 0 doesn't read or write it yet.

---

## Why this batch (Phase 0 specifically)

The product plan frames v3 as a "rewrite," and the instinct on a rewrite is to start typing the new shell. Phase 0 deliberately resists that for three reasons:

1. **It de-risks the whole program in ~half a day.** The single biggest risk (v3-R1: "rewrite balloons in scope") is bounded by the parallel-flag pattern — but only if the flag + parallel mount actually exist *first*. Standing them up before any shell code means every later phase is additive behind a switch that is off in production, so a half-finished Phase 2 can never reach a real consult.

2. **It validates the two hardest constraints before they cost anything.** v3-DL-6 (safety chrome can't be hidden) and v3-DL-1 (don't rewrite the engine) are the two decisions most expensive to get wrong late. P0-DL-3 proves the dock geometry with a stub; P0-DL-4 + the isolation test prove the kept engine runs standalone. Both are cheap now and load-bearing forever.

3. **It gives Phase 1 a clean contract, not a blank page.** When Phase 1 starts, it has: a place to mount (`CockpitV3Shell`), a stable import surface (`foundation.ts`), and a proven dock layout. The rewrite becomes "fill in the renderer," not "figure out where everything plugs in."

This batch closes Phase 0 with **2 tasks in 1 wave**, **~2–4h wall-clock single-engineer**, **zero migrations, zero backend changes, zero model changes, zero Opus tasks**. The visible artifact at the close-gate: with `NEXT_PUBLIC_COCKPIT_V3` unset the cockpit is unchanged; with it set, the patient profile shows the labelled v3 stub between a working safety strip and a working "Send Rx & finish" footer — and the isolation test proves the kept mutation engine builds columns, tabs, and enforces caps without importing a single line of the old shell.

---

## Cross-cutting acceptance gate (whole batch)

All must be green before the batch is closed.

### Feature flag + parallel mount (cv3s-01)

- [ ] `NEXT_PUBLIC_COCKPIT_V3` documented in `frontend/.env.example`; a `cockpitV3Enabled()` helper reads it (truthy = `"1"`).
- [ ] `PatientProfilePage.tsx` branches at the shell mount (~line 1124): flag-on → `<CockpitV3Shell …>`; flag-off → today's `<PatientProfileShell …>`. Same props (`panes`, `storageKey`, docks) passed to both.
- [ ] **Flag-off: zero diff from today** (P0-DL-1) — no v3 import is evaluated in the render path; existing cockpit behaviour byte-identical.
- [ ] Flag-on (desktop): the patient profile shows the labelled "Cockpit v3 — scaffold" placeholder with `SafetyStickyStrip` pinned above it and `PlanActionFooter` pinned below it (P0-DL-3).
- [ ] Flag-on (mobile `<lg`): a simple flat placeholder, no docks (v3-DL-8 / P0-DL-3 desktop-only).
- [ ] `CockpitV3Shell` lives under `frontend/components/patient-profile/v3/`; it does not import `Shell.tsx` / `customize-mode-context` (P0-DL-4).

### Foundation boundary + reuse audit (cv3s-02)

- [x] `frontend/lib/patient-profile/v3/foundation.ts` re-exports the kept surface: `PaneTreeNode` + `serialiseTree` / `deserialiseTree` / `isValidTreeNode` / `upgradeV4LeavesToV5` (from `layout-tree.ts`); the mutation engine + cap constants (from `layout-tree-mutations.ts`); `PaneDefinition` + `flattenPaneDefinitions` (from `types.ts`); pane icons.
- [x] `foundation.ts` imports **nothing** from `Shell.tsx`, `customize-mode-context.tsx`, `CustomizeBar.tsx`, or `PaneDropOverlay.tsx` (P0-DL-4 / v3-DL-1).
- [x] Isolation test (`v3/__tests__/foundation.test.ts`) imports **only** via `foundation.ts` and: builds a tree, splits east → 2 columns, tabs a pane in (`center`/`addToTabsNode`), sets the active tab, hits the leaf cap and asserts the refusal, and round-trips serialise/deserialise. All green.
- [x] The kept/new/deleted inventory below is confirmed accurate (the audit).

### Behaviour + quality

- [ ] `cd frontend; npx tsc --noEmit` clean.
- [ ] `cd frontend; npm run lint` clean (warnings only).
- [ ] New Phase 0 tests green (`foundation.test.ts` + any stub render test). Full `npm test` may still hang on the pre-existing `useShellLayout` / `Shell.test.tsx` issue (inbox `[cpf-04 follow-up]`) — run targeted suites.
- [ ] No new migration, no backend change, no edit to `layout-tree*.ts` / `types.ts` / `panes/*` (P0-DL-5).

### Documentation

- [ ] `docs/Work/capture/inbox.md` gains a line noting Phase 0 shipped + the deferred per-doctor opt-in setting (V3-Q7 fast-follow).
- [ ] **No `COCKPIT.md` change** — there is no user-visible behaviour to document yet (the flag is off). `COCKPIT.md` updates at the Phase 4 cutover.

---

## Reuse audit — kept / new / deleted inventory (confirmed in cv3s-02)

The contract line v3 is built on. Phase 0 establishes it; later phases obey it.

| Status | Files | Notes |
|---|---|---|
| 🟢 **Kept** | `layout-tree.ts`, `layout-tree-mutations.ts`, `types.ts`, `pane-icons.ts` (via `foundation.ts`); `find-pane-tree-leaf-metadata.ts`, `telemetry.ts`, all of `panes/*` (direct import when needed) | The model, the pure mutation engine, the `PaneDefinition` contract, the pane bodies. **Not rewritten** (v3-DL-1). |
| 🆕 **New (Phase 0 creates the shells of these)** | `frontend/components/patient-profile/v3/CockpitV3Shell.tsx` (stub), `frontend/lib/patient-profile/v3/foundation.ts`, `frontend/lib/patient-profile/v3/flags.ts`, `frontend/lib/patient-profile/v3/__tests__/foundation.test.ts` | Phase 1+ fill `CockpitV3Shell` with the real recursive editor-group renderer. |
| 🟡 **Touched (Phase 0)** | `frontend/components/patient-profile/PatientProfilePage.tsx` (one guarded branch), `frontend/.env.example` (one line) | Additive only; flag-off is a no-op. |
| 🗑️ **Deleted (at Phase 4 cutover — NOT now)** | `Shell.tsx` (desktop path), `customize-mode-context.tsx`, `CustomizeBar.tsx`, old `PaneDropOverlay.tsx`, template pre-fill path | Listed for orientation; Phase 0 deletes nothing. |

---

## Phase plan position

This is **Phase 0 of 5 (Scaffold)** in the Cockpit v3 program. The full ladder (from [`plan-cockpit-v3.md` §Sequencing](../../../../../Product%20plans/plan-cockpit-v3.md#sequencing)):

| Phase | Scope | Status |
|---|---|---|
| **Phase 0** | **Scaffold: feature flag + parallel mount + foundation boundary** | ▶ This batch (cv3s-01..02) |
| Phase 1 | Core shell: editor-group renderer + pane palette (R-SHELL3, R-PALETTE) | Pending |
| Phase 2 | Interaction: Cursor-style always-on drag/drop (R-DND3) | Pending |
| Phase 3 | Safety + platform: anchored chrome, persistence reuse, mobile (R-CHROME3, R-PERSIST3, R-MOBILE3) | Pending |
| Phase 4 | Cutover: parity, flag flip, delete old (R-CUTOVER) | Pending |

---

## Out-of-scope (rolled forward)

| Out-of-scope item | Where it lands |
|---|---|
| The real editor-group renderer + always-on tabs | Phase 1 (R-SHELL3) |
| The pane palette / blank-canvas build-up | Phase 1 (R-PALETTE) |
| Cursor-style drag/drop overlay | Phase 2 (R-DND3) |
| Per-doctor `cockpit_v3` opt-in setting (vs env flag) | Later phase / fast-follow once dogfood-ready (V3-Q7) |
| Default seed layout | Deferred (V3-Q1) — explicitly "blank for now" |
| Any read/write of persisted `PaneTreeNode` | Phase 1+ (Phase 0 doesn't hydrate the stub) |
| Deleting the old shell / customize mode | Phase 4 (R-CUTOVER) |
| Any `COCKPIT.md` user-facing doc change | Phase 4 (nothing user-visible until cutover) |

---

## Cost estimate

| Wave | Tasks | Auto | Composer 2 | Opus | Wall-clock |
|---|---|---|---|---|---|
| Wave 1 | cv3s-01, cv3s-02 | 1/2 | 1/2 | 0/2 | ~2–4h |
| **Total** | **2** | **1** | **1** | **0** | **~2–4h (~0.5 dev-day)** |

Token estimate (rough): ~60k input / ~30k output. No Opus close-gate — flag-off is a no-op, so there is no consult-critical, silent-breakage surface in this batch.

---

## Sequencing notes (the why behind the wave)

- **Single wave, two near-independent tasks.** cv3s-01 (flag + mount + stub) touches `PatientProfilePage.tsx` + new `v3/` UI files; cv3s-02 (foundation barrel + test) touches new `v3/` lib files. They share only the new `v3/` directory and can run in either order; cv3s-01 is listed first because the stub is the visible artifact that confirms the parallel mount, and Phase 1 will import `foundation.ts` into `CockpitV3Shell`.
- **No Opus build tasks** per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md): no PHI, no RLS, no migration, no novel security, no mutation of persisted state (the flag-off path is untouched; the flag-on path is a stub). The one file of any weight (`PatientProfilePage.tsx`) gets only a guarded additive branch.

---

## References

- **Source:** [`Product plans/plan-cockpit-v3.md`](../../../../../Product%20plans/plan-cockpit-v3.md) — the v3 product plan (v3-DL-1..10, R-items, phasing).
- [`frontend/components/patient-profile/PatientProfilePage.tsx`](../../../../../../frontend/components/patient-profile/PatientProfilePage.tsx) — the shell mount (~line 1124) the flag branches; page-root provider stack (gives the stub's docks their context).
- [`frontend/components/patient-profile/Shell.tsx`](../../../../../../frontend/components/patient-profile/Shell.tsx) — today's shell (kept, flag-off path); `useMediaQuery` desktop/mobile pattern the stub mirrors.
- [`frontend/lib/patient-profile/layout-tree.ts`](../../../../../../frontend/lib/patient-profile/layout-tree.ts) + [`layout-tree-mutations.ts`](../../../../../../frontend/lib/patient-profile/layout-tree-mutations.ts) — the kept model + engine `foundation.ts` re-exports + the isolation test exercises.
- [`frontend/lib/patient-profile/types.ts`](../../../../../../frontend/lib/patient-profile/types.ts) — the `PaneDefinition` contract (kept).
- [`frontend/lib/api-base.ts`](../../../../../../frontend/lib/api-base.ts) + [`frontend/.env.example`](../../../../../../frontend/.env.example) — the `NEXT_PUBLIC_*` flag pattern cv3s-01 follows.
- [`docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules.
- [`docs/Work/process/EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md) — wave / lane shape rules.
- Sibling: [`Tasks/EXECUTION-ORDER-p0-cockpit-v3-scaffold.md`](./Tasks/EXECUTION-ORDER-p0-cockpit-v3-scaffold.md) — wave / lane matrix.

---

**Created:** 2026-05-30.  
**Status:** `Committed` (Phase 0 of the v3 program; promoted from the product plan).  
**Closes:** when both cv3s tasks' acceptance gates are green and the cross-cutting gate above passes.  
**Next phase:** Phase 1 — Core shell (R-SHELL3 + R-PALETTE), promoted to its own batch after this one lands.
