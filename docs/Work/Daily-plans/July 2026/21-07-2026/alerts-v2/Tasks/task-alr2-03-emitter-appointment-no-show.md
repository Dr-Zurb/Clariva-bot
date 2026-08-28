# Task alr2-03: Emitter — `appointment_no_show` (backend)

> **Filename:** `task-alr2-03-emitter-appointment-no-show.md`
> **Links:** batch [`../plan-alerts-v2-batch.md`](../plan-alerts-v2-batch.md) · exec [`./EXECUTION-ORDER-alerts-v2.md`](./EXECUTION-ORDER-alerts-v2.md)

---

## 🛑 Opus — worker edit + PHI payload

Edits a scheduled worker and writes a PHI-bearing feed row. Run on **Opus**.

## 📋 Task Overview

Emit an `appointment_no_show` dashboard event when the auto-no-show worker flips an appointment to `no_show`, so the doctor sees a (non-alarming, informational) feed entry.

**Program / Batch:** alerts-v2 · Wave 3
**Estimated Time:** ~1 hour
**Status:** ✅ Complete (2026-07-21). **Model: Opus.**
**Change Type:** ✅ Add one `insertDashboardEvent` call in an existing worker.
**Depends on:** `alr2-01` (kind legal), `alr2-02` (payload type + `dedupeKey`).

**Current State:**
- ✅ Insertion point: `backend/src/workers/auto-no-show-worker.ts#flipToNoShow` — emits after audited flip via `emitAppointmentNoShowEvent`.
- ✅ OQ-1 LOCKED: worker-only; manual no-shows deferred to inbox.

**Scope Guard:**
- **DO NOT** change the no-show flip logic / timing / audit — only add the feed insert after a successful, audited flip.
- **DO NOT** emit if the flip failed or was a no-op.
- **DO NOT** add new PHI beyond `patient_display_name` + `appointment_date` (ALR2-D7).
- Resolve **OQ-1** here (default: manual/doctor-initiated no-shows do **not** emit — only the silent worker flip).

---

## ✅ Task Breakdown

### 1. Emit after the audited flip
- [x] 1.1 In `flipToNoShow`, after the flip + audit succeed, call `insertDashboardEvent({ doctorId, eventKind:'appointment_no_show', sessionId:null, payload, dedupeKey: appointmentId })`.
- [x] 1.2 Payload: `{ severity:'info', appointment_id, patient_display_name, appointment_date }`. Resolve `patient_display_name` from `patients.name` (same source as the replay feed); empty → UI "A patient".
- [x] 1.3 Wrap the insert so a feed-insert failure **does not** fail or roll back the no-show flip (log + count; the flip is the source of truth).

### 2. OQ-1 decision
- [x] 2.1 **Locked: only the worker flip emits.** Manual no-shows deferred — follow-up in `capture/inbox.md`.

### 3. Tests
- [x] 3.1 Worker tick that flips an appointment → one `appointment_no_show` event with the right payload; re-tick → no duplicate.
- [x] 3.2 Feed-insert failure is swallowed (flip still succeeds; error counted).

### 4. Verification
- [x] 4.1 `cd backend && npm run type-check` + eslint on worker — clean.
- [x] 4.2 `cd backend && npm test -- --testPathPattern=auto-no-show-worker` — **14/14** green.

---

## 📁 Files to Create/Update

```
UPDATE: backend/src/workers/auto-no-show-worker.ts                    (emit after audited flip)
UPDATE: backend/tests/unit/workers/auto-no-show-worker.test.ts        (emit + dedupe + failure-swallow)
READ:   backend/src/services/dashboard-events-service.ts              (insertDashboardEvent + payload type)
DO NOT TOUCH: the flip/audit logic; migration; frontend
```

---

## 🧠 Design Constraints

- **Flip is source of truth** — a feed-insert error never regresses the no-show flip.
- **Idempotent** — dedupe on `appointment_id` (re-ticks are no-ops).
- **Informational tone** (`severity:'info'`), Decision-4 copy handled in `alr2-06`.

---

## ✅ Acceptance Criteria

- [x] A worker no-show flip emits exactly one `appointment_no_show` event; re-runs don't duplicate.
- [x] Payload carries only `patient_display_name` + `appointment_date` (+ ids); no new PHI.
- [x] Flip/audit behavior unchanged; feed-insert failures are non-fatal; tests green.

---

**Created:** 2026-07-21. **Closed:** 2026-07-21.
