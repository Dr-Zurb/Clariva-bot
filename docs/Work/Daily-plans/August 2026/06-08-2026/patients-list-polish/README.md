# Patients list polish

> **Status:** ✅ Complete (2026-08-06)  
> **Route:** `/dashboard/patients-v2`  
> **Predecessor:** [patients-redesign](../../../May%202026/18-05-2026/patients-redesign/) (pr-01…pr-14 shipped)

## One-line intent

Make the Patients registry feel like a doctor’s working list: less duplicated chrome, clearer attention signals, readable names, and faster row actions — without redesigning the chart/detail surface.

## Start here

1. Read [`plan-patients-list-polish-batch.md`](./plan-patients-list-polish-batch.md) (why + decision lock).
2. Open [`Tasks/EXECUTION-ORDER-patients-list-polish.md`](./Tasks/EXECUTION-ORDER-patients-list-polish.md).
3. Run `plp-01` first (smallest visual win, no filter-model changes).

## Out of scope (parked)

- Patient **detail** tabs / Overview redesign.
- Dashboard-wide push-notification banner placement (layout shell, not this page).
- Backend KPI semantics / new segments / new migrations.
- Mutating stored patient names (display formatting only).
