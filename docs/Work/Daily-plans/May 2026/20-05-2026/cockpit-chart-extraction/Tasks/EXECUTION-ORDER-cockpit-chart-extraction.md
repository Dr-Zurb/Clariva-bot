# cockpit-chart-extraction — R-CHART — execution order

> Sibling document of [`plan-cockpit-chart-extraction-batch.md`](../plan-cockpit-chart-extraction-batch.md). The plan covers what and why; this doc covers who-runs-what-when and which model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

**Wave / lane / shape conventions:** [EXECUTION-ORDER-GUIDELINES.md](../../../../../EXECUTION-ORDER-GUIDELINES.md)

**Execution playbook:** [EXECUTION-ORDER-GUIDELINES.md §13.5 — Operating playbook](../../../../../EXECUTION-ORDER-GUIDELINES.md#135-operating-playbook-how-to-execute-a-batch-from-these-docs)

**Master roadmap:** [`plan-cockpit-v2-execution-roadmap.md`](../../../../Product%20plans/plan-cockpit-v2-execution-roadmap.md). Read this before planning the next cockpit-v2 batch.

---

## Wave plan (4 waves)

```
Wave 1 (Side-sheet primitive — ~3h, single lane sequential):
  Lane α  ──── cce-01 (S, Auto)

Wave 2 (Snapshot + History panes — ~4h with parallelism, ~7h sequential):
  Lane α  ──── cce-02 (S, Auto)               [SnapshotPane]
  Lane β  ──── cce-03 (M, Auto)               [HistoryPane + VisitDetailSideSheet]

Wave 3 (Templates wiring — ~1h, single lane sequential):
  Lane α  ──── cce-04 (XS, Composer 2 Fast)

Wave 4 (Verification + close-out — ~1h, single lane sequential):
  Lane α  ──── cce-05 (XS, Composer 2 Fast)
```

**Total wall-clock with parallelism:** ~9h (~1.5 dev-days for two engineers in Wave 2 lanes).

**Total agent-time (sequential equivalent):** ~12h (~1.5 dev-days for one engineer running every lane back-to-back).

The bottleneck is **Wave 2 — Shape B parallel — because cce-03 (HistoryPane + side sheet) is M-sized and the longer of the two parallel lanes**. Lane α (cce-02 SnapshotPane) is S and finishes first; the engineer on Lane α has spare cycles to pre-read cce-04's wiring diff for Wave 3.

**Why Shape B (parallel) lanes in Wave 2 is legitimate:**

- Lane α (`cce-02` SnapshotPane) lives entirely in `frontend/components/patient-profile/panes/SnapshotPane.tsx` (new file). Lane β (`cce-03` HistoryPane + VisitDetailSideSheet) lives entirely in `frontend/components/patient-profile/panes/HistoryPane.tsx` (new file) + `frontend/components/patient-profile/side-sheets/VisitDetailSideSheet.tsx` (new file). The §5 lane gate passes all six points:
  - **§5.1** Either lane can run in a separate chat from t=0 of Wave 2 (both consume cce-01's `useSideSheet` framework which is already shipped before Wave 2 starts).
  - **§5.2** Disjoint files (separate new files under `panes/` + `side-sheets/`).
  - **§5.3 / §5.4** Neither lane consumes the other's WIP mid-wave; both consume only cce-01's framework.
  - **§5.5** No task in Wave 2 consumes outputs from both lanes — the lanes only converge at the wave's acceptance gate.
  - **§5.6** Lane α ≈ 2-3h (cce-02), Lane β ≈ 3-4h (cce-03). Both ≥ 1h.

**Why Wave 1, Wave 3, Wave 4 are single-lane:** Wave 1 ships the shared primitive both Wave 2 lanes consume — no parallelism possible. Wave 3 has one task. Wave 4 has one task.

**Why no Opus tasks:** None of the five tasks meet the AGENT-EXECUTION-EFFICIENCY-GUIDE hard-rules thresholds. cce-01 (side-sheet primitive) is the closest call, but it's a small (~80 LOC) implementation of a contract cv2-09 already designed. Per-message escalation to Opus on cce-01 only if Auto stalls on the `useSideSheet` registry pattern.

---

## Lane-by-lane details

### Wave 1 — Side-sheet primitive (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [cce-01](./task-cce-01-side-sheet-host-primitive.md) | S | Auto | `frontend/lib/patient-profile/aux-surfaces.ts` (the cv2-09 side-sheet contract — read its `SideSheetDefinition` interface), `frontend/components/patient-profile/PatientProfileShell.tsx` (the mount point — read where the recursive shell renders the pane grid), `frontend/components/ui/dialog.tsx` (the existing shadcn dialog primitive — possibly reused for the backdrop + portal), `docs/Work/Daily-plans/May 2026/17-05-2026/cockpit-v2/Tasks/task-cv2-09-aux-surface-contracts.md` (the contract task — read its acceptance criteria), source plan §R-FUTURE-PROOFING/2 (side-sheet contract spec). | Implement `useSideSheet()` hook (React Context + a queue/replace registry) and `<SideSheetHost>` component. Mount `<SideSheetHost>` inside `<PatientProfileShell>` as a sibling to the pane grid (not inside any pane). Right-edge slide-in (480px fixed width). `Esc` + backdrop + close button to dismiss. Single-sheet semantic (replace, don't stack). `canDock` honored at type level only — host always behaves as fixed-width in v1. Build a tiny smoke route (`/dashboard/_dev/side-sheet-smoke/page.tsx`, deleted by cce-05 close-out) that opens and closes a stub sheet to verify the primitive in isolation. |

**Branch suggestion:** `feature/cockpit-chart-extraction-side-sheet`. Single PR for cce-01.

### Wave 2 — Snapshot + History panes (2 parallel lanes — Shape B)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 (Lane α) | [cce-02](./task-cce-02-snapshot-pane.md) | S | Auto | `frontend/components/ehr/PatientChartPanel.tsx` (the existing 5-section panel — read top to bottom), `frontend/components/ehr/sections/AllergiesSection.tsx`, `ChronicConditionsSection.tsx`, `ProblemListSection.tsx`, `VitalsSection.tsx`, `PreviousRxSection.tsx` (the section components — read for prop shapes; identify which support `mode="readonly"` already), `frontend/components/patient-profile/panes/PatientChartPane.tsx` (the existing wrapper to be replaced in csf-03's `snapshot` leaf), source plan §R-CHART (line 283 — Snapshot subset). | New `frontend/components/patient-profile/panes/SnapshotPane.tsx`. Renders `<PatientChartPanel>` with a section subset: Allergies, Chronic conditions, Problem list, Vitals (limited to last 3 readings — pass `?limit=3` query param to `listVitals` via the existing section), Current medications (subset of `PreviousRxSection` showing only active Rxs from the most recent visit; if `PreviousRxSection` doesn't already filter to "active only", extend it with an optional `filter` prop in this task). Pane chrome: scrollable; each section read-only. ~80-120 LOC. |
| 0 (Lane β) | [cce-03](./task-cce-03-history-pane-and-visit-detail-sheet.md) | M | Auto | post-cce-01 — the side-sheet primitive, `frontend/lib/api/prescriptions.ts` (or wherever `listPrescriptions` / similar lives — task identifies the existing endpoint and the wrapper), `frontend/types/prescription.ts` (the Rx record shape — read for the read-only fields the side sheet renders), `frontend/components/ui/card.tsx` (visit card visual primitive), `frontend/components/ui/scroll-area.tsx` (Radix scroll for the history list), `frontend/components/ehr/sections/PreviousRxSection.tsx` (visual reference for past-Rx rendering — do not import; build fresh per DL-2), source plan §R-CHART. | Two new files. (1) `frontend/components/patient-profile/panes/HistoryPane.tsx` — fetches past prescriptions for the appointment's patient via the existing `listPrescriptions` endpoint, renders them as compact cards (date, CC, working Dx, medicines count). Most-recent-first order. Click → `useSideSheet().open({ id: 'visit-detail', title: 'Visit detail · {date}', content: <VisitDetailSideSheet rxId={...} />, defaultWidth: 480, canDock: false })`. (2) `frontend/components/patient-profile/side-sheets/VisitDetailSideSheet.tsx` — fetches the full Rx by id via `getPrescription(rxId, token)` and renders all DL-24 fields read-only: CC, HOPI, Vitals (structured), Examination, Provisional Dx, Differential Dx, Investigations Orders, Medicines (full row info), Advice, Follow-up (n + unit), Test Results. ~150-200 LOC across both files. |

**Branch suggestion:** `feature/cockpit-chart-extraction-snapshot` (Lane α) and `feature/cockpit-chart-extraction-history` (Lane β), both stacked on Wave 1's branch. Merge to `feature/cockpit-chart-extraction-main` at the wave gate; Wave 3 stacks on the merged branch.

### Wave 3 — Templates wiring (single lane sequential)

**⚠️ Cross-batch dependency:** Wave 3 is gated on the [`cockpit-shell-flip`](../../../19-05-2026/cockpit-shell-flip/) batch's csf-04 (production cutover) being merged. cce-04 modifies `templates.tsx` which csf-02 + csf-03 also write. Stack Wave 3 on the merged `cockpit-shell-flip-cutover` branch (or whatever the csf-* final merge branch is named).

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [cce-04](./task-cce-04-wire-snapshot-history-into-templates.md) | XS | **Composer 2 Fast** | post-csf-04 (merged `cockpit-shell-flip-cutover` branch — `templates.tsx` post-flip), post-cce-02 + cce-03 (the two new pane components + side sheet), `frontend/lib/patient-profile/templates.tsx` (the file being edited), source plan §R-CHART. | In `getTelemedVideoTemplate(ctx)`: replace `snapshot` leaf's `<PatientChartPane>` render with `<SnapshotPane appointment={ctx.appointment} token={ctx.token} hideHeader />`; replace `history` leaf's `<PanePlaceholder>` with `<HistoryPane appointment={ctx.appointment} token={ctx.token} hideHeader />`. Update top-of-file JSDoc and the pane-id → R-item mapping comment (history is no longer "deferred"; it's "real"). Verify `rg "<PanePlaceholder" frontend/lib/patient-profile/templates.tsx` returns exactly 1 match (only Investigations placeholder remains; will be filled by R-MIDDLE follow-up batch). ~10 LOC delta. |

**Branch suggestion:** `feature/cockpit-chart-extraction-cutover` stacked on the merged csf-* + cockpit-chart-extraction-main branches.

### Wave 4 — Verification + close-out (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [cce-05](./task-cce-05-verification-and-close-out.md) | XS | **Composer 2 Fast** | All Wave 1–3 task files, `docs/Reference/product/cockpit/COCKPIT.md` (the doc to update), `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md` (R-CHART status → ✅ DONE; batch ledger entry; next-batch pointer), `docs/Work/capture/inbox.md` (Phase 3 follow-ups). | Run smoke matrix per plan-batch's cross-cutting gate. tsc + lint + build. Wire telemetry event `cockpit_v2.r_chart_landed` (one-shot per session, same pattern as csf-06's `phase2_shell_flipped`). Update `COCKPIT.md`. Update execution roadmap (R-CHART → ✅ DONE; batch ledger row; next-batch recommended = `cockpit-ribbon`). Capture-inbox: 3 lines for side-sheet docking, Previous-Rx side sheet (R-RX-POLISH/4.x), History pane filter chips. Delete the `_dev/side-sheet-smoke` route from cce-01 if it still exists. |

**Branch suggestion:** Wave 4 stacks on Wave 3's branch and is the final commit on `feature/cockpit-chart-extraction-main` before merge.

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| cce-01 | S | Auto | Side-sheet host implementation. ~80 LOC. The `useSideSheet` registry pattern is well-established (React Context + a setter + dismiss handlers). Mount inside `<PatientProfileShell>` is a direct application of the existing aux-surfaces contract. |
| cce-02 | S | Auto | Configuration of the existing `<PatientChartPanel>` with a section subset. ~80-120 LOC. The trickiest bit is the "current medications" subset of `PreviousRxSection` — task adds an optional `filter` prop if the section doesn't already support it. Bounded; the rest is reuse. |
| cce-03 | M | Auto | List + card + side-sheet content. ~150-200 LOC across two files. The visit-detail rendering is straightforward (read-only labeled blocks). The trickiest bit is the past-Rx fetch — task identifies the existing endpoint or proposes a new one if needed (likely already exists). Per-message escalation to Opus only if a backend extension is needed. |
| cce-04 | XS | **Composer 2 Fast** | Two leaf-render swaps in `templates.tsx`. ~10 LOC delta. Composer's sweet spot per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md` § Tier 4](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md#tier-4--composer-2-fast-use-heavily-15-25-of-turns). |
| cce-05 | XS | **Composer 2 Fast** | Manual smoke + doc updates + roadmap update + telemetry wiring + capture-inbox. Composer's sweet spot. |

**Opus caps:** ≤ 1 per wave (zero — under the cap on every wave). ≤ 2 per batch (zero — well under the cap). The natural escalation candidate (cce-01 if the `useSideSheet` registry surfaces an unforeseen lifecycle issue) has a clean fallback: build the registry as a simple `useState`-backed singleton; per-message escalation to Opus on cce-01 only if Auto stalls on the React-Context-vs-useState choice.

---

## Acceptance gates per wave

### Wave 1 gate (after cce-01)

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] `frontend/components/patient-profile/SideSheetHost.tsx` exists and exports `<SideSheetHost />` (default export) + named `useSideSheet()` hook.
- [ ] `<SideSheetHost>` is mounted inside `<PatientProfileShell>` (verify via `rg "<SideSheetHost" frontend/components/patient-profile/PatientProfileShell.tsx` returns 1 match).
- [ ] **Smoke at the dev-only route** `/dashboard/_dev/side-sheet-smoke/page.tsx`: clicking the test button opens a stub sheet from the right edge; `Esc` dismisses; backdrop click dismisses; explicit close button dismisses. No console errors.
- [ ] **Single-sheet semantic** — opening a second sheet while one is open replaces the first (no stacking). React DevTools confirms exactly one `<SideSheetHost>` rendering one sheet body.
- [ ] **Type-level cv2-09 contract honored** — the `useSideSheet().open(...)` parameter type is `SideSheetDefinition` from `aux-surfaces.ts` (or a `Pick`/`Omit` of it documented in cce-01's task notes).

### Wave 2 gate (after cce-02 + cce-03)

- [ ] All Wave 1 gates still green.
- [ ] `frontend/components/patient-profile/panes/SnapshotPane.tsx` exists (default export); ~80-120 LOC; renders Allergies / Chronic / Problems / Vitals (last 3) / Current meds.
- [ ] `frontend/components/patient-profile/panes/HistoryPane.tsx` exists (default export); ~80-120 LOC; renders a list of past Rx cards most-recent-first.
- [ ] `frontend/components/patient-profile/side-sheets/VisitDetailSideSheet.tsx` exists (default export); ~80-120 LOC; renders all DL-24 Rx fields read-only when given a `rxId`.
- [ ] **Smoke render at a dev-only route** (or a Storybook entry; task picks): mount `<SnapshotPane>` and `<HistoryPane>` in a fixture page with a real patient + token; verify Snapshot shows the chart sections and History shows past visit cards. Click a card → side sheet opens with the right Rx detail.
- [ ] **No regression in cce-01's smoke** — the dev-only side-sheet smoke route still works (cce-02 + cce-03 don't break the framework).

### Wave 3 gate (after cce-04)

- [ ] All Wave 2 gates still green.
- [ ] `/dashboard/appointments/[id]` (post-csf-* + post-cce-04) renders Snapshot + History as separate scrollable leaves in the left column. No `<PanePlaceholder>` visible in the left column.
- [ ] **Both placeholders that csf-03 left in the tree are now reduced to 1** — `rg "<PanePlaceholder" frontend/lib/patient-profile/templates.tsx` returns exactly 1 match (Investigations only).
- [ ] **Click-to-expand visit card** opens the side sheet from the right edge with the full Rx detail. `Esc` / backdrop / close button all dismiss.
- [ ] Drag handles work at the new History leaf (cv2-01 already proved this; this gate confirms it survives the wiring).
- [ ] Layout persists across reloads under the existing `patient-profile:v2:telemed-video-layout` storage key (no new key — the tree shape is the same; only the leaf renderers changed).
- [ ] `pnpm --filter frontend tsc --noEmit` + `pnpm --filter frontend lint` + `pnpm --filter frontend build` all clean.

### Wave 4 gate — batch close-gate (after cce-05)

- [ ] All Wave 3 gates still green.
- [ ] **Cross-cutting acceptance gate** (from [`plan-cockpit-chart-extraction-batch.md` § Cross-cutting acceptance gate](../plan-cockpit-chart-extraction-batch.md#cross-cutting-acceptance-gate-whole-batch)) all green:
  - Structural: Snapshot real, History real, click → side sheet, single-sheet semantic, walk-in unchanged, mobile unchanged.
  - Form parity: side sheets don't break provider tree; autosave timer unaffected.
  - Quality: tsc/lint/build clean; no new Sentry errors in 5-min smoke; telemetry fires once; sheet open within 300ms.
- [ ] **Telemetry event** `cockpit_v2.r_chart_landed` fires exactly once during cce-05's first appointment-detail mount post-merge.
- [ ] **`docs/Work/capture/inbox.md` updated** with three follow-up lines (side-sheet docking; Previous-Rx side sheet R-RX-POLISH/4.x; History filter chips).
- [ ] **`docs/Reference/product/cockpit/COCKPIT.md` updated** with the chart-pane Snapshot+History split + side-sheet host diagram.
- [ ] **[`plan-cockpit-v2-execution-roadmap.md`](../../../../Product%20plans/plan-cockpit-v2-execution-roadmap.md) updated** — R-CHART status set to ✅ DONE; batch ledger row for cockpit-chart-extraction marked ✅ shipped; next-batch pointer updated to recommend `cockpit-ribbon`; changelog entry appended.
- [ ] **Optional Opus close-gate review** — one fresh Opus 4.7 Extra High chat with the full Wave 1–4 diff grading against the cross-cutting gate. Skip if every deterministic check above passes cleanly.

---

## Cost estimate

| Wave | Tasks | Auto chats | Composer 2 chats | Opus 4.7 chats | Wall-clock (parallelism) | Wall-clock (sequential) |
|---|---|---|---|---|---|---|
| Wave 1 | cce-01 | 1/1 | 0/1 | 0/1 | ~3h | ~3h |
| Wave 2 | cce-02 + cce-03 | 2/2 | 0/2 | 0/2 | **~4h (parallel — Shape B)** | ~7h |
| Wave 3 | cce-04 | 0/1 | 1/1 | 0/1 | ~1h | ~1h |
| Wave 4 | cce-05 | 0/1 | 1/1 | 0/1 | ~1h | ~1h |
| **Total** | **5** | **3** | **2** | **0** | **~9h (~1.5 dev-days)** | **~12h (~1.5 dev-days)** |

Token estimate (rough): ~150k input / ~100k output across the batch. Total batch spend (excluding optional close-gate review): ~$8-12.

**One optional Opus close-gate turn after cce-05** budgeted on top. Skip if the deterministic gates pass cleanly.

---

## References

- [plan-cockpit-chart-extraction-batch.md](../plan-cockpit-chart-extraction-batch.md) — the *what / why* sibling.
- [Product plans/plan-cockpit-v2.md §R-CHART](../../../../Product%20plans/plan-cockpit-v2.md) — source product spec; this batch's scope locks against §R-CHART line 283.
- [Product plans/plan-cockpit-v2-execution-roadmap.md](../../../../Product%20plans/plan-cockpit-v2-execution-roadmap.md) — master tracker.
- [Daily-plans/May 2026/19-05-2026/cockpit-shell-flip/Tasks/EXECUTION-ORDER-cockpit-shell-flip.md](../../../19-05-2026/cockpit-shell-flip/Tasks/EXECUTION-ORDER-cockpit-shell-flip.md) — predecessor exec-order; the batch this one stacks on.
- [Daily-plans/May 2026/17-05-2026/cockpit-v2/Tasks/task-cv2-09-aux-surface-contracts.md](../../../17-05-2026/cockpit-v2/Tasks/task-cv2-09-aux-surface-contracts.md) — the side-sheet contract this batch implements.
- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules; this batch sits entirely below the hard-rules list.
- [EXECUTION-ORDER-GUIDELINES.md](../../../../../EXECUTION-ORDER-GUIDELINES.md) — wave / lane / shape rules used to draft this doc.
