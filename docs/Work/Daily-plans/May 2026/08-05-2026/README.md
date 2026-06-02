# 08 May 2026 — Daily plans

**Active batch:** [OPD queue redesign](./plan-opd-queue-redesign-batch.md) — turn the `/dashboard/opd-today` queue board into a clinical-grade dense table (full names + MRN + phone + age, status grouping, one-click-open, overflow actions, session controls, keyboard-driven).

**Source:** screenshot review with the user on 2026-05-08 (Ask-mode walkthrough captured in this chat). Decisions D1–D7 locked in `plan-opd-queue-redesign-batch.md § Decision lock`.

## What's here

| File | Purpose |
|---|---|
| [`plan-opd-queue-redesign-batch.md`](./plan-opd-queue-redesign-batch.md) | Master batch plan — phases, scope summary, decision lock, whole-batch acceptance gate. |
| [`Tasks/EXECUTION-ORDER-opd-queue.md`](./Tasks/EXECUTION-ORDER-opd-queue.md) | Authoritative execution order — parallel-chat lane matrix, model picks per task, wave plan. |
| [`Tasks/task-oq-NN-*.md`](./Tasks/) | 14 per-task spec files (`oq-01` … `oq-14`). |

## How to start

1. Skim [`plan-opd-queue-redesign-batch.md`](./plan-opd-queue-redesign-batch.md) once.
2. Open [`Tasks/EXECUTION-ORDER-opd-queue.md`](./Tasks/EXECUTION-ORDER-opd-queue.md). The lane matrix tells you which tasks can run in parallel chats.
3. For each chat, pin the task spec file + open the model that the task's `## Model & execution guidance` block recommends.
4. Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md): start a fresh chat per task unless explicitly stitched.

## Why this batch

The current `/dashboard/opd-today` page (`frontend/components/opd/DoctorQueueBoard.tsx`) was built in March 2026 as part of `e-task-opd-06` and never got the cockpit batch's UX pass. Three clinical-impact problems:

1. **Patient labels are initials** (`BE`, `OR`, `BD`) — the masking was a misapplied PHI rule on a *doctor-scoped* surface where the doctor sees full PHI everywhere else. It's a real **clinical-safety issue** (two patients can collide on the same initials).
2. **Action surface is wrong** — `Open` and `Call` are two buttons doing two unrelated things (navigation vs. status mutation), and `Skip` is a destructive-looking single button hiding three semantically distinct outcomes (`requeue after current`, `send to end of queue`, `mark no-show`). Backend routes for the rich set already exist; only the UI is wrong.
3. **Density is wasted** — current rows are ~52 px tall; on an 80-patient day a doctor scrolls instead of seeing their session. Cockpit strip already has the right primitives (status meta, grouping, disclosures); this page should be a **strict superset** of the strip, not a stripped-down older sibling.

This batch fixes all three plus adds filters, search, keyboard shortcuts, session-level controls, density toggle, and mobile fallback.

**Status:** `Drafted` 2026-05-08. **Owner:** TBD.
