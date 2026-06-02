# Task 8: Improvements & Cleanup
## January 21, 2026 - Post–Webhook Integration

---

## 📋 Task Overview

Address post–webhook-integration improvements: align code with ARCHITECTURE layer boundaries, clarify configuration and error contracts, update reference documentation to match the codebase, and remove deprecated code. Ensures consistency with STANDARDS and ARCHITECTURE and reduces technical debt.

**Estimated Time:** 2–3 hours  
**Status:** ✅ **DONE**

**Current State:**
- ✅ **Backend:** Instagram webhook flow complete (Tasks 1–7); health, webhook, queue, worker, services in place
- ✅ **Reference docs:** STANDARDS, CONTRACTS, WEBHOOKS, ERROR_CATALOG, COMPLIANCE, OBSERVABILITY aligned with current patterns
- ⚠️ **Gaps:** Health controller imports `config/database`; ARCHITECTURE project structure uses example filenames; ENCRYPTION_KEY optional but required for dead letter; generic errors return code `"Error"`; deprecated `logError` unused; auth middleware not yet used by any route; webhook body sanitization policy not documented; integration test run instructions not in TESTING.md

**Scope Guard:**
- Expected files touched: backend (controllers, config, utils, services), docs/Reference (ARCHITECTURE, env.example or WEBHOOKS/EXTERNAL_SERVICES, TESTING)
- Any expansion requires explicit approval

**Reference Documentation:**
- [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md) - Layer boundaries, project structure
- [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) - Coding rules, response contracts
- [CONTRACTS.md](../../Reference/engineering/architecture/CONTRACTS.md) - API response format
- [ERROR_CATALOG.md](../../Reference/engineering/development/ERROR_CATALOG.md) - Error classes and codes
- [WEBHOOKS.md](../../Reference/engineering/operations/WEBHOOKS.md) - Webhook and dead letter requirements
- [TESTING.md](../../Reference/engineering/development/TESTING.md) - Test types and how to run

---

## ✅ Task Breakdown (Hierarchical)

### 1. Architecture & Layer Boundaries
- [x] 1.1 Align health check with ARCHITECTURE
  - [x] 1.1.1 Move database connection test out of controller (controller must not call `config/database` directly per ARCHITECTURE)
  - [x] 1.1.2 Introduce a health or database service (or reuse existing database-service) that performs the connection test — added `services/health-service.ts` calling `testConnection` from config/database
  - [x] 1.1.3 Health controller calls only the service; no direct dependency on `config/database` — health-controller now imports `checkDatabaseConnection` from health-service
- [x] 1.2 Clarify controller → config boundary in docs
  - [x] 1.2.1 In ARCHITECTURE (or RECIPES), state explicitly whether controllers may import `config/env`, `config/logger`, `config/queue` — ARCHITECTURE "What Goes Where" and new note: controllers may use config/env, config/logger, config/queue; must not use config/database directly

### 2. Configuration & Dead Letter
- [x] 2.1 ENCRYPTION_KEY and dead letter usage
  - [x] 2.1.1 Document that ENCRYPTION_KEY is required when webhooks and dead letter queue are used — WEBHOOKS.md "Dead Letter Handling" + backend `.env.example` with comment and ENCRYPTION_KEY=
  - [x] 2.1.2 Optionally: validate at startup — documented only; no startup validation added

### 3. Error Handling & Contracts
- [x] 3.1 Stable error code for untyped errors
  - [x] 3.1.1 In global error middleware / formatError, ensure untyped (non-AppError) errors return a stable API `code` — formatError now uses `InternalServerError` for non-AppError
  - [x] 3.1.2 Keep existing AppError subclass names as response codes where applicable — unchanged
- [x] 3.2 Remove or finalize deprecated code
  - [x] 3.2.1 Remove deprecated `logError` from `utils/errors.ts` (unused); OBSERVABILITY.md note added to use only logger from config/logger

### 4. Webhook & Sanitization Policy
- [x] 4.1 Document webhook body sanitization
  - [x] 4.1.1 Decide and document — kept as-is (global sanitization); WEBHOOKS.md new subsection "Body and signature (raw vs sanitized)"
  - [x] 4.1.2 Document that signature uses rawBody, queue payload uses req.body (may be sanitized)

### 5. Documentation Updates
- [x] 5.1 ARCHITECTURE project structure
  - [x] 5.1.1 Update the "Project Structure" tree in ARCHITECTURE.md — updated to current layout (webhook-controller, instagram-service, dead-letter-service, health-service, webhook-worker, config/queue, routes/webhooks, workers/, utils, types, middleware)
- [x] 5.2 Auth and protected routes
  - [x] 5.2.1 ARCHITECTURE "Protected routes" note: mount authenticateToken and optionally userLimiter; see RECIPES R-AUTH-001
- [x] 5.3 TESTING.md integration tests
  - [x] 5.3.1 TESTING.md section 5: "Unit tests vs server-required integration scripts" — npm test for unit; npx ts-node tests/integration/<script> with server running

### 6. Verification & Testing
- [x] 6.1 Run verification
  - [x] 6.1.1 Run `npm run type-check` (must pass) — passed
  - [x] 6.1.2 Run `npm run lint` (must pass) — passed (0 errors; pre-existing warnings unchanged)
  - [x] 6.1.3 Run existing unit tests — queue + webhook-worker + instagram-service tests pass; fixed TS in webhook-worker.test.ts (auditCalls map callback type). Webhook-controller 6.1.1/6.1.2 remain failing (pre-existing mock setup)
- [x] 6.2 Confirm acceptance criteria
  - [x] 6.2.1 Health unchanged (service path); 200/503 contract unchanged
  - [x] 6.2.2 Error responses: untyped errors now return code `InternalServerError`
  - [x] 6.2.3 Reference docs updated to match codebase

---

## 📁 Files to Create/Update

```
backend/src/
├── controllers/health-controller.ts   (update: remove config/database; call service)
├── services/                         (add or use: health/database connection test)
├── utils/errors.ts                   (update: remove or document logError; formatError if changed)
└── index.ts                          (optional: formatError / error middleware if centralized)

docs/Reference/
├── ARCHITECTURE.md                   (update: project structure; controller→config; auth usage)
├── WEBHOOKS.md or EXTERNAL_SERVICES  (update: ENCRYPTION_KEY requirement when using dead letter)
├── TESTING.md                        (update: how to run integration tests)
└── OBSERVABILITY.md or RECIPES      (optional: note to use logger only; auth pattern)

backend/
└── .env.example                     (optional: comment that ENCRYPTION_KEY required for webhooks/dead letter)
```

**Existing Code Status:**
- ✅ `backend/src/controllers/health-controller.ts` - EXISTS (calls `testConnection` from config/database)
- ✅ `backend/src/config/database.ts` - EXISTS (`testConnection` present)
- ✅ `backend/src/utils/errors.ts` - EXISTS (`logError` deprecated, unused; `formatError` used by middleware)
- ✅ `backend/src/middleware/sanitize-input.ts` - EXISTS (applied globally; webhooks use rawBody for signature)
- ✅ `docs/Reference/engineering/architecture/ARCHITECTURE.md` - EXISTS (structure uses example filenames)
- ✅ `docs/Reference/engineering/development/TESTING.md` - EXISTS (integration run instructions can be added)

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Controllers must not depend on `config/database` directly (ARCHITECTURE); services may use config/database.
- All success responses must use `successResponse`; errors must use error middleware and canonical format (STANDARDS, CONTRACTS).
- No PHI/PII in logs (COMPLIANCE); webhook payload and body must not be logged.
- Error response `code` must align with ERROR_CATALOG and CONTRACTS (stable codes for clients).
- Task describes WHAT to do; HOW (exact functions, schemas) lives in RECIPES/STANDARDS and code.

---

## 🌍 Global Safety Gate (MANDATORY)

Task **CANNOT proceed** unless this section is completed:

- [x] **Data touched?** (N) - No new PHI/PII; health and errors are metadata/config.
  - [x] **RLS verified?** (N/A)
- [x] **Any PHI in logs?** (MUST be No) - No change to logging of user data.
- [x] **External API or AI call?** (N) - No new external calls.
- [x] **Retention / deletion impact?** (N) - No retention changes.

**Rationale:** Ensures compliance and audit trail; changes are structural and documentation-only where possible.

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**

- [x] Health check no longer imports `config/database` directly; connection test is performed via health-service.
- [x] ENCRYPTION_KEY requirement for dead letter is documented (WEBHOOKS.md + .env.example).
- [x] Untyped errors return a stable `code` (`InternalServerError`) in API responses.
- [x] Deprecated `logError` removed; “do not use”; OBSERVABILITY.md states use only logger from config/logger.
- [x] Webhook body sanitization policy documented in WEBHOOKS.md (rawBody for signature; req.body may be sanitized).
- [x] ARCHITECTURE project structure and controller/config and auth guidance updated.
- [x] TESTING.md explains how to run integration scripts (server required, npx ts-node).
- [x] type-check and lint pass; unit tests (queue, worker) pass; webhook-controller 6.1.1/6.1.2 pre-existing failures noted.

**See also:** [DEFINITION_OF_DONE.md](../../Reference/engineering/development/DEFINITION_OF_DONE.md) for full checklist.

---

## 🐛 Issues Encountered & Resolved

- **PowerShell:** Used `;` instead of `&&` for chaining commands in backend verification.
- **webhook-worker.test.ts:** Fixed TS18046 (`c` is of type 'unknown') by typing the auditCalls map callback: `(c: unknown) => (c as [Record<string, unknown>])[0]?.resourceId`.
- **webhook-controller 6.1.1/6.1.2:** Two performance tests still fail (res.status/mockAdd not called); pre-existing mock setup (queue or logAuditEvent). Not fixed in this task.

---

## 📝 Notes

- This task is driven by a post–webhook-integration review of backend and docs/Reference.
- Prioritize: (1) health → service boundary, (2) ENCRYPTION_KEY docs/validation, (3) error code and docs, (4) sanitization policy and ARCHITECTURE/docs updates.
- Auth middleware is implemented but not yet mounted on any route; documenting the pattern now avoids drift when adding protected routes.

---

## 🔗 Related Tasks

- [Task 7: Testing & Verification](./e-task-7-webhook-testing.md) - Preceding verification
- [Task 6: Webhook Processing Queue & Worker](./e-task-6-webhook-queue.md) - Queue and worker
- [Task 4: Webhook Controller & Routes](./e-task-4-webhook-controller.md) - Webhook controller
- [Task 2: Dead Letter Queue](./e-task-2-dead-letter-queue.md) - Dead letter and encryption

---

**Last Updated:** 2026-01-28  
**Completed:** 2026-01-28  
**Related Learning:** `docs/Archive/learning/2026-01-21/l-task-8-improvements-and-cleanup.md` (optional)  
**Pattern:** Architecture alignment, documentation drift guard, cleanup  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)

---

**Version:** 1.0.0
