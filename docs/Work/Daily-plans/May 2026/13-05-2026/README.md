# 13 May 2026 — Daily plans

One batch landed (or is landing) on this day, filed in a self-contained subfolder with its own plan + `Tasks/` tree.

| Folder | Batch | Status | What it covers |
|---|---|---|---|
| [`patient-profile-shell-rebuild/`](./patient-profile-shell-rebuild/) | **Patient profile shell rebuild** (ppr-01 … ppr-14) | Drafted 2026-05-13 (active) | Replaces the 2,548-LOC `ConsultationCockpit.tsx` with a clean, content-agnostic `<PatientProfileShell>` that compiles against a blank project. Built side-by-side at `/dashboard/appointments/[id]/v2`, validated for parity, then flipped to default and the old shell is deleted. Zero backend changes. Zero rewrites of the 🟢 content components (chart rail, Rx workspace, consultation rooms, wrap-up, header, queue rail, hotkeys, presets). Architecture admits N panes + recursive splits via a single `PaneDefinition` contract — so adding "AI chat" as a 4th pane later costs one diff. |

## Why this batch follows yesterday

After the [`cockpit-customization`](../10-05-2026/cockpit-customization/) batch (10 May) and a follow-on bug-fix round (11–13 May), the cockpit shell now hosts four overlapping layout systems in one file: three-pane resize, side-rail collapse, slot reorder, and middle-column directional collapse. Each was added correctly in isolation; together they form a layout state machine that is no longer tractable:

1. **2,548 LOC** in `ConsultationCockpit.tsx` with ~12 inline helpers, each guarding one combination of the four layers.
2. **`?cockpitDbg=1` debug instrumentation still in tree** ([inbox.md L280](../../../capture/inbox.md)) because the "reorder, then drag a side column, watch the middle one collapse instead" bug recurs even after multiple targeted patches.
3. **`BodyColumnContent` / `RxColumnContent` are inline functions** — they can't be unit-tested or imported without dragging the entire shell.
4. **The shell knows medical concepts** (`shouldShowChartRail`, `ConsultationLauncher`, `WrapUpDialog`) — so the user's explicit ask for an "AI chat" 4th tab and for vertical splits inside a column would force another round of `isMiddleSlot` branches across the file.

The decision (locked 2026-05-13 in [`plan-patient-profile-shell-rebuild.md`](../../Product%20plans/plan-patient-profile-shell-rebuild.md)): rebuild the shell, not patch it. Strangler Fig migration — new route, port content by reference, validate parity, flip, delete.

## How to start

If you're picking up `patient-profile-shell-rebuild`:

1. Read the [source product plan](../../Product%20plans/plan-patient-profile-shell-rebuild.md) once for context.
2. Read [`patient-profile-shell-rebuild/plan-patient-profile-shell-rebuild-batch.md`](./patient-profile-shell-rebuild/plan-patient-profile-shell-rebuild-batch.md) for the per-task breakdown and decision locks.
3. Open [`patient-profile-shell-rebuild/Tasks/EXECUTION-ORDER-patient-profile-shell-rebuild.md`](./patient-profile-shell-rebuild/Tasks/EXECUTION-ORDER-patient-profile-shell-rebuild.md) for the wave / lane matrix and model picks.
4. Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md): start a fresh chat per task unless tasks are explicitly stitched. Only **ppr-03** (the new shell) is recommended for Opus 4.7; everything else is Sonnet 4.6.

## Cross-day predecessors

- [Daily-plans/May 2026/10-05-2026/cockpit-customization/plan-cockpit-customization-batch.md](../10-05-2026/cockpit-customization/plan-cockpit-customization-batch.md) — the slot-state + presets batch this rebuild absorbs and simplifies.
- [Daily-plans/May 2026/09-05-2026/cockpit-shell-redesign/plan-cockpit-shell-redesign-batch.md](../09-05-2026/cockpit-shell-redesign/plan-cockpit-shell-redesign-batch.md) — the fixed-height + drag-resize shell whose mistakes this rebuild corrects.
- [Daily-plans/May 2026/06-05-2026/plan-cockpit-redesign-batch.md](../06-05-2026/plan-cockpit-redesign-batch.md) — the original cockpit redesign that introduced the state machine + sticky shell. All cockpit-state primitives carry forward unchanged.
- [Product plans/plan-patient-profile-shell-rebuild.md](../../Product%20plans/plan-patient-profile-shell-rebuild.md) — the source product plan with decision locks DL-1..DL-13.
