# Task alr2-02: Generalize `insertDashboardEvent` dedupe + service types (backend)

> **Filename:** `task-alr2-02-generalize-insert-dedupe-and-types.md`
> **Links:** batch [`../plan-alerts-v2-batch.md`](../plan-alerts-v2-batch.md) · exec [`./EXECUTION-ORDER-alerts-v2.md`](./EXECUTION-ORDER-alerts-v2.md)

---

## 🛑 Opus — shared insert path

Changes the single insert path every event kind uses. Run on **Opus**; dedupe correctness is the whole point (a bug double-fires the feed or silently drops events).

## 📋 Task Overview

Move `insertDashboardEvent` from a hardcoded `recording_access_audit_id` idempotency pre-check to a **caller-supplied `dedupe_key`** (writing the new column from `alr2-01`), and add the two new kinds + payload types + a `severity` field to the service. This is the spine both emitters (`alr2-03`/`04`) reuse.

**Program / Batch:** alerts-v2 · Wave 2
**Estimated Time:** ~1.5–2 hours
**Status:** ✅ Complete (2026-07-21). **Model: Opus.**
**Change Type:** ✅ Backend service change + types (no new endpoint).
**Depends on:** `alr2-01` (column + kinds exist).

**Current State:**
- ✅ `insertDashboardEvent` accepts `dedupeKey`; writes `dedupe_key`; race-safe via unique-violation (23505) recovery.
- ✅ Legacy `recordingAccessAuditId` maps onto `dedupeKey` + keeps JSONB pre-check for pre-182 rows.
- ✅ `DashboardEventKind` + `BookingReviewSlaBreachPayload` / `AppointmentNoShowPayload` + `severity` typed.

**Scope Guard:**
- **DO NOT** add a migration (done in `alr2-01`) or an endpoint (that's `alr2-07`).
- **DO NOT** break the legacy `recording_access_audit_id` dedupe path — keep it working (coexists with `dedupe_key`).
- Keep inserts **service-role**; no RLS change.

---

## ✅ Task Breakdown

### 1. Key-based dedupe (ALR2-D5)
- [x] 1.1 Add `dedupeKey?: string` to `InsertDashboardEventInput`; when set, write it to the new `dedupe_key` column.
- [x] 1.2 Rely on the partial unique index for race-safety: attempt insert, catch the unique-violation, and return `{ inserted:false, eventId:<existing> }` (look up the existing row by `(doctor_id, dedupe_key)`). Prefer this over a read-then-write pre-check to avoid TOCTOU under concurrent ticks.
- [x] 1.3 Preserve the legacy `recordingAccessAuditId` path — **maps onto `dedupeKey` internally** and keeps the JSONB pre-check for pre-182 rows. No behavior change for existing callers.

### 2. New kinds + payloads + severity (ALR2-D6/D7)
- [x] 2.1 Extend `DashboardEventKind` with `booking_review_sla_breach` | `appointment_no_show`.
- [x] 2.2 Add `BookingReviewSlaBreachPayload` + `AppointmentNoShowPayload` (fields per the batch plan §Payloads; every field PHI-classified). Add both to the `DashboardEventPayload` union.
- [x] 2.3 Add `severity: 'info' | 'action_needed'` as a payload field (not a column).

### 3. Tests
- [x] 3.1 Same `dedupeKey` → second insert is a no-op returning the first id (concurrent-safe via the unique index).
- [x] 3.2 Legacy `recordingAccessAuditId` dedupe still works.
- [x] 3.3 New payload types round-trip through `toEvent`.

### 4. Verification
- [x] 4.1 `cd backend && npm run type-check` — clean; eslint on slice clean.
- [x] 4.2 `cd backend && npm test -- --testPathPattern=dashboard-events-service` — **18/18** green.

---

## 📁 Files to Create/Update

```
UPDATE: backend/src/services/dashboard-events-service.ts             (dedupeKey path + 2 kinds + payloads + severity)
UPDATE: backend/tests/unit/services/dashboard-events-service.test.ts  (dedupe + payload tests)
READ:   backend/migrations/182_alerts_v2_event_kind_widen_and_dedupe.sql
DO NOT TOUCH: migration files; controller/routes; frontend
```

---

## 🧠 Design Constraints

- **Race-safe dedupe** via the unique index, not a read-then-write pre-check.
- **Backward compatible** — legacy replay dedupe keeps working.
- **PHI discipline** — new payloads carry only `patient_display_name` + date/UUID fields (ALR2-D7).

---

## ✅ Acceptance Criteria

- [x] `insertDashboardEvent` dedupes on a caller `dedupeKey`; retries/overlapping ticks never double-insert.
- [x] Legacy `recordingAccessAuditId` dedupe unchanged.
- [x] Two new kinds + payloads + `severity` typed; tests green; no migration/endpoint/frontend touched.

---

**Created:** 2026-07-21. **Closed:** 2026-07-21.
