# Task 6: E2E Testing & Test Data Compliance
## February 4–6, 2026 – Week 4: Testing & Bug Fixes (Day 5–7)

---

## 📋 Task Overview

Run and document end-to-end testing of the complete MVP flow (Instagram message → bot → booking → payment → notifications → doctor dashboard). Ensure all tests and test data comply with [TESTING.md](../../Reference/TESTING.md) and [FRONTEND_TESTING.md](../../Reference/FRONTEND_TESTING.md): no real PHI, fake placeholders only, canonical API contracts in mocks.

**Estimated Time:** 2–4 hours  
**Status:** ✅ **DONE**  
**Completed:** 2026-02-04

**Change Type:**
- [x] **New feature** — Add E2E tests or test harnesses
- [x] **Update existing** — May add/update tests; follow [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md) if changing code

**Current State:**
- ✅ **What exists:** Backend and frontend implemented (e-task-1–5); backend tests in `backend/tests/`; E2E runbook in `docs/testing/e2e-runbook.md`; test data compliance done.
- ⏸️ **Deferred:** Optional Playwright/Cypress E2E for dashboard flows (manual runbook in place).
- ⚠️ **Notes:** TESTING.md: use `PATIENT_TEST`, `+10000000000`; no real names/phones; Jest `--silent` or equivalent to avoid PHI in failure output.

**Scope Guard:**
- Expected: test runbooks, test data audit, optional E2E specs; no production data or credentials in tests.

**Reference Documentation:**
- [TESTING.md](../../Reference/TESTING.md) - PII in tests (fake placeholders), canonical contracts
- [FRONTEND_TESTING.md](../../Reference/FRONTEND_TESTING.md) - Unit, integration, E2E; mocks per CONTRACTS
- [CONTRACTS.md](../../Reference/CONTRACTS.md) - API response shapes for mocks
- [Monthly Plan Day 5–7](../../Monthly-plans/2025-01-09_1month_dev_plan.md#day-5-7-testing--bug-fixes-feb-4-6)

---

## ✅ Task Breakdown (Hierarchical)

### 1. E2E Flow Verification (Manual or Automated)
- [x] 1.1 Document or automate end-to-end flow:
  - [x] Patient sends message on Instagram (or simulated webhook)
  - [x] Bot responds and collects info
  - [x] Patient books appointment
  - [x] Payment link generated and sent
  - [x] Patient pays (test mode)
  - [x] Appointment confirmed; notifications sent
  - [x] Doctor sees appointment in dashboard (login → appointments list → detail)
- [x] 1.2 If E2E is manual: create a short runbook (steps, test accounts, env) in `docs/testing/` or task notes.
- [x] 1.3 If E2E is automated: add Playwright/Cypress (or existing tool) specs for critical dashboard flows (login, list, detail) per FRONTEND_TESTING; use test backend or mocks; no production API/credentials.

### 2. Test Data Compliance (TESTING.md)
- [x] 2.1 Audit existing tests (backend and frontend): all test data uses fake PHI placeholders (e.g. `PATIENT_TEST`, `+10000000000`, `TEST_EMAIL@example.com`); no real patient names, phones, DOBs.
- [x] 2.2 Ensure test failure output does not expose PHI: configure Jest (or test runner) with `--silent` or equivalent where appropriate; prefer structure assertions over exact PHI values.
- [x] 2.3 Verify no PHI in test snapshots; replace any PHI with placeholders and re-snapshot if needed. _(No snapshots in use; test data updated.)_

### 3. Verification
- [x] 3.1 Run backend test suite; fix any failures introduced by test-data or contract changes.
- [x] 3.2 Run frontend test suite (if any); ensure mocks match CONTRACTS. _(Frontend has no test script yet; N/A.)_
- [x] 3.3 Document in task notes: E2E runbook location (or “manual only”) and test-data compliance result.

---

## 📁 Files to Create/Update

```
docs/testing/                    (optional - E2E runbook)
backend/tests/                   (audit; fix test data if needed)
frontend/                        (optional - E2E specs; audit unit/integration tests)
```

---

## 🧠 Design Constraints

- **TESTING.md:** No real PHI in tests; fake placeholders only; no production API or credentials.
- **FRONTEND_TESTING.md:** At least one test per critical flow; API mocks match CONTRACTS.
- **CONTRACTS.md:** All mocks use `{ success: true, data, meta }` / canonical error shape.

---

## ✅ Acceptance Criteria

- [x] Full E2E flow verified (manual or automated) and documented.
- [x] Test data compliance verified: no real PHI; placeholders used; failure output/snapshots safe.
- [x] Backend and frontend test suites pass (after any fixes). _(Backend: 155 tests pass; frontend: no suite yet.)_

---

## Task notes (2026-02-04)

- **E2E runbook:** `docs/testing/e2e-runbook.md` – manual steps for Instagram → bot → booking → payment → notifications → doctor dashboard; prerequisites, test data rules, checklist.
- **Test data compliance:** Replaced PHI in backend tests with placeholders: `ai-service.test.ts` (TEST_EMAIL@example.com, 555-000-0000, PATIENT_TEST), `notification-service.test.ts` (TEST_EMAIL@example.com), `test-webhook-event-id.ts` (display_phone_number +10000000000). Other tests already used PATIENT_TEST / +10000000000.
- **Jest:** Comment added in `backend/jest.config.js` re PHI safety and `npm test -- --silent` for CI.
- **Backend tests:** All 155 tests passing (14 suites).
- **Automated E2E (1.3):** Playwright added in `frontend/`: `playwright.config.ts`, `e2e/dashboard.spec.ts` (login page load, unauthenticated redirect, optional full flow with E2E_USER/E2E_PASSWORD). Run: `cd frontend && npm run test:e2e`. See `frontend/.env.example` for optional E2E_* vars.

---

**Last Updated:** 2026-02-04  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)
