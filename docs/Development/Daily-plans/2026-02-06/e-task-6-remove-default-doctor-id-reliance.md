# Task 6: Remove DEFAULT_DOCTOR_ID reliance
## 2026-02-06 - Must-have 1: Connect Instagram

---

## 📋 Task Overview

Remove or replace all reliance on single global `DEFAULT_DOCTOR_ID` and single env Instagram for multi-doctor use. Worker already uses page_id → doctor_id resolution (e-task-2); this task: remove env var usage from worker (and any other callers), update .env.example and config, document that multi-doctor requires each doctor to connect Instagram. Optional: keep a documented fallback for development (e.g. single-tenant dev mode) only if product agrees.

**Estimated Time:** 1–1.5 hours  
**Status:** ⏳ **PENDING**  
**Completed:** —

**Change Type:**
- [ ] **New feature**
- [x] **Update existing** — Remove env DEFAULT_DOCTOR_ID usage; follow [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** `env.DEFAULT_DOCTOR_ID` in webhook-worker.ts (fallback when not set); env.ts validates DEFAULT_DOCTOR_ID as optional; .env.example has DEFAULT_DOCTOR_ID= and INSTAGRAM_PAGE_ID=.
- ❌ **What's missing:** Worker no longer uses DEFAULT_DOCTOR_ID for primary path (e-task-2); removal of fallback or restriction to dev-only; env and docs updated.
- ⚠️ **Notes:** All message handling must use page_id → doctor_id resolution; unknown page already handled in e-task-2.

**Scope Guard:** Expected files touched: ≤ 5

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md) - Audit, impact, remove obsolete
- [STANDARDS.md](../../Reference/STANDARDS.md) - Config, env
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - No single-tenant assumption for production

---

## ✅ Task Breakdown (Hierarchical)

### 1. Audit
- [ ] 1.1 Grep for DEFAULT_DOCTOR_ID and INSTAGRAM_PAGE_ID: list all files and usages (worker, config, tests, .env.example)
- [ ] 1.2 Document: worker must not use DEFAULT_DOCTOR_ID for production path; only resolution from doctor_instagram is valid for multi-doctor

### 2. Worker
- [ ] 2.1 Remove branch that uses `env.DEFAULT_DOCTOR_ID` when resolution returns null (or keep only for dev/single-tenant with explicit env flag e.g. ALLOW_DEFAULT_DOCTOR_DEV=true and log warning)
- [ ] 2.2 When getDoctorIdByPageId returns null: keep current behavior (fallback reply, mark processed/failed, audit); do not use DEFAULT_DOCTOR_ID as fallback in production
- [ ] 2.3 If product agrees: remove DEFAULT_DOCTOR_ID from env schema entirely; otherwise mark deprecated and document “dev only”

### 3. Config and env
- [ ] 3.1 env.ts: remove DEFAULT_DOCTOR_ID from required/optional schema or mark deprecated with comment
- [ ] 3.2 .env.example: remove or comment DEFAULT_DOCTOR_ID and INSTAGRAM_PAGE_ID with note “Multi-doctor: each doctor connects Instagram via dashboard; not used in production”
- [ ] 3.3 Update any deployment or setup docs that reference DEFAULT_DOCTOR_ID

### 4. Tests
- [ ] 4.1 Update unit tests that set DEFAULT_DOCTOR_ID: use resolution mock or test with doctor_instagram row instead
- [ ] 4.2 Remove or adjust tests that assert behavior when DEFAULT_DOCTOR_ID is set (replace with resolution-based tests)

### 5. Verification
- [ ] 5.1 Worker with no DEFAULT_DOCTOR_ID and unknown page_id: fallback reply, no conversation
- [ ] 5.2 Worker with linked page_id: resolution returns doctor_id; flow unchanged
- [ ] 5.3 Type-check and lint

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
- [ ] Audit: webhook-worker.ts, env.ts, .env.example, any setup docs, tests
- [ ] Map: worker logic when doctorId is null (no DEFAULT_DOCTOR_ID); env schema; test mocks
- [ ] Remove: DEFAULT_DOCTOR_ID usage in worker; optional: remove from env schema and .env.example
- [ ] Update tests and docs per CODE_CHANGE_RULES

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Production path must never rely on a single global doctor ID; only page_id → doctor_id resolution.
- If dev-only fallback is kept, it must be explicit (e.g. env flag) and logged as non-production.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (N – config and code only)
- [ ] **Any PHI in logs?** (MUST be No)
- [ ] **External API or AI call?** (N)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [ ] No code path in production uses DEFAULT_DOCTOR_ID for message handling.
- [ ] Unknown page_id continues to get fallback reply and no conversation (e-task-2 behavior).
- [ ] .env.example and config reflect multi-doctor setup (each doctor connects Instagram).
- [ ] Tests updated and passing.

---

## 🔗 Related Tasks

- [e-task-2: Webhook resolution page_id → doctor_id](./e-task-2-webhook-resolution-page-id-to-doctor-id.md)

---

**Last Updated:** 2026-02-06  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)
