# 09 May 2026 — Daily plans

Two batches landed on this day. They're filed in sibling subfolders so each batch keeps a self-contained plan + `Tasks/` tree.

| Folder | Batch | Status | What it covers |
|---|---|---|---|
| [`cockpit-polish/`](./cockpit-polish/) | **Cockpit polish** (cp-01 … cp-09) | Shipped 2026-05-09 — partial regressions surfaced | Queue-pipeline sort fix, prev/now/next 3-chip strip, walk-in feature removal, follow-up-Rx surface cleanup, mark-no-show parity across every modality, two-row patient identity header backed by a doctor-scoped demographics widening on the appointment payload. |
| [`cockpit-shell-redesign/`](./cockpit-shell-redesign/) | **Cockpit shell redesign** (cs-01 … cs-11) | Drafted 2026-05-09 (active) | Resolves the layout regressions surfaced after `cockpit-polish` shipped: sticky-offset drift causing overlap, the chart-rail toggle bleeding into the rail boundary, the `Mark no-show` button rendered inside a `<p>`, and the structural gap that pushes the page into a single long scroll. Replaces the page-scroll + sticky shell with **fixed-height, three-column, independently-scrolling, resizable panes** so the consultation room stays visible while the doctor scrolls a long Rx. |

## Why two batches in one day

`cockpit-polish` was scoped from the 2026-05-09 morning screenshot review. It shipped the same afternoon. When the user retested, the *task-level* changes were correct, but two structural side-effects emerged:

1. **Sticky-offset drift.** `task-cp-09` made `CockpitHeader` ~24px taller (two-row patient identity). The `CockpitQueueRail`, `AppointmentChartRail`, and `RxRailToggle` sticky offsets were never recalibrated, so they now overlap the new header.
2. **The single-page-scroll model itself is the bug.** Once the prescription form gets long, the doctor has to scroll the *page*, which moves the consultation room out of view. The user explicitly asked for "all three major columns interchangeable and adjustable in width, independent of each other in vertical scroll" so the patient stays visible no matter how long the Rx grows.

Both fall outside the cp-NN scope. They get their own batch (`cockpit-shell-redesign`) so the previous work isn't conflated with the architectural follow-up.

## How to start

If you're picking up `cockpit-shell-redesign`:

1. Read [`cockpit-shell-redesign/plan-cockpit-shell-redesign-batch.md`](./cockpit-shell-redesign/plan-cockpit-shell-redesign-batch.md) once.
2. Open [`cockpit-shell-redesign/Tasks/EXECUTION-ORDER-cockpit-shell-redesign.md`](./cockpit-shell-redesign/Tasks/EXECUTION-ORDER-cockpit-shell-redesign.md) for the lane matrix + model picks.
3. Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md): start a fresh chat per task unless tasks are explicitly stitched.

If you're auditing `cockpit-polish` (already shipped):

1. The plan is in [`cockpit-polish/plan-cockpit-polish-batch.md`](./cockpit-polish/plan-cockpit-polish-batch.md).
2. The exec order + lane matrix is in [`cockpit-polish/Tasks/EXECUTION-ORDER-cockpit-polish.md`](./cockpit-polish/Tasks/EXECUTION-ORDER-cockpit-polish.md).
3. The 9 task specs (`cp-01` … `cp-09`) are alongside the exec order.

## Cross-day predecessors

- [Daily-plans/May 2026/06-05-2026/plan-cockpit-redesign-batch.md](../06-05-2026/plan-cockpit-redesign-batch.md) — original cockpit redesign that introduced the state machine + sticky shell `cockpit-shell-redesign` is now refactoring.
- [Daily-plans/May 2026/07-05-2026/plan-patient-flow-batch.md](../07-05-2026/plan-patient-flow-batch.md) — auto-advance + walk-in fast path. `cockpit-polish/cp-01` fixes the auto-advance regression; `cockpit-polish/cp-03` removes the walk-in surfaces.
- [Daily-plans/May 2026/08-05-2026/plan-opd-queue-redesign-batch.md](../08-05-2026/plan-opd-queue-redesign-batch.md) — OPD queue page redesign; the cockpit `Open` deep-link target.
