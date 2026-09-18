# Task alr2-01: Migration — widen `event_kind` CHECK + `dedupe_key` (backend)

> **Filename:** `task-alr2-01-migration-event-kind-and-dedupe.md`
> **Links:** batch [`../plan-alerts-v2-batch.md`](../plan-alerts-v2-batch.md) · exec [`./EXECUTION-ORDER-alerts-v2.md`](./EXECUTION-ORDER-alerts-v2.md)

---

## 🛑 STOP — hard-rules migration

This task **writes a migration**. Per `.cursor/rules/00-agent-contract.mdc` + `.cursor/rules/migrations.mdc`: run on **Opus**, do not start until the `ALR2-D*` decision lock is human-confirmed, keep it **additive + reversible**, and **explicitly re-confirm RLS is unchanged** (don't assume). Follow `docs/Reference/engineering/development/MIGRATIONS_AND_CHANGE.md` exactly.

---

## 📋 Task Overview

Land one additive migration that (1) widens the `doctor_dashboard_events.event_kind` CHECK to include the two new doctor kinds, and (2) adds a generalized `dedupe_key` column + partial unique index so future emitters dedupe without per-kind JSONB path checks.

**Program / Batch:** alerts-v2 · Wave 1
**Estimated Time:** ~1 hour
**Status:** ✅ Complete (2026-07-21). **Model: Opus.**
**Change Type:** 🛑 New migration (additive, reversible).
**Depends on:** decision-lock confirmation.

**Current State:**
- ✅ CHECK-widen precedent: `backend/migrations/073_…` / `074_…` — `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` with the **full enumerated list**, idempotent, reverse documented in-file.
- ✅ Current legal kinds: `patient_replayed_recording`, `patient_revoked_video_mid_session`, `patient_replayed_video`.
- ✅ Idempotency today keys on `payload->>'recording_access_audit_id'` (hardcoded in `insertDashboardEvent`) — `alr2-02` migrates it onto `dedupe_key`.
- ✅ Shipped: `backend/migrations/182_alerts_v2_event_kind_widen_and_dedupe.sql` + content-sanity test.

**Scope Guard:**
- One migration file only. **Additive** — never narrow/drop existing kinds.
- **DO NOT** backfill; legacy rows keep `dedupe_key = NULL`.
- **DO NOT** change RLS — confirm the existing `select_self`/`update_self` policies still cover the new rows, and state that explicitly in the file header.
- **DO NOT** touch service/emitter code here (that's `alr2-02`+).

---

## ✅ Task Breakdown

### 1. Migration file (next sequential number)
- [x] 1.1 Header comment in-house style: purpose, additive rationale, RLS-unchanged statement, reverse block.
- [x] 1.2 Part 1 — widen `event_kind` CHECK to the full 5-value list:
  `patient_replayed_recording`, `patient_revoked_video_mid_session`, `patient_replayed_video`, `booking_review_sla_breach`, `appointment_no_show`.
- [x] 1.3 Part 2 — `ADD COLUMN IF NOT EXISTS dedupe_key TEXT;` + partial unique index `ON (doctor_id, dedupe_key) WHERE dedupe_key IS NOT NULL`.
- [x] 1.4 `COMMENT ON COLUMN` for `dedupe_key`; update the `event_kind` comment to the new list.
- [x] 1.5 Reverse migration documented in-file (narrow CHECK back to 3 kinds; drop index + column). "Do NOT revert once v2 rows exist."

### 2. RLS re-confirmation (explicit)
- [x] 2.1 In the header, state: new kinds are inserted service-role; `doctor_dashboard_events_select_self` / `_update_self` (`doctor_id = auth.uid()`) already cover reads/acks; **no policy change required.**

### 3. Tests
- [x] 3.1 Migration test (mirror `tests/unit/migrations/doctor-dashboard-events-migration.test.ts`): CHECK accepts all 5 kinds + rejects an unknown; `dedupe_key` unique per `(doctor_id, dedupe_key)`; NULL keys don't collide. → content-sanity pins (repo has no live-Supabase harness); live CHECK/unique behavior at apply time.

### 4. Verification
- [x] 4.1 Content-sanity + idempotent SQL clauses pinned. **Live scratch-DB apply** deferred to deploy (`Apply forward / re-run / reverse / re-apply` on Supabase when promoting).
- [x] 4.2 `cd backend && npm run type-check && npm test -- --testPathPattern=182-alerts-v2` — green (9/9).

---

## 📁 Files to Create/Update

```
CREATE: backend/migrations/182_alerts_v2_event_kind_widen_and_dedupe.sql
CREATE: backend/tests/unit/migrations/182-alerts-v2-event-kind-widen-and-dedupe-migration.test.ts
READ:   backend/migrations/073_… , 074_…                             (additive widen pattern)
READ:   backend/migrations/066_doctor_dashboard_events.sql           (table + RLS baseline)
DO NOT TOUCH: any service/worker/frontend; RLS policies (confirm unchanged only)
```

---

## 🧠 Design Constraints

- **Additive + reversible** only (ALR2-D5 shape in the batch plan).
- **RLS unchanged** — re-confirm, don't assume (migrations rule).
- **Mirror** the 073/074 CHECK-widen pattern exactly (full enumerated list, idempotent DROP/ADD).

---

## ✅ Acceptance Criteria

- [x] Migration SQL is additive + reversible, idempotent on re-run (IF NOT EXISTS / DROP IF EXISTS).
- [x] CHECK lists all 5 kinds; `dedupe_key` unique index live in SQL; NULL keys unaffected (partial WHERE).
- [x] Header explicitly states RLS is unchanged and why; reverse documented.
- [x] Migration test green (9/9); no service/frontend touched.

---

**Created:** 2026-07-21. **Closed:** 2026-07-21.
