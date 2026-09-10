# Cockpit density — daily batches

> **Product plan:** this folder *is* the plan. No separate `Product plans/` file — the decision lock lives in Phase 1.
> All three phases **landed** 2026-08-31. No Phase 4.

**Prefix:** `ckd`. Numbering does not restart.

| Phase | Folder | Status | Batch plan | Execution order |
|---|---|---|---|---|
| 1 — focus mode | [`p1-focus-mode/`](./p1-focus-mode/) | **Landed** (2026-08-31) | [`plan-p1-…`](./p1-focus-mode/plan-p1-cockpit-density-focus-mode-batch.md) | [`EXECUTION-ORDER-p1-…`](./p1-focus-mode/Tasks/EXECUTION-ORDER-p1-cockpit-density-focus-mode.md) |
| 2 — context header | [`p2-context-header/`](./p2-context-header/) | **Landed** (2026-08-31) | [`plan-p2-…`](./p2-context-header/plan-p2-cockpit-density-context-header-batch.md) | [`EXECUTION-ORDER-p2-…`](./p2-context-header/Tasks/EXECUTION-ORDER-p2-cockpit-density-context-header.md) |
| 3 — pane chrome | [`p3-pane-chrome/`](./p3-pane-chrome/) | **Landed** (2026-08-31) | [`plan-p3-…`](./p3-pane-chrome/plan-p3-cockpit-density-pane-chrome-batch.md) | [`EXECUTION-ORDER-p3-…`](./p3-pane-chrome/Tasks/EXECUTION-ORDER-p3-cockpit-density-pane-chrome.md) |

## Decision lock (frozen in Phase 1 — later phases inherit)

| ID | Decision |
|---|---|
| **CKD-DL-1** | Context header **collapses** when slots are empty (walk-in, live consult, no vitals). Layout may shift as data resolves. |
| **CKD-DL-2** | Allergies are leftmost with a reserved min-width and truncate last. Chronic conditions and med count collapse to `+N` first. |
| **CKD-DL-3** | Total chrome above the canvas is budgeted and test-enforced. A future feature may not add an eighth band without updating the budget. |
| **CKD-DL-4** | On `/dashboard/appointments/:id`, hide the app `Header` and collapse the sidebar. Browser `requestFullscreen` is a user-gesture toggle (browsers block auto-enter). |
| **CKD-DL-5** | Describe-visit input lives on the desktop palette row. AI proposal is a popover — it must not grow the dock and push the canvas. Mobile keeps the block bar in the safety dock. |

## Scope Guard — DO NOT TOUCH

- Rx form writers, visit-parse orchestrator, safety/DDI logic.
- Pane tree mutations, layout presets API, SOAP section internals.
- PHI columns, RLS, migrations, payments.

**Created:** 2026-08-31.
