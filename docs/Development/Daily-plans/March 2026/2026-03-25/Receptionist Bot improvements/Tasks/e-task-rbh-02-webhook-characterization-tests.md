# Task RBH-02: Webhook worker characterization tests

## 2026-03-28 — Receptionist bot hardening

---

## 📋 Task Overview

Add **automated tests** that pin behavior of the receptionist pipeline **before** large refactors: golden-path DM segments (consent, match confirmation, cancel/reschedule multi-appointment, post-booking), comment high-intent path (mocks), and controller edge cases already partially covered. Reduces regression risk for market readiness.

**Estimated Time:** 12–18 hours  
**Status:** ✅ **COMPLETE**  
**Completed:** 2026-03-28  

**Change Type:**
- [x] **Update existing** — Extend `backend/tests/unit` (and integration if appropriate) — follow [CODE_CHANGE_RULES.md](../../CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** `webhook-worker.test.ts`, `webhook-worker-characterization.test.ts` (RBH-02), `webhook-controller.test.ts`, integration tests for verification idempotency.
- ❌ **What's missing:** Optional post-booking DM segment tests; broader integration coverage.
- ⚠️ **Notes:** Prefer extracting **testable pure helpers** in RBH-03/RBH-04 first only if it unblocks assertions; otherwise mock services at boundaries per existing patterns.

**Scope Guard:**
- Tests only; production behavior unchanged unless a bug is uncovered (then fix under separate checklist).
- Expected files touched: ≤ 8

**Reference Documentation:**
- [TESTING.md](../../../Reference/TESTING.md)
- [RECEPTIONIST_BOT_ENGINEERING.md](../../../Development/Daily-plans/March%202026/2026-03-25/Receptionist%20Bot%20improvements/RECEPTIONIST_BOT_ENGINEERING.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Test plan & fixtures
- [x] 1.1 List mandatory branches from engineering doc §2 and §5.
- [x] 1.2 Define minimal mock payloads (Instagram message vs comment) without real PHI.

### 2. DM characterization
- [x] 2.1 Test: after collecting details, consent granted persists patient and transitions to slot link state (mock DB/services).
- [x] 2.2 Test: `awaiting_match_confirmation` yes/no/1/2 paths.
- [x] 2.3 Test: cancel flow with multiple upcoming appointments → numeric choice → confirmation.
- [x] 2.4 Test: reschedule flow with multiple upcoming appointments → numeric choice.
- [x] 2.5 Test: send throttle / event send lock skip marks processed without double send (metadata assertions).

### 3. Comment characterization
- [x] 3.1 Test: high-intent comment invokes `sendInstagramMessage` + `replyToInstagramComment` with doctor token (mocked).
- [x] 3.2 Test: skip intent (e.g. vulgar) does not outreach.
- [x] 3.3 Test: second-stage medical override path when configured by mocks.

### 4. CI & docs
- [x] 4.1 Ensure tests run in default `npm test` / CI target.
- [x] 4.2 Add short subsection to TESTING.md or engineering doc pointing to these tests.

---

## 📁 Files to Create/Update

```
backend/tests/unit/workers/webhook-worker-characterization.test.ts
docs/Reference/TESTING.md
```

**When updating existing code:**
- [x] Do not log real PHI in test fixtures; use synthetic IDs/strings.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Tests must not call live Meta or OpenAI; mock at service boundaries.
- Fixture strings should be generic (no real patient data).

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** N in prod; test DB may use mocks only
- [x] **Any PHI in logs?** N
- [x] **External API or AI call?** N in CI
- [x] **Retention / deletion impact?** N

---

## ✅ Acceptance & Verification Criteria

- [x] New tests fail on intentional regression of targeted branches (verified locally by temporary break).
- [x] CI green; TESTING.md references receptionist characterization suite.

---

## 🔗 Related Tasks

- [RBH-03](./e-task-rbh-03-merge-upcoming-appointments-helper.md)
- [RBH-05](./e-task-rbh-05-split-webhook-worker-modules.md)

---

**Last Updated:** 2026-03-28  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../TASK_MANAGEMENT_GUIDE.md)
