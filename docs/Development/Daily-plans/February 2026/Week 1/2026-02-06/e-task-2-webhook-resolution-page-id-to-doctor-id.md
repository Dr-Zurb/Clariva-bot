# Task 2: Webhook resolution page_id → doctor_id
## 2026-02-06 - Must-have 1: Connect Instagram

---

## 📋 Task Overview

Implement resolution of doctor from incoming Instagram webhook payload: extract page ID (e.g. from `entry[0].id` or recipient id per Meta docs), look up `doctor_id` from doctor_instagram table. Use this `doctor_id` in the webhook worker instead of `env.DEFAULT_DOCTOR_ID`. If page is unknown, do not process (mark failed, audit, optional fallback reply; no dead-letter).

**Estimated Time:** 2–2.5 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-02-06

**Change Type:**
- [ ] **New feature**
- [x] **Update existing** — Worker and possibly webhook controller/queue payload change; follow [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** `webhook-worker.ts` uses `env.DEFAULT_DOCTOR_ID`; `parseInstagramMessage` returns senderId, text, mid; payload type `InstagramWebhookPayload` has `entry[0].id`; `doctor_instagram` table exists (e-task-1) with column `instagram_page_id` (UNIQUE) for lookup.
- ❌ **What's missing:** Lookup by page_id to doctor_id; worker receives or derives page_id and uses resolved doctorId; handling for unknown page.
- ⚠️ **Notes:** Idempotency key may include page_id; ensure job data or payload passes page_id through.

**Scope Guard:**
- Expected files touched: ≤ 6
- Any expansion requires explicit approval

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md) - Audit worker and queue; map impact
- [WEBHOOKS.md](../../Reference/WEBHOOKS.md) - Retry, dead letter, idempotency (Instagram: `entry[0].id`), audit format
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - No PHI in logs; audit
- [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) - Service layer for lookup
- [STANDARDS.md](../../Reference/STANDARDS.md) - Logging, PII redaction
- [TESTING.md](../../Reference/TESTING.md) - Unit/integration test patterns
- [DEFINITION_OF_DONE.md](../../Reference/DEFINITION_OF_DONE.md) - Completion checklist
- [RECIPES.md](../../Reference/RECIPES.md) - Implementation patterns (service/worker)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Service layer
- [x] ✅ 1.1 Add a service function (e.g. in `instagram-connect-service` or `instagram-service`) that: given a page ID and optional correlation ID, queries `doctor_instagram` by column `instagram_page_id` (admin/service client), returns the corresponding `doctor_id` or null if no row exists. Implementation details (signature, file) per RECIPES.md and ARCHITECTURE.md. - **Completed: 2026-02-06**
  - [x] ✅ 1.1.1 Query uses service role or admin client so worker can resolve without user context. - **Completed: 2026-02-06**
  - [x] ✅ 1.1.2 Return type: doctor_id when row exists, null otherwise. - **Completed: 2026-02-06**
- [x] ✅ 1.2 No PHI in logs; log only correlationId, pageId (or hash) for audit if needed per COMPLIANCE. - **Completed: 2026-02-06**

### 2. Payload page ID
- [x] ✅ 2.1 Document which field is the Instagram page/object ID in the webhook payload. Per [WEBHOOKS.md](../../Reference/WEBHOOKS.md), Instagram idempotency uses `entry[0].id`; confirm with Meta docs that this same value is the page ID stored in `doctor_instagram.instagram_page_id`. Ensure types in `types/webhook.ts` allow access (e.g. `entry[0].id`). - **Completed: 2026-02-06**
- [x] ✅ 2.2 Add helper or use in worker: given `InstagramWebhookPayload`, return page_id string (or null if not present). - **Completed: 2026-02-06**

### 3. Worker changes
- [x] ✅ 3.1 Before using doctorId: get page_id from payload; call the new resolution function with page_id; if result is null (unknown page): do not create a conversation; optionally send a fallback reply to the user; mark webhook as failed in idempotency (e.g. status `failed`); write audit log (action e.g. `webhook_processed`, status failure, metadata: page_id or hash only, no PHI); return without processing. Do not dead-letter for unknown page (retry would not succeed); dead-letter is for transient failures per [WEBHOOKS.md](../../Reference/WEBHOOKS.md). - **Completed: 2026-02-06**
- [x] ✅ 3.2 Replace `const doctorId = env.DEFAULT_DOCTOR_ID` with resolved doctorId from step above (keep fallback behavior when doctorId is null). - **Completed: 2026-02-06**
- [x] ✅ 3.3 Ensure job data includes payload or page_id so worker can resolve without reading env.DEFAULT_DOCTOR_ID for primary path. - **Completed: 2026-02-06**

### 4. Audit and compliance
- [x] ✅ 4.1 Audit log when page_id has no linked doctor: use `audit_logs` with `resource_type='webhook'`, action e.g. `webhook_processed`, status failure, metadata (event_id, provider, page_id or hash only—no PHI) per [WEBHOOKS.md](../../Reference/WEBHOOKS.md) and [COMPLIANCE.md](../../Reference/COMPLIANCE.md). - **Completed: 2026-02-06**
- [x] ✅ 4.2 No token or PHI in logs (STANDARDS.md, COMPLIANCE.md). - **Completed: 2026-02-06**

### 5. Verification
- [x] ✅ 5.1 Unit test for the resolution function: returns doctor_id when a row exists for the page_id, returns null when no row exists. Follow [TESTING.md](../../Reference/TESTING.md) (no PHI in test data). - **Completed: 2026-02-06**
- [x] ✅ 5.2 Worker test or runbook: unknown page_id yields fallback behavior, no conversation created, idempotency and audit updated as specified. - **Completed: 2026-02-06**
- [x] ✅ 5.3 Type-check and lint pass; verify against [DEFINITION_OF_DONE.md](../../Reference/DEFINITION_OF_DONE.md) where applicable. - **Completed: 2026-02-06**

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   ├── instagram-connect-service.ts   (NEW - resolution page_id → doctor_id) or instagram-service.ts (UPDATE)
│   └── (optional) instagram-service.ts (UPDATE - if resolution lives here)
├── workers/
│   └── webhook-worker.ts               (UPDATE - resolve doctorId from page_id; remove DEFAULT_DOCTOR_ID usage for primary path)
└── types/
    └── webhook.ts                      (UPDATE if payload shape needs page_id access)
```

**Existing Code Status:**
- ✅ `webhook-worker.ts` - EXISTS (uses DEFAULT_DOCTOR_ID; parseInstagramMessage)
- ✅ `InstagramWebhookPayload` - EXISTS (entry[0].id available)
- ❌ Resolution function (page_id → doctor_id) - MISSING
- ⚠️ Worker - UPDATE (use resolution; handle unknown page)

**When updating existing code:** (full checklist in [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md))
- [x] **Audit:** webhook controller (where job is enqueued), worker (where doctorId is used), env (DEFAULT_DOCTOR_ID)
- [x] **Map impact:** worker gets page_id from payload → resolve doctor_id → use in findOrCreatePlaceholderPatient, createConversation, etc.; remove direct env.DEFAULT_DOCTOR_ID for main flow
- [x] **Remove obsolete:** e-task-6 will remove DEFAULT_DOCTOR_ID; this task only adds resolution and uses it (do not remove env var yet)
- [x] **Tests:** add/update tests per §5; type-check and lint
- [x] **Docs/env:** update .env.example or reference docs only if contracts or patterns change (no change needed)

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Resolution must be in service layer; worker calls service (ARCHITECTURE.md).
- Unknown page: do not create conversation; optional fallback reply; mark webhook failed and audit. Treat as permanent failure (do not dead-letter—retry would not succeed; WEBHOOKS.md).
- No PHI in logs (COMPLIANCE.md, STANDARDS.md).

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y – read doctor_instagram) → [x] **RLS verified?** (Y – service role)
- [x] **Any PHI in logs?** (MUST be No)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N)

**Rationale:** Ensures global compliance; read of doctor_instagram uses service role (no PHI in logs); no new retention or deletion impact.

---

## ✅ Acceptance & Verification Criteria

Task is complete **only when** (see also [DEFINITION_OF_DONE.md](../../Reference/DEFINITION_OF_DONE.md)):

- [x] Worker resolves doctor_id from webhook page_id via new service function.
- [x] Unknown page_id: no conversation created; fallback reply optional; audit and idempotency handled; no dead-letter for unknown page.
- [x] No reliance on DEFAULT_DOCTOR_ID for primary processing path (env can remain for e-task-6 removal).
- [x] Unit test for resolution function; type-check and lint pass ([TESTING.md](../../Reference/TESTING.md)).
- [x] Responses and errors follow canonical contracts where applicable ([CONTRACTS.md](../../Reference/CONTRACTS.md)); no PHI in logs ([COMPLIANCE.md](../../Reference/COMPLIANCE.md)).

---

## 🐛 Issues Encountered & Resolved

_(Record any issues and solutions during implementation.)_

---

## 📝 Notes

_(Learnings, deviations from plan, or references to code locations.)_

---

## 🔗 Related Tasks

- [e-task-1: Doctor Instagram storage & migration](./e-task-1-doctor-instagram-storage-migration.md)
- [e-task-6: Remove DEFAULT_DOCTOR_ID reliance](./e-task-6-remove-default-doctor-id-reliance.md)

---

**Last Updated:** 2026-02-06  
**Completed:** 2026-02-06  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)
