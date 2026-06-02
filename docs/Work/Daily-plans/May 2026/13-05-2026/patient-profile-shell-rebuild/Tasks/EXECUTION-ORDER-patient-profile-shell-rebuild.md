# Patient profile shell rebuild — execution order

> Sibling document of [`plan-patient-profile-shell-rebuild-batch.md`](../plan-patient-profile-shell-rebuild-batch.md). The plan covers *what* and *why*; this doc covers *who-runs-what-when* and *which model*.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md)
**Execution playbook:** [EXECUTION-ORDER-GUIDELINES.md §13.5 — Operating playbook](../../../../../EXECUTION-ORDER-GUIDELINES.md#135-operating-playbook-how-to-execute-a-batch-from-these-docs)
**Planning rules used:** [EXECUTION-ORDER-GUIDELINES.md §0 (lane rule) + §0.5 (wave cuts)](../../../../../EXECUTION-ORDER-GUIDELINES.md)

---

## Wave plan (6 waves, all single-lane sequential)

> **Why all single-lane?** Per the lane rule, a lane is a strictly sequential chain; multiple lanes exist only when their tasks are fully independent of each other for the entire wave. Every wave in this batch has a single convergence task that consumes ≥ 2 prereqs (Wave 1: `ppr-03` needs `ppr-01` + `ppr-02`; Wave 2: `ppr-07` needs `ppr-04` + `ppr-05` + `ppr-06`; Wave 3: `ppr-10` needs `ppr-08` + `ppr-09`; Wave 4.5: each ppr-15 step depends on the prior), so every wave is Shape A (single lane). One chat per wave; run tasks top-to-bottom.
>
> **Note on Wave 4.5:** inserted as a mid-batch amendment after the original Wave 4 (`ppr-11`) surfaced 6 systemic bugs in the strip+chevron collapse model. The model was scrapped; Wave 4.5 ships the toggle-bar redesign that replaces it. See [batch plan § Mid-batch amendment](../plan-patient-profile-shell-rebuild-batch.md#mid-batch-amendment-toggle-bar-redesign-ppr-15) for the rationale.

```
Wave 1 (Foundation — ~1 day, single lane sequential):
  Lane α  ──── ppr-01 (XS, Sonnet 4.6) ──> ppr-02 (S, Sonnet 4.6) ──> ppr-03 (L, Opus 4.7)

Wave 2 (Content panes — ~1 day, single lane sequential):
  Lane α  ──── ppr-04 (M, Sonnet 4.6) ──> ppr-05 (S, Sonnet 4.6) ──> ppr-06 (XS, Sonnet 4.6) ──> ppr-07 (S, Sonnet 4.6)

Wave 3 (State, persistence, presets, hotkeys — ~1 day, single lane sequential):
  Lane α  ──── ppr-08 (S, Sonnet 4.6) ──> ppr-09 (M, Sonnet 4.6) ──> ppr-10 (S, Sonnet 4.6)

Wave 4 (Parity QA — partial pass, ~0.5 day, single lane sequential):
  Lane α  ──── ppr-11 (M, Sonnet 4.6)   [paused mid-pass: Matrix A green; Matrix B/C surfaced collapse-system bugs F4-F9]

Wave 4.5 (Toggle-bar redesign — ~0.5-0.75 day, single lane sequential):
  Lane α  ──── ppr-15a (S, Sonnet 4.6) ──> ppr-15b (M, Sonnet 4.6) ──> ppr-15c (M, Sonnet 4.6) ──> ppr-15d (S, Sonnet 4.6) ──> ppr-15e (S, Sonnet 4.6)

Wave 4.6 (Parity QA re-run — ~0.5 day, single lane sequential):
  Lane α  ──── ppr-11 re-run (no new task id; re-walk the updated matrix)

Wave 5 (Flip + delete — ~1 day spread over a release window, single lane sequential):
  Lane α  ──── ppr-12 (XS, Composer/Sonnet) ──> [ release window ~1 week ] ──> ppr-13 (S, Sonnet 4.6) ──> ppr-14 (S, Sonnet 4.6)
```

**Total wall-clock:** ~6 dev-days + 1 release window (was 5; +0.75 day for Wave 4.5, +0.5 day for the QA re-run).
**Total agent-time (sequential equivalent):** ~6 dev-days. **Zero new Opus tasks** — Wave 4.5 is all Sonnet 4.6 because each step is a tightly-scoped delete/rename/wire job with no novel architecture.

The bottleneck is Wave 2 (4 sequential content-pane tasks) followed by Wave 4.5 (5 sequential redesign tasks). **The redesign is intentionally cut into 5 small Sonnet tasks** so no single task is Opus-tier — the design decisions were locked during the planning conversation, not deferred to the agent. Wave 1 is similarly sequential because `ppr-02` and `ppr-03` both build on `ppr-01`'s route + ESLint zone.

---

## Lane-by-lane details

### Wave 1 — Foundation (single lane sequential)

The most important wave. Wave 1 ships a working shell at `/v2` rendering three coloured `<div>` panes. If Wave 1 is solid, the rest of the batch is mechanical wiring.

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [ppr-01](./task-ppr-01-new-route-and-page-shell.md) | XS | Sonnet 4.6 Medium | `frontend/app/dashboard/appointments/[id]/page.tsx`, `.eslintrc.*` (find the existing config), `frontend/components/consultation/ConsultationCockpit.tsx` (just to copy the auth + fetch + error states pattern) | New route + empty `<PatientProfilePage>` + ESLint `no-restricted-paths` zone. DL-2 enforced from this commit forward. |
| 1 | [ppr-02](./task-ppr-02-pane-definition-and-use-shell-layout.md) | S | Sonnet 4.6 Medium | The source product plan §DL-4 + §DL-7, `frontend/lib/consultation/cockpit-layout.ts` (for reference, NOT copy — the new shape replaces it) | `PaneDefinition` types + `useShellLayout` hook in `frontend/lib/patient-profile/`. Pure types + state. Unit-tested. |
| 2 | [ppr-03](./task-ppr-03-patient-profile-shell.md) | **L** | **Opus 4.7 Thinking-XHigh** | `frontend/components/consultation/ConsultationCockpit.tsx` (current shell — patterns we KEEP: spacer panel, `<ResizablePanelGroup>` wiring, dnd-kit setup, persistence flow), `frontend/components/ui/resizable.tsx`, the source product plan §DL-6 (absorber rule), `@dnd-kit/core` types | The new shell. ~250 LOC target. Renders synthetic `<div>` panes only. Drag, resize, collapse, reorder all work on dummy content. **Pre-load aggressively** — the absorber rule and the dnd activation distance both have prior art that we keep. |

**Branch suggestion:** `feature/ppr-shell-foundation`. Single PR for ppr-01 + ppr-02 + ppr-03.

**Pre-merge gate after ppr-03:** the new shell renders at `/dashboard/appointments/[id]/v2` with three coloured `<div>` panes. Drag a separator → resize. Click chevron → collapse to 40px. Drag a column header onto another → swap. Reload page → layout persists. All four operations work with zero medical content in the tree.

---

### Wave 2 — Content panes (single lane sequential)

All four tasks are one chain because `ppr-07` consumes the outputs of `ppr-04`, `ppr-05`, and `ppr-06`. `ppr-04` establishes the closure-vars → explicit-props extraction pattern; `ppr-05` and `ppr-06` follow it; `ppr-07` wires all three panes into the shell. Earlier drafts split this into two parallel lanes — wrong (see Wave plan note above).

| Step | Task | Size | Pre-load | Notes |
|---|---|---|---|---|
| 0 | [ppr-04](./task-ppr-04-extract-consultation-body-pane.md) | M | `frontend/components/consultation/ConsultationCockpit.tsx` (the `BodyColumnContent` inner function, ~400 LOC starting around line ~1029) | Lift the inner function into `frontend/components/patient-profile/panes/ConsultationBodyPane.tsx`. Props derived from the closure are documented in the task. Both v1 and v2 import the new file. |
| 1 | [ppr-05](./task-ppr-05-extract-rx-pane.md) | S | `frontend/components/consultation/ConsultationCockpit.tsx` (the `RxColumnContent` inner function), the ppr-04 PR / extraction pattern just locked | Same extraction as ppr-04, smaller. Follows the explicit-props convention established by ppr-04. |
| 2 | [ppr-06](./task-ppr-06-patient-chart-pane-wrapper.md) | XS | `frontend/components/ehr/AppointmentChartRail.tsx`, `frontend/components/consultation/cockpit/CollapsedChartRail.tsx` | Thin wrapper + co-located collapsed renderer. ~30 LOC. |
| 3 | [ppr-07](./task-ppr-07-plug-panes-and-header-strip.md) | S | ppr-04 + ppr-05 + ppr-06 output (all three pane modules now exist), `frontend/components/consultation/cockpit/CockpitHeader.tsx`, `frontend/components/consultation/cockpit/CockpitQueueRail.tsx` | Construct the `panes: PaneDefinition[]` array in `<PatientProfilePage>`. Mount `<CockpitHeader>` + `<CockpitQueueRail>` above the shell (reused as-is in Wave 2; rename in Wave 5.2). End-of-step: `/v2` renders real medical content. |

**Branch suggestion:** `feature/ppr-content-panes`. Single PR for ppr-04 + ppr-05 + ppr-06 + ppr-07.

**Pre-merge gate after ppr-07:** `/v2` is functionally indistinguishable from `/v1` for a `ready` state appointment — same patient banner, same chart rail, same Consultation card, same Rx workspace, same drag/resize/collapse/reorder. Hotkeys, presets, and walk-in mode are NOT wired yet (those land in Wave 3).

---

### Wave 3 — State, persistence, presets, hotkeys (single lane sequential)

| Step | Task | Size | Pre-load | Notes |
|---|---|---|---|---|
| 0 | [ppr-08](./task-ppr-08-layout-module-and-localstorage-seed.md) | S | `frontend/lib/consultation/cockpit-layout.ts` (reference for `validateLayout` shape, NOT copy) | New `frontend/lib/patient-profile/layout.ts` with the v2 shape. One-time seed reader: on first v2 load, parse old localStorage keys and write to `patient-profile:v1:layout`. Mark seed done. |
| 1 | [ppr-09](./task-ppr-09-preset-translation-and-apply.md) | M | `frontend/hooks/useCockpitPresets.ts`, `backend/migrations/099_doctor_cockpit_layout_presets.sql`, `frontend/lib/consultation/cockpit-layout.ts` (BUILT_IN_PRESETS) | Built-in presets re-authored in v2 shape. Pure translation helper `translateLegacyPreset()`. `usePatientProfilePresets` calls the same backend endpoint; new writes tagged `version: 2`. v1-shape rows translated on read. |
| 2 | [ppr-10](./task-ppr-10-hotkeys-and-walkin-mode.md) | S | `frontend/hooks/useCockpitHotkeys.ts`, the source product plan §DL-11 (walk-in branch) | Hotkeys ported to slot-positional shell setters. Walk-in branch via `panes.filter()`. |

**Branch suggestion:** `feature/ppr-state-and-presets`. Single PR for ppr-08 + ppr-09 + ppr-10.

**Pre-merge gate after ppr-10:** apply each built-in preset (menu + hotkey). Save a custom preset on `/v1` first; switch to `/v2`; preset shows up and applies. Open a walk-in appointment on `/v2`; chart column is absent, two panes resize/collapse normally.

---

### Wave 4 — Parity QA, partial pass (single lane)

| Step | Task | Size | Pre-load | Notes |
|---|---|---|---|---|
| 0 | [ppr-11](./task-ppr-11-parity-qa-matrix.md) | M | The whole task file IS the QA checklist | Walk every cell of the 6 × 3 × 6 matrix on both `/v1` and `/v2`. Mobile parity. Drag/resize/collapse/preset smoke. **Status: paused after Matrix A green + F1/F2 fixes.** Matrix B/C exposed 6 systemic collapse-model bugs → Wave 4.5 replaces the model. **Resume in Wave 4.6 against the updated matrix.** |

**Branch suggestion:** the F1/F2 fixes already merged on the main `feature/ppr-content-panes` branch. Wave 4.5 ships under `feature/ppr-toggle-bar-redesign`.

**Pre-merge gate after ppr-11 (this partial pass):** Matrix A all green, F1/F2 entries marked Yes in the failure log, F4-F9 entries marked "superseded by ppr-15".

---

### Wave 4.5 — Toggle-bar redesign (single lane sequential)

The redesign that replaces the strip+chevron+absorber+spacer collapse model with a toggle-bar visibility model. Inserted mid-batch after ppr-11 surfaced the model's structural bugs. Each sub-task is intentionally tight so the whole wave is Sonnet 4.6.

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [ppr-15a](./task-ppr-15a-schema-migration.md) | S | Sonnet 4.6 Medium | `frontend/lib/patient-profile/types.ts`, `frontend/lib/patient-profile/useShellLayout.ts`, the existing useShellLayout test file | Pure type renames + storage migration (`collapsed` → `hidden`, `version: 2` → `version: 3`, add `icon?: LucideIcon`). No visual change. |
| 1 | [ppr-15b](./task-ppr-15b-pane-toggle-bar.md) | M | Sonnet 4.6 Medium | `frontend/components/consultation/cockpit/MobilePillBar.tsx` (the desktop bar mirrors this pattern), `frontend/lib/patient-profile/types.ts` (post-15a) | Standalone `<PaneToggleBar>` component: drag-reorder, click-to-toggle, ARIA, dnd-kit. Not mounted yet. |
| 2 | [ppr-15c](./task-ppr-15c-shell-slim.md) | M | Sonnet 4.6 Medium | `frontend/components/patient-profile/Shell.tsx`, `frontend/components/patient-profile/PaneToggleBar.tsx` (output of 15b), `frontend/components/patient-profile/PatientProfilePage.tsx`, `frontend/components/consultation/cockpit/CockpitHeader.tsx` | Slim `<PatientProfileShell>` (delete ~190 LOC: strips, chevrons, absorber, spacer, drag-lock). Add `centerSlot` prop on `<CockpitHeader>`. Mount toggle bar in `<PatientProfilePage>`. The cut-over. |
| 3 | [ppr-15d](./task-ppr-15d-presets-and-hotkeys.md) | S | Sonnet 4.6 Medium | `frontend/lib/patient-profile/built-in-presets.ts`, `frontend/hooks/useShellHotkeys.ts` | Re-author 3 built-in presets as full snapshots. Reinterpret `[`/`]` as hide-leftmost / hide-rightmost. Add `Cmd/Ctrl+1/2/3` toggles. |
| 4 | [ppr-15e](./task-ppr-15e-live-consult-guard.md) | S | Sonnet 4.6 Medium | `frontend/components/patient-profile/PatientProfilePage.tsx`, `frontend/components/ui/alert-dialog.tsx`, `task-ppr-11-parity-qa-matrix.md` | Live-consult warning dialog when hiding Consultation pane during a `live` appointment. Update ppr-11's matrix + failure log. Add follow-ups to capture/inbox.md. |

**Branch suggestion:** `feature/ppr-toggle-bar-redesign`. Single PR for ppr-15a + ppr-15b + ppr-15c + ppr-15d + ppr-15e.

**Pre-merge gate after ppr-15e:**
- [ ] Toggle bar visible in `<CockpitHeader>` center slot at lg+; click each pill toggles its pane visible/hidden.
- [ ] Drag a toggle icon onto another → both panes (and their icons) reorder in lockstep.
- [ ] Hide all 3 panes → empty-state with "Pick a panel..." note + arrow.
- [ ] Re-show a pane → restores its persisted size; others rebalance to `sum = 100`.
- [ ] No 40px strips visible anywhere in the layout.
- [ ] No chevrons in `<PaneHeader>`. Header is `[grip] Title` only.
- [ ] Apply each built-in preset → visibility + sizes apply correctly.
- [ ] `Cmd/Ctrl+Shift+1/2/3` apply presets; `Cmd/Ctrl+1/2/3` toggle visibility; `[`/`]` hide leftmost/rightmost.
- [ ] Live-consult warning fires when clicking Body pill during a `live` appointment; does NOT fire on hotkey/preset path.
- [ ] `pnpm --filter frontend tsc --noEmit` clean. `pnpm --filter frontend lint` clean.
- [ ] All Wave 4 + Wave 3 + earlier gates still green (the partial pass of ppr-11 still passes).

---

### Wave 4.6 — Parity QA re-run (single lane)

| Step | Task | Size | Pre-load | Notes |
|---|---|---|---|---|
| 0 | ppr-11 re-run (no new id) | S | Updated [`task-ppr-11-parity-qa-matrix.md`](./task-ppr-11-parity-qa-matrix.md) (post-15e) | Walk Matrices A through H of the updated matrix. ~30-45 min — most cells short-circuit because Matrix A already passed and Matrix B/C/D/E/G semantics are now verified by the toggle-bar's own tests. |

**Branch suggestion:** none unless re-run finds a fix-needed cell.

**Pre-merge gate after Wave 4.6:** every cell of the updated parity matrix is green. Any new failure log entries are marked with their fix task and re-routed.

---

### Wave 5 — Flip and delete (release window required)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [ppr-12](./task-ppr-12-flip-default-and-escape-hatch.md) | XS | Composer 2 Fast (or Sonnet) | `frontend/app/dashboard/appointments/[id]/page.tsx` | Replace `<ConsultationCockpit>` with `<PatientProfilePage>` (default). Add `?v1=1` branch. Delete the `/v2/page.tsx` file (its content moves into the canonical route). |
| ⏸ | **[ Release window — ~1 week of prod use ]** | — | — | — | **Hold ppr-13 and ppr-14 until any `?v1=1`-induced complaints settle.** If `?v1=1` traffic > 1% of cockpit loads, investigate before deleting. |
| 1 | [ppr-13](./task-ppr-13-rename-green-grade-files.md) | S | Sonnet 4.6 Medium | The DL-12 file list in the source product plan | Pure renames + import updates. `cockpit-state.ts` → `patient-profile/state.ts`, `CockpitHeader` → `PatientProfileHeader`, `useCockpitHotkeys` → `useShellHotkeys`, etc. No behaviour change. |
| 2 | [ppr-14](./task-ppr-14-delete-old-shell-and-cleanup.md) | S | Sonnet 4.6 Medium | `frontend/components/consultation/ConsultationCockpit.tsx`, `frontend/lib/consultation/cockpit-layout.ts`, the four obsoleted helpers, the `?cockpitDbg=1` references | `git rm` the old shell + 4 helpers + `cockpit-layout.ts`. Remove the `?v1=1` branch. Remove debug instrumentation. Tick off inbox L278 + L280. Resolve git-status leftovers (`RxRailToggle.tsx`, `WalkInQuickModal.tsx`). |

**Branch suggestion:** `feature/ppr-flip-default` (ppr-12 alone, merged before the window starts). `chore/ppr-delete-old-shell` (ppr-13 + ppr-14 stacked, merged after the window).

**Final gate (after ppr-14):** `rg "ConsultationCockpit" frontend/` returns zero results. `rg "COCKPIT_DBG" frontend/` returns zero results. `pnpm --filter frontend tsc --noEmit` clean. Net diff across the whole batch ≥ −3,000 LOC.

---

## Per-task model picks

Per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

| Task | Size | Recommended model | Why |
|---|---|---|---|
| ppr-01 | XS | Sonnet 4.6 Medium | New route + scaffold + ESLint zone. Pattern matches existing routes. |
| ppr-02 | S | Sonnet 4.6 Medium | Types + a hook. Tight spec from DL-4 + DL-7. |
| **ppr-03** | **L** | **Opus 4.7 Thinking-XHigh** | **The new shell. Absorber rule + dnd-kit reorder + collapse-to-40px + spacer panel + persistence + 6 permutations × 4 collapse states. High judgment cost. Comparable blast radius to cc-04.** |
| ppr-04 | M | Sonnet 4.6 Medium | Hoist a 400-LOC inner function. Tedious but mechanical — props are listed in the task file. |
| ppr-05 | S | Sonnet 4.6 Medium | Same as ppr-04, smaller. |
| ppr-06 | XS | Sonnet 4.6 Medium | ~30-LOC wrapper. |
| ppr-07 | S | Sonnet 4.6 Medium | Wire the panes array + mount the header strip. |
| ppr-08 | S | Sonnet 4.6 Medium | New module + storage seed. Pure functions, easy to test. |
| ppr-09 | M | Sonnet 4.6 Medium | Translation helper + hook + version-tagged writes. Test fixtures for the helper are listed in the task. |
| ppr-10 | S | Sonnet 4.6 Medium | Re-wire two existing hooks + a filter. |
| ppr-11 | M | Sonnet 4.6 Medium | Mostly a manual QA walkthrough. Any code fixes that drop out of QA bump back to the affected task. **Note:** initial pass found 6 systemic collapse-system bugs that triggered Wave 4.5; re-run after Wave 4.5 against the updated matrix. |
| **ppr-15a** | **S** | **Sonnet 4.6 Medium** | **Pure rename + storage migration. No visual change. Auditable v2→v3 branch in `validateLayout`.** |
| **ppr-15b** | **M** | **Sonnet 4.6 Medium** | **New `<PaneToggleBar>` component. Mirrors `<MobilePillBar>` pattern, dnd-kit reorder, ARIA. Standalone — not mounted yet.** |
| **ppr-15c** | **M** | **Sonnet 4.6 Medium** | **Slim `<PatientProfileShell>` (delete strips/chevrons/absorber/spacer/drag-lock). Mount toggle bar via new `centerSlot` prop on `<CockpitHeader>`. Mostly DELETE; ~10 LOC ADD.** |
| **ppr-15d** | **S** | **Sonnet 4.6 Medium** | **Re-author 3 built-in presets as full snapshots; reinterpret `[`/`]`; add `Cmd/Ctrl+1/2/3` toggles. Self-contained.** |
| **ppr-15e** | **S** | **Sonnet 4.6 Medium** | **Live-consult guard dialog + ppr-11 matrix update + capture/inbox.md follow-ups. Closes the wave.** |
| ppr-12 | XS | Composer 2 Fast or Sonnet | 10-line page.tsx edit. |
| ppr-13 | S | Sonnet 4.6 Medium | ~40 import-path updates across the codebase. `pnpm tsc` is the verification. |
| ppr-14 | S | Sonnet 4.6 Medium | `git rm` + import cleanup + inbox.md tick-off. **Now also deletes** `RailCollapsedStub`, `CollapsedChartRail`, `CollapsedRxRail` (no longer referenced after Wave 4.5 deleted the strip render path on v2 and ppr-14 deletes the v1 shell). |

---

## Acceptance gates per wave

### Wave 1 gate (after ppr-03)

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean — specifically the ppr-01 ESLint zone passes (Shell.tsx has no forbidden imports).
- [ ] `/dashboard/appointments/[id]/v2` renders three coloured `<div>` panes side-by-side.
- [ ] Drag a separator: panes resize.
- [ ] Click a column header chevron: pane collapses to 40px; adjacent pane absorbs.
- [ ] Drag one column header onto another: panes swap. Reload: order persists.
- [ ] Collapse all three panes: three 40px strips on the left, spacer fills the remainder.

### Wave 2 gate (after ppr-07)

- [ ] All Wave 1 gates still green.
- [ ] `/v2` renders the real medical surfaces — chart rail content visible, Consultation card visible (with ConsultationLauncher in `ready` state), Rx workspace visible.
- [ ] Walk-in appointment (no `patient_id`) on `/v2`: chart pane absent, two panes only.
- [ ] `/v1` still works identically (the extractions in ppr-04/05 are import-level, no behaviour change).

### Wave 3 gate (after ppr-10)

- [ ] All Wave 2 gates still green.
- [ ] All three built-in presets apply via menu and via `Cmd/Ctrl+Shift+1/2/3`.
- [ ] Save a custom preset on `/v1`; reload `/v2`; preset appears in the menu and applies correctly.
- [ ] Hotkeys `[` and `]` collapse left and right panes regardless of which column type is there.
- [ ] `Cmd/Ctrl+Enter` sends Rx. `Cmd/Ctrl+Shift+Enter` opens wrap-up.

### Wave 4 gate (after ppr-11, partial pass)

- [ ] Matrix A all green for every cell.
- [ ] F1 (squeezed layout) and F2 (doubled chart header) entries marked Yes in the failure log.
- [ ] F4-F9 (collapse-system bugs) entries marked "superseded by ppr-15" in the failure log.
- [ ] Mobile parity verified on a `<lg` viewport for at least one full session (ready → live → wrap_up → ended).
- [ ] No regression on any `cs-NN` / `cc-NN` / `pf-NN` automated test.

### Wave 4.5 gate (after ppr-15e)

- [ ] All Wave 4 (partial) gates still green.
- [ ] Toggle bar visible in `<CockpitHeader>` center slot at lg+; click each pill toggles its pane visible/hidden with correct `aria-pressed`.
- [ ] Drag a toggle icon onto another → both panes (and their icons) reorder in lockstep with the shell's column order.
- [ ] Hide all 3 panes → empty-state with "Pick a panel..." note + arrow.
- [ ] Re-show a pane → restores its persisted size; others rebalance to `sum = 100` (no gap to viewport edge).
- [ ] No 40px collapsed strips visible anywhere in the layout.
- [ ] No chevrons in `<PaneHeader>`. Header is `[grip] Title` only.
- [ ] Apply each built-in preset (Triage / Consult / Document) → visibility + sizes apply correctly, regardless of prior visible set.
- [ ] `Cmd/Ctrl+Shift+1/2/3` apply presets; `Cmd/Ctrl+1/2/3` toggle visibility; `[`/`]` hide leftmost/rightmost.
- [ ] Live-consult warning fires when clicking Consultation pill during a `live` appointment; "Keep visible" cancels, "Hide anyway" hides.
- [ ] Live-consult warning does NOT fire on hotkey or preset path (deliberate carve-out, documented).
- [ ] `pnpm --filter frontend tsc --noEmit` clean. `pnpm --filter frontend lint` clean. `pnpm --filter frontend vitest run` all green.

### Wave 4.6 gate (after ppr-11 re-run)

- [ ] All Wave 4.5 gates still green.
- [ ] Every cell of the UPDATED parity matrix (Matrices A, B, C, D, E, G, H — F removed, H added) is green.
- [ ] Mobile parity re-verified.

### Wave 5 gate (after ppr-14)

- [ ] `/dashboard/appointments/[id]` renders the new shell by default.
- [ ] `?v1=1` query parameter is gone (removed in ppr-14).
- [ ] `rg "ConsultationCockpit" frontend/` returns zero results.
- [ ] `rg "COCKPIT_DBG" frontend/` returns zero results.
- [ ] `rg "cockpit-layout.ts" frontend/` returns zero results.
- [ ] Net diff for the whole batch ≥ −3,000 LOC.
- [ ] [inbox.md L278 + L280](../../../../capture/inbox.md) ticked off.

---

## Cost estimate

| Wave | Tasks | Sonnet 4.6 chats | Opus 4.7 chats | Wall-clock |
|---|---|---|---|---|
| Wave 1 | ppr-01, 02, 03 | 2 | 1 (ppr-03) | ~6h (sequential) |
| Wave 2 | ppr-04, 05, 06, 07 | 4 (or 3 if 05+06 stitch into one chat) | 0 | ~7h (sequential) |
| Wave 3 | ppr-08, 09, 10 | 3 | 0 | ~6h (sequential) |
| Wave 4 | ppr-11 (partial pass) | 1 | 0 | ~3h (manual QA — paused after Matrix A + F1/F2) |
| **Wave 4.5** | **ppr-15a, 15b, 15c, 15d, 15e** | **5** | **0** | **~5-6h (single PR, sequential)** |
| Wave 4.6 | ppr-11 (re-run) | 1 | 0 | ~30-45 min (re-walk updated matrix) |
| Wave 5 | ppr-12, 13, 14 | 2 (Composer for ppr-12) | 0 | ~3h spread over a release window |

Comparable to `cockpit-customization` (14 tasks, 1 Opus); single Opus task (`ppr-03`) replaces `cc-04` in structural-cost rank. **Wave 4.5 adds 5 Sonnet chats and zero Opus** — the design decisions were locked in conversation, not deferred to the agent. Per the Opus cap (`≤ 1 per wave`, `≤ 2 per batch`), the batch still carries only 1 Opus task end-to-end.

### Efficiency notes (per the user's "focus on efficiency" ask)

- **Single PR per wave.** Wave 4.5 stacks ppr-15a → 15e on `feature/ppr-toggle-bar-redesign`. One review round, one merge.
- **Each ppr-15 step is a fresh chat.** Smaller context windows + cleaner state. Don't carry one chat across all five.
- **Pre-load list on every task is exhaustive.** Agent doesn't need to grep around for context.
- **No new Opus.** ppr-15c is the largest sub-task (~190 LOC delete + ~30 LOC add) but it's structurally subtractive — Sonnet handles deletes well.
- **Tests written alongside code, not after.** Each ppr-15 task ships its own test cases in the same PR.
- **Re-use existing infrastructure.** `<MobilePillBar>` provides the visual pattern; dnd-kit + `<ResizablePanelGroup>` are already in the tree; `<AlertDialog>` is design-system. Zero new dependencies.

---

## References

- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules and chat heuristics.
- [Product plans/plan-patient-profile-shell-rebuild.md](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md) — source product plan.
- Style precedent: [`cockpit-customization/Tasks/EXECUTION-ORDER-cockpit-customization.md`](../../../10-05-2026/cockpit-customization/Tasks/EXECUTION-ORDER-cockpit-customization.md) — sibling exec-order doc from the prior batch.
- Cross-day:
  - [Daily-plans/May 2026/10-05-2026/cockpit-customization/Tasks/task-cc-04-cockpit-layout-slot-state.md](../../../10-05-2026/cockpit-customization/Tasks/task-cc-04-cockpit-layout-slot-state.md) — the structural task this rebuild replaces. Anti-pattern reference.
