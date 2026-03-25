# Task RBH-05: Split webhook worker into modules (comment / DM / router)

## 2026-03-28 — Receptionist bot hardening

---

## 📋 Task Overview

Break up the **god module** `webhook-worker.ts` into maintainable units: a thin **job router** (`processWebhookJob`), a **comment webhook handler**, a **DM / Instagram message handler**, and shared utilities already created in RBH-03/RBH-04. **No intentional behavior change.**

**Estimated Time:** 10–16 hours  
**Status:** ✅ **COMPLETE**  
**Completed:** 2026-03-28  

**Change Type:**
- [x] **Update existing** — File moves and imports; follow [CODE_CHANGE_RULES.md](../../CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** `webhook-worker.ts` ~280 lines — payment + provider gate + `isInstagramCommentPayload` router; `instagram-comment-webhook-handler.ts`; `instagram-dm-webhook-handler.ts` (DM helpers + state machine); `webhook-dm-send.ts` (RBH-04).
- ❌ **What's missing:** Optional further split of DM state machine into smaller files (future).
- ⚠️ **Notes:** Public exports unchanged: `processWebhookJob`, `handleWebhookJobFailed`, `startWebhookWorker`, `getWebhookWorker`, `stopWebhookWorker`.

**Scope Guard:**
- Expected new/changed files: ≤ 10; avoid deep nesting.
- Worker export surface (`processWebhookJob`, `startWebhookWorker`, etc.) must remain stable for callers.

**Reference Documentation:**
- [ARCHITECTURE.md](../../../Reference/ARCHITECTURE.md)
- [RECEPTIONIST_BOT_ENGINEERING.md](../../../Development/Daily-plans/March%202026/2026-03-25/Receptionist%20Bot%20improvements/RECEPTIONIST_BOT_ENGINEERING.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Preparation
- [x] 1.1 Confirm RBH-02 tests pass on main branch baseline.
- [x] 1.2 Map sections of file to target modules (comment block, DM block, helpers, worker lifecycle).

### 2. Extract handlers
- [x] 2.1 Move comment processing to dedicated module; same imports and side effects.
- [x] 2.2 Move DM state machine entry + orchestration to dedicated module; preserve lock/finally contract.
- [x] 2.3 Keep BullMQ `Worker` bootstrap in `webhook-worker.ts` per team preference.

### 3. Wire & clean
- [x] 3.1 Resolve circular dependencies (may require types-only imports or small `types` file).
- [x] 3.2 Delete unused exports; run linter and type-check.

### 4. Verification
- [x] 4.1 Full RBH-02 + existing webhook tests.
- [x] 4.2 Update [ARCHITECTURE.md](../../../Reference/ARCHITECTURE.md) brief note if module layout changed meaningfully.

---

## 📁 Files to Create/Update

```
backend/src/workers/webhook-worker.ts (thin router + lifecycle)
backend/src/workers/instagram-comment-webhook-handler.ts
backend/src/workers/instagram-dm-webhook-handler.ts
docs/Reference/ARCHITECTURE.md
```

`webhook-worker-types.ts` — not needed (types from existing modules).

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Services remain the source of business rules; workers orchestrate only.
- No PHI in new log statements.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** N
- [x] **Any PHI in logs?** N
- [x] **External API?** Unchanged pattern

---

## ✅ Acceptance & Verification Criteria

- [x] Public worker API unchanged for `index` / queue setup.
- [x] All tests pass; staging smoke recommended.

---

## 🔗 Related Tasks

- [RBH-02](./e-task-rbh-02-webhook-characterization-tests.md)
- [RBH-03](./e-task-rbh-03-merge-upcoming-appointments-helper.md)
- [RBH-04](./e-task-rbh-04-unify-dm-send-locks-fallback.md)

---

**Last Updated:** 2026-03-28  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../TASK_MANAGEMENT_GUIDE.md)
