# Plan p1 — Cockpit density: focus mode

## 31 Aug 2026 — Batch `cockpit-density` / `p1-focus-mode` (`ckd-01..04`)

> **Status:** **In progress.** Decision lock is in [`../README.md`](../README.md).
> **Exec order:** [`Tasks/EXECUTION-ORDER-p1-cockpit-density-focus-mode.md`](./Tasks/EXECUTION-ORDER-p1-cockpit-density-focus-mode.md)

## Why this phase

Seven bands sit above the SOAP canvas (~314px before pane chrome). This phase takes the contained, reversible wins: merge describe into the palette, hide app chrome on the cockpit route, add a browser-fullscreen toggle that does not steal VideoRoom's fullscreen.

## Tasks

| ID | Title | Size |
|----|-------|------|
| [`ckd-01`](./Tasks/task-ckd-01-describe-in-palette.md) | Describe bar on the palette row; proposal in a popover | M |
| [`ckd-02`](./Tasks/task-ckd-02-hide-app-chrome.md) | Hide `Header` + collapse sidebar on appointment-detail | S |
| [`ckd-03`](./Tasks/task-ckd-03-browser-fullscreen.md) | Palette fullscreen toggle; VideoRoom must not steal | S |
| [`ckd-04`](./Tasks/task-ckd-04-phase-1-gate.md) | Suites + COCKPIT.md sketch + gate | S |

## Acceptance gate

- [x] Desktop: describe input is on the palette row (one row with S/O/A/P + Layouts).
- [x] Proposal / loading / error render in a popover — canvas height does not grow.
- [x] Mobile (`<lg`): describe stays in the safety dock (block layout).
- [x] On `/dashboard/appointments/:id`, app Header is not rendered; sidebar is icon-rail. List `/dashboard/appointments` is unchanged.
- [x] Fullscreen button enters/exits document fullscreen on the dashboard root. Video-stage fullscreen is unchanged when cockpit is not already fullscreen.
- [x] Lint + targeted suites green. Repo `tsc` still has pre-existing errors outside this batch (VideoRoom audio types, desk queue, EHR sections, etc.). No new errors in files this batch touched.

## Scope Guard — DO NOT TOUCH

- Identity header, queue rail, vitals strip, PatientRibbon (Phase 2).
- Pane tab strip / SOAP section chrome (Phase 3).
- Parse/apply writers.

**Created:** 2026-08-31.
