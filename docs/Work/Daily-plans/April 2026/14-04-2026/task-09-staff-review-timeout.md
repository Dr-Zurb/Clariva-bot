# Task A4: Staff Review 30-Minute Timeout
## 2026-04-14 — Sprint 3

---

## Task Overview

Implement the 30-minute SLA timeout for staff service reviews. When staff hasn't responded to a service match review within 30 minutes, notify the patient and re-notify staff.

**Estimated Time:** 4 hours
**Status:** DONE
**Completed:** 2026-04-14

**Change Type:**
- [x] **Update existing** — Change or remove existing code

**Current State:**
- `service-staff-review-service.ts` ~698–712: `runStaffReviewTimeoutJob` is a **stub** — returns `{ timedOut: 0, notified: 0, errors: 0 }` without doing anything
- New review rows set `sla_deadline_at: null` (~174)
- Migration 042 explicitly states "no auto-timeout product path"
- `cron.ts` ~129–152: cron route calls the stub
- Staff-facing notification on creation: DB row + audit log only; no proactive push/email to staff

**What's missing:**
- Setting `sla_deadline_at` when creating review requests
- Implementing the timeout job body
- Patient DM on timeout
- Staff re-notification on timeout
- New migration to support `sla_breached` status (if needed)

**Scope Guard:**
- Expected files touched: 4–5
- `service-staff-review-service.ts`, `cron.ts`, `notification-service.ts`, possibly new migration, possibly `staff-service-review-dm.ts`

**Reference:** [scenario-alignment-plan.md](./scenario-alignment-plan.md) § A4
**Scenario:** [all bot patient scenarios](../../Reference/all%20bot%20patient%20scenarios) § 15

---

## Task Breakdown

### 1. Set SLA deadline on review creation
- [x] 1.1 When `upsertPendingStaffServiceReviewRequest` creates a new review, set `sla_deadline_at = now() + 30 minutes`
- [x] 1.2 If updating an existing pending review, don't reset the deadline (keep original)

### 2. Implement `runStaffReviewTimeoutJob`
- [x] 2.1 Query: `SELECT * FROM staff_service_reviews WHERE status = 'pending' AND sla_deadline_at < now() AND sla_breached_at IS NULL`
- [x] 2.2 For each timed-out review:
  - [x] 2.2.1 Send patient DM: "The clinic hasn't responded yet — we'll follow up. You can also try again later."
  - [x] 2.2.2 Re-notify staff (whatever notification channel exists — dashboard, email, push)
  - [x] 2.2.3 Mark review: `sla_breached_at = now()` (don't auto-resolve — staff still needs to act)
  - [x] 2.2.4 Log the timeout event
- [x] 2.3 Return counts: `{ timedOut, notified, errors }`

### 3. Add `sla_breached_at` column (if not exists)
- [x] 3.1 Check if the staff review table already has this column
- [x] 3.2 If not, create a migration to add `sla_breached_at TIMESTAMPTZ NULL`
- [x] 3.3 Ensure the column is indexed for the timeout query

### 4. Wire cron
- [x] 4.1 Verify `cron.ts` calls `runStaffReviewTimeoutJob` at appropriate interval (every 5 minutes)
- [x] 4.2 If interval is too long, adjust

### 5. Patient DM formatting
- [x] 5.1 Add a new copy function in `staff-service-review-dm.ts`: `formatStaffReviewTimeoutPatientDm`
- [x] 5.2 Keep it simple and empathetic
- [x] 5.3 English for now (A7 handles mirroring later)

### 6. Verification
- [x] 6.1 `tsc --noEmit` passes
- [x] 6.2 Unit test: create review → verify `sla_deadline_at` is set
- [x] 6.3 Unit test: mock time past deadline → verify timeout job picks it up
- [x] 6.4 Unit test: already breached review → not picked up again
- [x] 6.5 Integration: run cron endpoint → verify DM sent

---

## Files to Create/Update

- `service-staff-review-service.ts` — MODIFY (implement timeout job + set deadline)
- `staff-service-review-dm.ts` — MODIFY (timeout patient DM copy)
- `cron.ts` — REVIEW (verify interval)
- `notification-service.ts` — MODIFY (staff re-notification)
- New migration (if `sla_breached_at` column needed)

**When creating a migration:**
- [x] Read all previous migrations to understand schema

---

## Design Constraints

- Timeout does NOT auto-resolve the review — staff must still act
- Patient DM should be sent via the same Instagram DM path (requires conversation + page token lookup)
- Cron must be idempotent (re-running doesn't re-send DMs for already-breached reviews)
- No PHI in timeout logs

---

## Global Safety Gate

- [x] **Data touched?** Yes — staff review table + conversation lookup
  - [x] **RLS verified?** Must use admin/service-role client
- [x] **Any PHI in logs?** No (review IDs only)
- [x] **External API or AI call?** Yes — Instagram DM send
  - [x] **Consent + redaction confirmed?** No PHI in DM
- [x] **Retention / deletion impact?** No

---

## Acceptance Criteria

- [x] New staff review → `sla_deadline_at` = now + 30 min
- [x] After 30 min with no staff action → patient DM sent
- [x] After 30 min with no staff action → staff re-notified
- [x] Review marked `sla_breached_at` → not re-processed
- [x] Staff resolves review normally after breach → works fine
- [x] Cron is idempotent

---

**Last Updated:** 2026-04-14
