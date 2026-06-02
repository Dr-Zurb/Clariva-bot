# 07 May 2026 — Daily plans

**Active batch:** [Patient seeing flow](./plan-patient-flow-batch.md) — closes the seam between two consultations (wrap-up checkpoint, cockpit queue rail, auto-advance, OPD/Today's Schedule visual differentiation).

**Source plan:** [Product plans/plan-patient-seeing-flow.md](../../../Product%20plans/plan-patient-seeing-flow.md) — `Drafted` 2026-05-07, all P-D1…P-D7 decisions locked, all items ticked `Yes`.

## What's here

| File | Purpose |
|---|---|
| [`plan-patient-flow-batch.md`](./plan-patient-flow-batch.md) | Master batch plan — phases, scope summary, decision lock, whole-batch acceptance gate. |
| [`Tasks/EXECUTION-ORDER-patient-flow.md`](./Tasks/EXECUTION-ORDER-patient-flow.md) | Authoritative execution order — parallel-chat lane matrix, model picks per task, multi-chat workflow, close gates. |
| [`Tasks/task-pf-NN-*.md`](./Tasks/) | 18 per-task spec files (`pf-01` … `pf-18`). |

## How to start

1. Skim [`plan-patient-flow-batch.md`](./plan-patient-flow-batch.md) once.
2. Open [`Tasks/EXECUTION-ORDER-patient-flow.md`](./Tasks/EXECUTION-ORDER-patient-flow.md). The lane matrix tells you which tasks can run in parallel chats.
3. For each chat, pin the task spec file + open the model that the task's `## Model & execution guidance` block recommends.
4. Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md): start a fresh chat per task unless explicitly stitched.

**Status:** `Drafted` 2026-05-07. **Owner:** TBD.
