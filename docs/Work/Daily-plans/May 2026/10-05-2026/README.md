# 10 May 2026 — Daily plans

One batch landed (or is landing) on this day, filed in a self-contained subfolder with its own plan + `Tasks/` tree.

| Folder | Batch | Status | What it covers |
|---|---|---|---|
| [`cockpit-customization/`](./cockpit-customization/) | **Cockpit customization** (cc-01 … cc-14) | Drafted 2026-05-10 (active) | Customizes the fixed-height resizable shell that yesterday's `cockpit-shell-redesign` batch shipped. Adds: uniform column headers, full slot-based column reorder (drag + dropdown menu), slot-based collapsibility (middle = always-on, sides = collapsible), backend-synced layout presets (3 built-ins + up to 5 custom), and a wider per-column-aware collapsed-rail stub (section-icon stack for chart, peek-text strip for Rx). Also fixes the duplicate "Patient chart" heading and the chart-rail chevron's "way out" position from yesterday's surface report. |

## Why this batch follows yesterday

Yesterday's [`cockpit-shell-redesign`](../09-05-2026/cockpit-shell-redesign/) batch shipped the structural switch from page-scroll-with-sticky to fixed-height + per-column-scroll + drag-resizable columns. When the user retested:

1. Two **cosmetic regressions** surfaced — duplicate "Patient chart" heading (cs-05's new in-flow header didn't replace `<PatientChartPanel>`'s own `<h2>`) and the chart-rail chevron sitting visually adrift between the rail and the resize handle.
2. The user explicitly asked for **column reorder** ("any column can have space left right or middle") — a feature deliberately deferred from yesterday because the cs-08 panel API supports collapse + resize but not reorder.
3. The user asked for **layout presets** — named templates the doctor can save and recall. Cross-device sync requested (so they get a backend table, not just localStorage).
4. The user flagged the **collapsed-rail stub** as too cramped to be useful — should be wider and content-aware.

All of the above falls outside the cs-NN scope. They get their own batch (`cockpit-customization`) so yesterday's structural work isn't conflated with today's customization layer.

## How to start

If you're picking up `cockpit-customization`:

1. Read [`cockpit-customization/plan-cockpit-customization-batch.md`](./cockpit-customization/plan-cockpit-customization-batch.md) once.
2. Open [`cockpit-customization/Tasks/EXECUTION-ORDER-cockpit-customization.md`](./cockpit-customization/Tasks/EXECUTION-ORDER-cockpit-customization.md) for the lane matrix + model picks.
3. Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md): start a fresh chat per task unless tasks are explicitly stitched (cc-02 + cc-03 in Wave 2 are stitched; cc-13 is stitched onto cc-12 in the same Wave-5 chat).

## Cross-day predecessors

- [Daily-plans/May 2026/09-05-2026/cockpit-shell-redesign/plan-cockpit-shell-redesign-batch.md](../09-05-2026/cockpit-shell-redesign/plan-cockpit-shell-redesign-batch.md) — yesterday's structural switch this batch customizes.
- [Daily-plans/May 2026/09-05-2026/cockpit-polish/plan-cockpit-polish-batch.md](../09-05-2026/cockpit-polish/plan-cockpit-polish-batch.md) — yesterday's morning polish batch (the source of the two-row header that cs-01 then re-calibrated).
- [Daily-plans/May 2026/06-05-2026/plan-cockpit-redesign-batch.md](../06-05-2026/plan-cockpit-redesign-batch.md) — original cockpit redesign that introduced the state machine + sticky shell.
