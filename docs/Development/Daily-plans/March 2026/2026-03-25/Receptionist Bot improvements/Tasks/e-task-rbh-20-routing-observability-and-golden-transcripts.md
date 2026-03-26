# Task RBH-20: Routing observability & golden transcripts

## 2026-03-28 — Know which branch ran; regress less

---

## 📋 Task Overview

**Problem:** Debugging “wrong language” or “wrong fee” requires reading logs and guessing **which branch** executed (medical fast-path vs LLM vs fee quote). **Keyword + LLM** stacks are hard to reason about without **structured telemetry** and **fixtures**.

**Goal:**
1. **Structured log fields** per DM turn: `intent`, `intent_topics` (post RBH-18), `branch` (enum), `state_step_before`, `state_step_after`.
2. **Golden transcript tests** (redacted): JSON fixtures → expected `branch` for narrow routing scenarios.

**Estimated Time:** 2–4 days  
**Status:** ✅ **DONE** (2026-03-28)  
**Change Type:**
- [x] **Update existing** — worker logging; test harness

**Scope Guard:**
- No PHI in logs; use patient/conversation IDs only where already allowed.

**Shipped:** `DmHandlerBranch` in `backend/src/types/dm-instrumentation.ts`, `logInstagramDmRouting` → message `instagram_dm_routing`, fixtures under `backend/tests/fixtures/dm-transcripts/`, `resolveRoutingBranchForFixture` + `dm-routing-golden.test.ts`, checklist + `OBSERVABILITY.md`.

---

## ✅ Task Breakdown

### 1. Branch enum + instrumentation
- [x] 1.1 Define `DmHandlerBranch` — `backend/src/types/dm-instrumentation.ts`.
- [x] 1.2 One consolidated **`logger.info`** per turn — `logInstagramDmRouting` after `stateToPersist` (plus `conflict_recovery_ai` on recovery path).

### 2. Golden transcripts
- [x] 2.1 `backend/tests/fixtures/dm-transcripts/` — 6 JSON scenarios (medical, emergency, fee idle/mid, book misclassified fee, greeting).
- [x] 2.2 Partial mirror `resolveRoutingBranchForFixture` for fixtures; extend when adding scenarios.

### 3. Dashboard / ops (optional)
- [x] 3.1 Document queries — `docs/Reference/OBSERVABILITY.md` (count by `branch`, `conflict_recovery_ai`). *(We use deterministic fees, not `fee_injected_prompt`.)*

### 4. Docs
- [x] 4.1 `MANUAL_TEST_CHECKLIST_INSTAGRAM_BOT.md` — **Expected branch (RBH-20)** column for §2.

---

## 📁 Files to Create/Update

```
backend/src/workers/instagram-dm-webhook-handler.ts
backend/src/types/dm-instrumentation.ts
backend/src/utils/log-instagram-dm-routing.ts
backend/src/utils/dm-routing-fixture-resolve.ts
backend/tests/fixtures/dm-transcripts/*
backend/tests/unit/workers/dm-routing-golden.test.ts
docs/.../MANUAL_TEST_CHECKLIST_INSTAGRAM_BOT.md
docs/Reference/OBSERVABILITY.md
```

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N (logs metadata)
- [x] **PHI in logs?** N (verify)
- [x] **External API?** N

---

## 🔗 Related Tasks

- **RBH-01** — observability baseline
- **RBH-18** — topics in logs
- **RBH-17** — architecture vocabulary (Understand / Decide / Say)

---

**Last Updated:** 2026-03-28
