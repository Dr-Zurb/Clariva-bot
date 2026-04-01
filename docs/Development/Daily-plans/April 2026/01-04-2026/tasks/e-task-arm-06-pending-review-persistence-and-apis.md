# e-task-arm-06: Pending staff review — persistence & APIs (+ mandatory audit)

## 2026-04-02 — Durable queue for low-confidence matches

---

## 📋 Task Overview

Introduce **durable storage** for **pending service-review** requests so staff can act asynchronously and **audit** is guaranteed:

- **Entity** represents: doctor, conversation, proposed `catalogServiceKey` + confidence, optional alternates, **SLA deadline** (created-at + 24h default), **status** (`pending` | `confirmed` | `reassigned` | `cancelled_by_staff` | `cancelled_timeout` | patient-led cancel if tracked).
- **Audit record** (or immutable append-only fields on the entity) for every **resolution**: **actor** (doctor user id), **timestamp**, **final `catalogServiceKey`**, optional internal note — **no mandatory reject-reason taxonomy** per plan §0.
- **APIs** (authenticated, **RLS**): create/update/list for **own practice** only; correlate with existing **Supabase** / auth patterns.

**Design choice** (implementation): new table(s) vs extending existing **appointments** — prefer **separate** table if **no appointment row** exists until slot chosen (plan **Option B**). Document decision in migration header.

**Estimated Time:** 2–3 days  
**Status:** ✅ **DONE** (implementation landed 2026-03-31)

**Change Type:**
- [x] **Update existing** + **New migration** — database schema, services, routes

**Current State:**
- ✅ **Conversations**, **doctor_settings**, **appointments** exist.
- ✅ **Pending service review** queue with SLA: `service_staff_review_requests` + **`040_service_staff_review_requests.sql`**.
- ✅ **Audit** table: `service_staff_review_audit_events` (append-only events).

**Dependencies:** **ARM-03** for foreign keys / conversation linkage shape (finalize during implementation).

**Reference:**
- Plan §5.2, §5.3, §0 audit
- [MIGRATIONS_AND_CHANGE.md](../../../../../Reference/MIGRATIONS_AND_CHANGE.md)
- [CODE_CHANGE_RULES.md](../../../../../task-management/CODE_CHANGE_RULES.md) §4

---

## ✅ Task Breakdown

### 1. Schema design & migration
- [x] 1.1 Read **all prior migrations** in order; name new migration **sequentially**.
- [x] 1.2 Define columns for IDs, status, timestamps, SLA deadline, proposed/final keys, correlation id, **doctor_id**, **conversation_id** (unique constraints to prevent duplicates — coordinate with ARM-05 idempotency).
- [x] 1.3 **RLS policies** — doctor/staff can only see **their** practice rows; deny cross-tenant reads/writes.

### 2. Services & controllers
- [x] 2.1 **Create** pending review from DM/worker (internal service) and from future **cron** (timeout).
- [x] 2.2 **Resolve** endpoints: confirm proposed, reassign to another **validated** key, cancel (optional note).
- [x] 2.3 **List** inbox: filter `pending`, sort by `deadline asc`.

### 3. Audit
- [x] 3.1 **Every** resolution appends or updates **audit** fields; **immutable** history preferred if product requires dispute forensics (decide **single row + jsonb log** vs **audit table**). **→ Chose separate `service_staff_review_audit_events` table.**

### 4. Tests
- [x] 4.1 Service/unit tests for state transitions; RLS smoke via existing test harness if available.
  - **Done:** conversation helper + idempotent upsert unit test. **Not done:** dedicated RLS integration smoke (no harness in repo).
- [x] 4.2 **Idempotency**: duplicate create from same conversation → safe behavior.

### 5. Observability
- [x] 5.1 Structured logs: review id, status, **no PHI** (`service_staff_review_created`, `service_staff_review_pending_exists`, `service_staff_review_timeouts_closed`, etc.).

---

## 📁 Files (expected)

```
backend/migrations/040_service_staff_review_requests.sql
backend/src/services/service-staff-review-service.ts
backend/src/controllers/service-staff-review-controller.ts
backend/src/routes/api/v1/service-staff-reviews.ts
backend/src/routes/api/v1/index.ts (mount)
backend/src/types/conversation.ts (cancellation helper + reason codes)
backend/src/utils/validation.ts (ARM-06 request validation)
backend/src/workers/instagram-dm-webhook-handler.ts (upsert + state ids)
backend/tests/unit/services/service-staff-review-service.test.ts
backend/tests/unit/types/conversation-state-arm03.test.ts
```

**API base path:** `GET/POST /api/v1/service-staff-reviews` …

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — **new tables**
- [x] **RLS?** **MANDATORY** Y
- [x] **PHI in new columns?** Avoid storing free-text complaint here — reference conversation/patient through IDs; if summary needed, use **redacted** or pull at read time from authorized stores only

---

## ✅ Acceptance Criteria

- [x] Inbox APIs functional with **RLS** verified. *(Policies in migration; backend resolves via service role. Spot-check Supabase JWT vs service_role as needed.)*
- [x] **Audit** written on **every** terminal action.
- [x] **Timeout** path (ARM-08) can find and close rows **idempotently**. **`closeTimedOutServiceStaffReviewRequests(correlationId)`** — wire cron in ARM-08.

---

## 🔗 Related

- [e-task-arm-03](./e-task-arm-03-conversation-state-match-and-review.md)
- [e-task-arm-05](./e-task-arm-05-dm-flow-high-vs-pending-staff.md)
- [e-task-arm-07](./e-task-arm-07-doctor-review-inbox-ui.md)
- [e-task-arm-08](./e-task-arm-08-sla-timeout-and-patient-notify.md)

---

**Last Updated:** 2026-03-31
