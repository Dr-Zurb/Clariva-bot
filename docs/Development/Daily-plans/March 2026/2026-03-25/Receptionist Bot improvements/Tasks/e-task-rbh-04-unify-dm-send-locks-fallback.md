# Task RBH-04: Unify DM send path (locks, throttle, 2018001 fallback)

## 2026-03-28 — Receptionist bot hardening

---

## 📋 Task Overview

Consolidate the **duplicate** Instagram DM send sequences: normal post-state-machine path and **conflict-recovery** path in `webhook-worker.ts`. Both must acquire the same send locks, respect reply throttle, and apply the same `NotFound` / conversation-API fallback behavior so fixes never apply to only one path.

**Estimated Time:** 6–8 hours  
**Status:** ✅ **COMPLETE**  
**Completed:** 2026-03-28  

**Change Type:**
- [x] **Update existing** — Refactor; behavior must match pre-refactor — follow [CODE_CHANGE_RULES.md](../../CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** `backend/src/workers/webhook-dm-send.ts` — `sendInstagramDmWithLocksAndFallback` with `context: 'default' | 'conflict_recovery'`; unit tests `webhook-dm-send.test.ts`.
- ❌ **What's missing:** —
- ⚠️ **Notes:** Conflict-recovery **reply throttle skip** now records `logAuditEvent` with `recovered: true` and `skipped_reply_throttle` (parity with main path). Main path still logs `logWebhookInstagramDmDelivery` on success/failure; recovery path still logs `logWebhookConflictRecovery` on success.

**Scope Guard:**
- Expected files touched: ≤ 3
- No API or product copy changes.

**Reference Documentation:**
- [RECEPTIONIST_BOT_ENGINEERING.md](../../../Development/Daily-plans/March%202026/2026-03-25/Receptionist%20Bot%20improvements/RECEPTIONIST_BOT_ENGINEERING.md)
- [EXTERNAL_SERVICES.md](../../../Reference/EXTERNAL_SERVICES.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Audit
- [x] 1.1 Diff the two paths: list parameters (pageId, senderId, eventId, doctorToken, replyText, correlationId).
- [x] 1.2 Confirm identical ordering: send lock → reply throttle → send → fallback conditions.

### 2. Extract
- [x] 2.1 Introduce one function or small module used by both call sites; same error propagation.
- [x] 2.2 Remove duplicated catch blocks; ensure recovery path still sets audit metadata correctly (`recovered: true`).

### 3. Verification
- [x] 3.1 RBH-02 tests or manual: throttle skip, 2018001 fallback, successful send.
- [x] 3.2 Type-check; no new PHI logging.

---

## 📁 Files to Create/Update

```
backend/src/workers/webhook-worker.ts
backend/src/workers/webhook-dm-send.ts
backend/tests/unit/workers/webhook-dm-send.test.ts
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Instagram message length and token source unchanged.
- Lock keys and TTL behavior must not change without explicit security review.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** N
- [x] **Any PHI in logs?** N
- [x] **External API?** Same as today (Instagram)

---

## ✅ Acceptance & Verification Criteria

- [x] Behavior parity verified; duplicate send logic eliminated.
- [x] Tests green.

---

## 🔗 Related Tasks

- [RBH-02](./e-task-rbh-02-webhook-characterization-tests.md)
- [RBH-05](./e-task-rbh-05-split-webhook-worker-modules.md)

---

**Last Updated:** 2026-03-28  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../TASK_MANAGEMENT_GUIDE.md)
