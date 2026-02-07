# Task 6: Remove DEFAULT_DOCTOR_ID reliance
## 2026-02-06 - Must-have 1: Connect Instagram

---

## 📋 Task Overview

Remove or replace all reliance on single global `DEFAULT_DOCTOR_ID` and single env Instagram for multi-doctor use. Worker already uses page_id → doctor_id resolution (e-task-2); this task: remove env var usage from worker (and any other callers), update .env.example and config, document that multi-doctor requires each doctor to connect Instagram. Optional: keep a documented fallback for development (e.g. single-tenant dev mode) only if product agrees.

**Estimated Time:** 1–1.5 hours  
**Status:** ✅ **IMPLEMENTED**  
**Completed:** 2026-02-06

**Change Type:**
- [ ] **New feature**
- [x] **Update existing** — Remove env DEFAULT_DOCTOR_ID usage; follow [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** e-task-2 resolution: worker uses `getDoctorIdByPageId(pageId)` only; when null, worker marks webhook failed (no conversation). env.ts has `DEFAULT_DOCTOR_ID` and `INSTAGRAM_PAGE_ID` optional; .env.example documents both. webhook-worker.ts has only a comment referencing DEFAULT_DOCTOR_ID (no code path uses it).
- ❌ **What's missing:** Remove obsolete comment from worker; remove or deprecate DEFAULT_DOCTOR_ID and INSTAGRAM_PAGE_ID from env schema and .env.example; update tests that mock DEFAULT_DOCTOR_ID; update setup/deployment docs if they reference these.
- ⚠️ **Notes:** Production path is already resolution-only; this task is cleanup and config/docs so no single-tenant assumption remains.

**Scope Guard:** Expected files touched: ≤ 5

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md) - Audit, impact, remove obsolete, update tests
- [STANDARDS.md](../../Reference/STANDARDS.md) - Config, env
- [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) - Config layer; no business logic in env
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - No single-tenant assumption for production
- [TESTING.md](../../Reference/TESTING.md) - Update tests when removing env/behavior
- [DEFINITION_OF_DONE.md](../../Reference/DEFINITION_OF_DONE.md) - Completion checklist

---

## ✅ Task Breakdown (Hierarchical)

### 1. Audit (per CODE_CHANGE_RULES)
- [x] 1.1 Grep for `DEFAULT_DOCTOR_ID` and `INSTAGRAM_PAGE_ID`: list all files and usages (worker, config, tests, .env.example, any setup docs)
- [x] 1.2 Confirm: no code path in worker uses `env.DEFAULT_DOCTOR_ID` for message handling; only resolution from `doctor_instagram` is valid
- [x] 1.3 Impact list: worker (comment only), env.ts, .env.example, webhook-worker.test.ts, any docs referencing these vars

### 2. Worker
- [x] 2.1 Remove or reword the comment in webhook-worker.ts that references DEFAULT_DOCTOR_ID (e.g. "Fallback when resolution returns null or AI/conversation flow is skipped")
- [x] 2.2 Ensure when `getDoctorIdByPageId` returns null: behavior stays as-is (fallback reply, mark processed/failed; no use of DEFAULT_DOCTOR_ID)
- [x] 2.3 If product agrees: remove DEFAULT_DOCTOR_ID from env schema entirely; otherwise mark deprecated and document “dev only”

### 3. Config and env
- [x] 3.1 env.ts: remove DEFAULT_DOCTOR_ID from required/optional schema or mark deprecated with comment
- [x] 3.2 .env.example: remove or comment DEFAULT_DOCTOR_ID and INSTAGRAM_PAGE_ID with note “Multi-doctor: each doctor connects Instagram via dashboard; not used in production”
- [x] 3.3 Update any deployment or setup docs that reference DEFAULT_DOCTOR_ID

### 4. Tests
- [x] 4.1 webhook-worker.test.ts: remove or replace env mock that sets `DEFAULT_DOCTOR_ID`; use resolution mock (`getDoctorIdByPageId`) or doctor_instagram-based test data
- [x] 4.2 Remove or adjust assertions that depend on DEFAULT_DOCTOR_ID; keep coverage for "unknown page_id → no conversation / fallback reply"

### 5. Verification
- [x] 5.1 Worker with unknown page_id (no doctor_instagram row): fallback reply, no conversation, no reliance on any default doctor
- [x] 5.2 Worker with linked page_id: resolution returns doctor_id; flow unchanged
- [x] 5.3 Type-check and lint; see [DEFINITION_OF_DONE.md](../../Reference/DEFINITION_OF_DONE.md)

---

## 📁 Files to Create/Update

```
backend/
├── .env.example                       (UPDATE - remove or deprecate DEFAULT_DOCTOR_ID, INSTAGRAM_PAGE_ID)
├── src/
│   ├── config/
│   │   └── env.ts                     (UPDATE - remove or deprecate DEFAULT_DOCTOR_ID)
│   └── workers/
│       └── webhook-worker.ts          (UPDATE - remove DEFAULT_DOCTOR_ID fallback)
└── tests/
    └── unit/
        └── workers/
            └── webhook-worker.test.ts (UPDATE - use resolution mock)
```

**Existing Code Status:**
- ✅ webhook-worker.ts - EXISTS (uses DEFAULT_DOCTOR_ID when not set; e-task-2 adds resolution)
- ✅ env.ts - EXISTS (DEFAULT_DOCTOR_ID optional)
- ⚠️ Worker - UPDATE (remove fallback); env - UPDATE (deprecate or remove)

**When updating existing code:**
- [x] Audit: webhook-worker.ts, env.ts, .env.example, any setup docs, tests
- [x] Map: worker logic when doctorId is null (no DEFAULT_DOCTOR_ID); env schema; test mocks
- [x] Remove: DEFAULT_DOCTOR_ID usage in worker; optional: remove from env schema and .env.example
- [x] Update tests and docs per CODE_CHANGE_RULES

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Production path must never rely on a single global doctor ID; only page_id → doctor_id resolution.
- If dev-only fallback is kept, it must be explicit (e.g. env flag) and logged as non-production.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (N – config and code only)
- [x] **Any PHI in logs?** (MUST be No)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] No code path in production uses DEFAULT_DOCTOR_ID for message handling.
- [x] Unknown page_id continues to get fallback reply and no conversation (e-task-2 behavior).
- [x] .env.example and config reflect multi-doctor setup (each doctor connects Instagram).
- [x] Tests updated and passing; type-check passed.

---

## 🔗 Related Tasks

- [e-task-2: Webhook resolution page_id → doctor_id](./e-task-2-webhook-resolution-page-id-to-doctor-id.md)

---

**Last Updated:** 2026-02-06  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)
