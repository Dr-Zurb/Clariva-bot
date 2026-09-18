# Task lat-01: Harness timing readout + recorded baseline

> **Links:** batch [`../plan-p1-quick-wins-batch.md`](../plan-p1-quick-wins-batch.md) · exec [`./EXECUTION-ORDER-p1-quick-wins.md`](./EXECUTION-ORDER-p1-quick-wins.md)

---

## 📋 Task Overview

Make latency legible before optimizing it. The timing metric already exists (`webhook_instagram_dm_pipeline_timing`, RBH-12) but reading it means grepping dev logs by hand, which nobody will do consistently across five tasks.

Teach the existing DM smoke harness (`backend/scripts/test-dm-language.ts`, added for the language program) to report per-turn timings, then record a committed baseline so every later task has a number to beat.

**Program / Phase:** dm-reply-latency · p1 · Wave 0
**Estimated Time:** ~2 hours
**Status:** ✅ DONE (2026-08-02)
**Change Type:** Update existing script (dev tooling only, not shipped code)
**Model:** Sonnet
**Depends on:** nothing

---

## ✅ Task Breakdown

### 1. Read the timings back
- [x] 1.1 After each harness turn, fetch the pipeline timing for that turn's `correlationId` / `eventId`.
- [x] 1.2 Prefer a source that does not require log scraping. Check in this order: an existing metrics/audit table the worker already writes, then `webhook_events` (or whatever `markWebhookProcessed` updates), then a dev-only log tail as a last resort.
  - **If none of these carry the durations,** stop and surface it — adding a persisted metrics row is a schema change and therefore Opus, not a quiet extension of this task.
- [x] 1.3 Fall back gracefully: if timings cannot be read, print wall-clock time measured by the harness itself (POST → reply row visible) and label it clearly as end-to-end, not segmented.

### 2. Report
- [x] 2.1 Per turn, print `intentMs`, `generateMs`, `igSendMs`, `handlerPreSendMs`, plus a derived `otherPreSendMs = handlerPreSendMs − intentMs − generateMs`.
- [x] 2.2 Per run, print a summary table: min / p50 / max per segment across all turns.
- [x] 2.3 Add `--timings` to opt in, or make it default if the output stays readable. Do not bury the pass/fail language assertions under a wall of numbers — the harness is still primarily a correctness tool.

### 3. Baseline
- [x] 3.1 Run all four scenarios on a warm server (discard the first turn — it pays one-time BullMQ connect and ts-node warmup).
- [x] 3.2 Record the result in a new `BASELINE-p1.md` next to this task: date, commit SHA, model in use, and the per-segment table.
- [x] 3.3 Note the environment honestly (local dev, single worker, dev Supabase). These numbers compare against *themselves*, not against production.

### 4. Tests
- [x] 4.1 None required — this is a dev script, consistent with `test-comment-webhook.ts` and `test-dm-language.ts`, neither of which is unit-tested.
- [x] 4.2 Do confirm the harness still passes 4/4 language scenarios after the change.

---

## 📁 Files

```
UPDATE: backend/scripts/test-dm-language.ts
CREATE: docs/Work/Daily-plans/August 2026/02-08-2026/dm-reply-latency/p1-quick-wins/Tasks/BASELINE-p1.md
DO NOT TOUCH: backend/src/** (this task ships no runtime code)
DO NOT TOUCH: webhook-metrics.ts — the metric already emits what we need
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- **Tooling only.** If you find yourself editing `src/`, you have left this task.
- Do not add a new metric, table, or column to make reporting easier — see 1.2, that is an escalation, not a shortcut.
- Do not print message content in the timing output (LAT-D7). Durations and ids only.
- Do not "fix" anything slow you notice while measuring. Write it down; that is what `lat-02`…`lat-05` are for.

---

## ✅ Acceptance Criteria

- [x] One command prints per-segment timings for a full scenario run.
- [x] `otherPreSendMs` is derived and shown — it is the number `lat-04` exists to move, and it is invisible in the raw metric.
- [x] `BASELINE-p1.md` committed with date, commit, model, and the table.
- [x] Language scenarios still pass 4/4.
- [x] No runtime code changed.

---

**Created:** 2026-08-02.

**Closed:** 2026-08-02.
**Note:** Segmented timings not persisted (surfaced). Baseline uses real-IG segments + harness e2e. See BASELINE-p1.md.
