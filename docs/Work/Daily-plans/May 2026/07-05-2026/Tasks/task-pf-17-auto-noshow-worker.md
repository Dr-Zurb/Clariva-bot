# Task pf-17: Auto-no-show worker

## 07 May 2026 — Batch [Patient seeing flow](../plan-patient-flow-batch.md) — Phase 3, Lane ζ step 3 — **S, ~4h**

---

## Task overview

Backend interval job (cron / setInterval / whichever the codebase already uses for periodic work) that, every 5 minutes, looks for `pending` / `confirmed` appointments whose `appointment_date` is more than `doctor_settings.auto_no_show_after_min` minutes in the past AND have **no consultation session** ever created. Flips them to `status = 'no_show'`.

Gated entirely on `doctor_settings.auto_no_show_after_min` being non-NULL — opt-in per **P-D7** (default off).

**Estimated time:** ~4h. ~30min Opus predicate-design pass (mass-mutation risk), ~3h Sonnet impl + tests.

**Status:** Shipped (2026-05-08).

**Hard deps:** [pf-09](./task-pf-09-doctor-settings-flow-advance.md) shipped (the column exists).

**Source:** [plan-patient-seeing-flow.md § P5.5](../../../../Product%20plans/plan-patient-seeing-flow.md#p55--auto-no-show-worker).

---

## Model & execution guidance

**Recommended model:** **Opus 4.7 Extra High** for the predicate design (per the hard rule: a worker that mass-mutates appointment status is exactly the "getting it wrong silently mass-mutates" risk class), then **Sonnet 4.6 Medium** for impl.

**Why Opus for design:**
- Predicate must be airtight — accidentally including `status = 'completed'` in the SET clause silently rewrites history.
- Per-doctor settings means a JOIN; getting the predicate's NULL-handling on `doctor_settings.auto_no_show_after_min` wrong either mass-marks every doctor's appointments OR no-ops forever.
- Need to avoid a long-running transaction that locks the appointments table.

**New chat?** **Yes — split:**

1. **Opus design chat (~30min, Plan Mode):**
   - Pre-load: this task file + `backend/src/services/appointment-service.ts` + the existing worker patterns (search `setInterval` / `cron` / `BullMQ` / similar in `backend/src/`).
   - Ask: *"Design the auto-no-show worker. Specify: SQL predicate (NULL-handling on `auto_no_show_after_min`, exclusion of completed/cancelled/already-no_show, exclusion of any appointment with a consultation_session row), batching strategy, transaction boundaries, and how it logs / emits events."*
   - Lock the predicate.

2. **Sonnet impl chat (~3h):**
   - Pre-load: this task file + the locked predicate.
   - Implement the worker, register it with the app's lifecycle, write unit tests, write a manual one-shot script for QA.

**Composer-OK sub-steps:** none.

**Estimated turns:** 1 Opus + 4–5 Sonnet.

---

## Acceptance criteria

### Worker file

- [ ] New file `backend/src/workers/auto-no-show-worker.ts` exporting:

  ```ts
  export function startAutoNoShowWorker(opts?: {
    intervalMs?: number;        // default 5 * 60 * 1000
    onTick?: (n: number) => void;  // for tests
  }): { stop: () => void };
  ```

- [ ] Hooked into the app's startup lifecycle (search `index.ts` or `server.ts` for the existing pattern; mirror it).

### Predicate (locked by Opus design pass)

- [ ] Per-tick query, batched (limit 100 rows per tick to avoid a long lock):

  ```sql
  WITH eligible AS (
    SELECT a.id
    FROM appointments a
    JOIN doctor_settings ds ON ds.doctor_id = a.doctor_id
    WHERE
      a.status IN ('pending','confirmed')
      AND ds.auto_no_show_after_min IS NOT NULL
      AND a.appointment_date < NOW() - (ds.auto_no_show_after_min * INTERVAL '1 minute')
      AND NOT EXISTS (
        SELECT 1 FROM consultation_sessions cs
        WHERE cs.appointment_id = a.id
      )
    ORDER BY a.appointment_date ASC
    LIMIT 100
  )
  UPDATE appointments
     SET status = 'no_show', updated_at = NOW()
    FROM eligible
   WHERE appointments.id = eligible.id
   RETURNING appointments.id, appointments.doctor_id;
  ```

- [ ] Returns the IDs flipped this tick. Logs `{ count, ids }` per tick (PHI-free count is ok; full IDs are non-PHI but useful for debugging).
- [ ] Emits an audit log row per flipped appointment (`appointment.auto_no_show` event, source `worker`).

### Idempotency / safety

- [ ] Tick runs are independent — overlapping ticks (slow DB) don't re-flip the same row (the `WHERE status IN ('pending','confirmed')` predicate excludes already-flipped rows).
- [ ] Worker handles DB errors gracefully — logs + continues at next tick.
- [ ] Worker stops cleanly on SIGTERM / shutdown — exposed via the `stop()` function.

### Wrap-up sweep (P-Q2)

- [ ] **Bonus** (still in scope): the same worker tick also sweeps appointments stuck in `wrap_up` for >24h. Predicate adds:

  ```sql
  OR (
    a.status IN ('pending','confirmed')
    AND EXISTS (SELECT 1 FROM consultation_sessions cs
                WHERE cs.appointment_id = a.id AND cs.status = 'ended'
                  AND cs.ended_at < NOW() - INTERVAL '24 hours')
  )
  ```

  These get `status = 'completed'` (NOT no_show) with a system note: `auto-completed: stuck in wrap_up >24h`. Closes P-Q2 from the source plan.
- [ ] If the wrap-up sweep is contentious, leave it disabled (`if (env.AUTO_WRAP_UP_SWEEP_ENABLED)` guard) and ship dark.

### Tests

- [ ] Unit test `backend/tests/unit/workers/auto-no-show-worker.test.ts`:
  - Doctor with `auto_no_show_after_min = 30`, 3 stale appointments → all 3 flipped.
  - Doctor with `auto_no_show_after_min = NULL` → 0 flips (P-D7 default).
  - Appointment with a session → 0 flips (consult started).
  - Already-cancelled / no_show → 0 flips (idempotency).
  - Wrap-up sweep: appointment with session ended >24h → flipped to `completed` (if enabled).

### Configuration

- [ ] New env var `AUTO_NO_SHOW_WORKER_ENABLED` (default `'true'` in production, `'false'` in dev unless explicitly set).
- [ ] Worker checks this on startup; if disabled, logs `auto-no-show-worker: disabled by env`.

### General

- [ ] Type-check + lint clean.
- [ ] Manual smoke documented in PR: set a doctor's `auto_no_show_after_min` to 5, create a stale appointment, wait 5 min, observe the flip in logs + DB.

---

## Out of scope

- **UI surfacing of auto-marked no-shows** — pf-13's outcome-row styling already handles them; no further UI here.
- **Notifying patients of the no-show** — separate concern; inbox a follow-up if product wants it.
- **Doctor email when N appointments auto-marked** — unnecessary noise; doctors see it in `<TodaysSchedule>`.

---

## Files expected to touch

**New:**
- `backend/src/workers/auto-no-show-worker.ts` (~180 LOC)
- `backend/tests/unit/workers/auto-no-show-worker.test.ts` (~140 LOC)

**Modified:**
- `backend/src/index.ts` (or `server.ts` — the bootstrap file) (~5 LOC — register the worker)
- `backend/src/config/env.ts` (~5 LOC — add `AUTO_NO_SHOW_WORKER_ENABLED` + optional `AUTO_WRAP_UP_SWEEP_ENABLED`)

**Deleted:** none.
**Backend / migrations:** none (pf-09 owns the column).

---

## Notes / open decisions

1. **Why 5 min interval.** Tighter doesn't help (clinic ops happen on minute-scale); looser feels stale. 5 min is the standard.
2. **Why not a database trigger.** Appealing in the abstract but the predicate references `NOW()` continuously (not a row-change trigger). A periodic worker is the right shape.
3. **Wrap-up sweep audit pattern.** The system-note is critical for forensic trust — doctors want to know "I didn't manually complete this; the system did". Match the existing audit row format.
4. **Locking concerns.** `LIMIT 100` per tick + `WHERE status IN ('pending','confirmed')` prevents long locks; a row-level `UPDATE` with the WITH-clause IDs scales to thousands of doctors safely.

---

## References

- **Source plan:** [plan-patient-seeing-flow.md § P5.5](../../../../Product%20plans/plan-patient-seeing-flow.md#p55--auto-no-show-worker)
- **Setting source:** [task-pf-09-doctor-settings-flow-advance.md](./task-pf-09-doctor-settings-flow-advance.md)
- **Hard-rule for mass-mutation servers:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md § When to escalate to Opus](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md#when-to-escalate-to-opus-the-hard-rules)
- **Wrap-up sweep closes:** [plan-patient-flow-batch.md § Open questions § P-Q2](../plan-patient-flow-batch.md#open-questions-carry-from-source-plan-lock-before-merging)

---

**Owner:** TBD
**Created:** 2026-05-07
**Status:** Shipped (2026-05-08).
