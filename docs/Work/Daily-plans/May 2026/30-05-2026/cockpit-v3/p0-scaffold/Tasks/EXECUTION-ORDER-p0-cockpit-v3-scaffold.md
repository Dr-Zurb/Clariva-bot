# Cockpit v3 — Phase 0 (scaffold) execution order — 30 May 2026 batch

> **Sibling plan doc:** [`../plan-p0-cockpit-v3-scaffold-batch.md`](../plan-p0-cockpit-v3-scaffold-batch.md). The plan answers "what + why" + how Phase 0 de-risks the v3 program; this doc answers "who-runs-what-when" + which model.
>
> **Source plan:** [`Product plans/plan-cockpit-v3.md`](../../../../../../Product%20plans/plan-cockpit-v3.md) — Phase 0 (Scaffold) of §Sequencing.
>
> **Authoring conventions:** [`docs/Work/process/EXECUTION-ORDER-GUIDELINES.md`](../../../../../EXECUTION-ORDER-GUIDELINES.md).
>
> **Cost-aware model strategy:** [`docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md). TL;DR: zero Opus tasks; one Auto (cv3s-01) + one Composer 2 Fast (cv3s-02). No close-gate review — flag-off is byte-identical to today.
>
> **Phase scope:** This doc covers **Phase 0 only** — the scaffold. No user-visible cockpit change ships in this batch.

---

## Wave plan (1 wave)

```
Wave 1 (Scaffold — ~2-4h, two near-independent tasks):
  Lane α  ──── cv3s-01 (S, Auto)          flag + parallel mount + v3 stub
  Lane β  ──── cv3s-02 (XS, Composer 2)    foundation boundary + isolation test
```

**Total wall-clock with parallelism:** ~2–3h (the two tasks share only the new `v3/` directory and can run concurrently).
**Total agent-time (sequential equivalent):** ~2–4h.

There is no real critical path — neither task blocks the other to *complete*. cv3s-01 is sequenced first only because the stub is the batch's visible artifact (it confirms the parallel mount end-to-end), and Phase 1 will later import cv3s-02's `foundation.ts` into the stub. If running one lane, do cv3s-01 → cv3s-02.

---

## Lane-by-lane details

### Wave 1 / Lane α — Feature flag + parallel mount + v3 stub

**Goal:** A `NEXT_PUBLIC_COCKPIT_V3` flag, a guarded branch at the shell mount, and a labelled `CockpitV3Shell` stub that renders the real safety/action docks around a placeholder (desktop) / a flat placeholder (mobile).

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [cv3s-01](./task-cv3s-01-feature-flag-and-parallel-mount.md) | S | Auto | `PatientProfilePage.tsx` (shell mount ~1124 + provider stack), `Shell.tsx` (`useMediaQuery` pattern + dock props), `.env.example`, `api-base.ts` (flag pattern) | Additive + flag-gated. Flag-off path must be a no-op (P0-DL-1). |

**Acceptance gate (Lane α close):**

- [x] `NEXT_PUBLIC_COCKPIT_V3` in `.env.example`; `cockpitV3Enabled()` helper reads it.
- [x] `PatientProfilePage` branches the mount: flag-on → `CockpitV3Shell`, flag-off → `PatientProfileShell`; identical props.
- [x] Flag-off: byte-identical to today (P0-DL-1).
- [x] Flag-on desktop: labelled stub + `SafetyStickyStrip` (top) + `PlanActionFooter` (bottom) docks (P0-DL-3).
- [x] Flag-on mobile: flat placeholder, no docks (v3-DL-8).
- [x] Stub imports nothing from `Shell.tsx` / `customize-mode-context` (P0-DL-4).
- [x] `npx tsc --noEmit` + lint clean.

### Wave 1 / Lane β — Foundation boundary + reuse audit

**Goal:** A single `foundation.ts` import surface re-exporting the kept model/engine/types/icons, and an isolation test that exercises the engine importing only via that surface — proving v3-DL-1 mechanically.

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [cv3s-02](./task-cv3s-02-foundation-boundary-and-reuse-audit.md) | XS | Composer 2 Fast | `layout-tree.ts` (exports), `layout-tree-mutations.ts` (engine + caps), `types.ts` (`PaneDefinition`), `pane-icons.ts` | Re-export only; no logic. Test builds tree → split → tab → activate → cap-refusal → round-trip. |

**Acceptance gate (Lane β close):**

- [x] `frontend/lib/patient-profile/v3/foundation.ts` re-exports the kept surface (model + engine + caps + `PaneDefinition` + helpers + icons).
- [x] `foundation.ts` imports nothing from `Shell.tsx` / `customize-mode-context` / `CustomizeBar` / `PaneDropOverlay` (P0-DL-4).
- [x] Isolation test green: build → `dropPaneIntoZone(east)` → 2 columns; `addToTabsNode` → tab; `setActiveTab`; leaf-cap refusal; serialise/deserialise round-trip.
- [x] Kept/new/deleted inventory (plan §Reuse audit) confirmed accurate.
- [x] `npx tsc --noEmit` + lint + the new test clean.

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| cv3s-01 | S | Auto | A guarded additive branch in a large file + a small stub component. Mechanical, but touches `PatientProfilePage.tsx`, so Auto (not Composer) for the read-and-place judgement. Flag-off no-op = no consult risk. |
| cv3s-02 | XS | Composer 2 Fast | A re-export barrel + a deterministic isolation test against an already-tested pure engine. No judgement-heavy code. |

**Caps check:** zero Opus build tasks (≤1/wave, ≤2/batch satisfied trivially). No close-gate review turn.

---

## Critical path

None binding. `cv3s-01 ∥ cv3s-02` (parallel) → batch close. Single-engineer wall-clock ~2–4h sequential, ~2–3h with both lanes.

---

## Anti-goals

- ❌ Don't build any real editor-group rendering, DnD, or palette — that's Phase 1+ (P0-DL-2). The mount renders a **stub**.
- ❌ Don't take the v3 branch when the flag is off — flag-off must be byte-identical to today (P0-DL-1).
- ❌ Don't edit `layout-tree.ts` / `layout-tree-mutations.ts` / `types.ts` / `panes/*` / any migration (P0-DL-5).
- ❌ Don't import `Shell.tsx` / `customize-mode-context` / `CustomizeBar` / old `PaneDropOverlay` from any `v3/` file (P0-DL-4).
- ❌ Don't render docks on the mobile stub branch (v3-DL-8 / P0-DL-3 desktop-only).
- ❌ Don't add a per-doctor `cockpit_v3` setting yet — env flag only this phase (V3-Q7 fast-follow).
- ❌ Don't update `COCKPIT.md` — nothing user-visible ships (flag off).

---

## Notes for the executor

- **Branch off `main`** (pane-freedom Phases 1–4 merged). Phase 0 is purely additive behind the flag.
- **The flag-off path is your safety net — keep it a true no-op.** The branch should be `cockpitV3Enabled() ? <CockpitV3Shell …/> : <PatientProfileShell …/>`. When the flag is off, `CockpitV3Shell` is never rendered, so even a broken stub can't affect production.
- **Docks work in the stub because providers are already page-root.** `RxFormProvider` / `RxSafetyProvider` / `RxFormActionsBridgeProvider` wrap `pageContent` (pane-freedom Phase 4). The stub is mounted inside `pageContent`, so passing the same `safetyDock` / `actionDock` elements renders a live safety strip + footer with no provider work.
- **Mirror the shell's media query for the desktop/mobile split** (`useMediaQuery("(min-width: 1024px)")`) so the stub falls back flat on mobile without docks.
- **`foundation.ts` is a barrel, not a wrapper.** Re-export the kept symbols verbatim (`export { … } from "…"`, `export type { … } from "…"`). Don't re-implement or rename — the point is a stable *import path*, not a new API.
- **The isolation test is the proof of v3-DL-1.** It must import only from `foundation.ts` (not from the underlying files), so a future accidental dependency on the old shell would surface as a failing/awkward import here.

---

## References

- [`../plan-p0-cockpit-v3-scaffold-batch.md`](../plan-p0-cockpit-v3-scaffold-batch.md) — Phase 0 plan (what + why + decision lock + reuse audit).
- [`Product plans/plan-cockpit-v3.md`](../../../../../../Product%20plans/plan-cockpit-v3.md) — v3 product plan (v3-DL-1..10, phasing).
- [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../EXECUTION-ORDER-GUIDELINES.md) — wave / lane shape rules.
- [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules.
- Tasks: [cv3s-01](./task-cv3s-01-feature-flag-and-parallel-mount.md) · [cv3s-02](./task-cv3s-02-foundation-boundary-and-reuse-audit.md)
