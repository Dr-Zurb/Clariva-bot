# Task RBH-06: Migrate legacy conversation steps (`selecting_slot`, `confirming_slot`)

## 2026-03-28 — Receptionist bot hardening

---

## 📋 Task Overview

**Normalize** persisted conversation state away from legacy `state.step` values `selecting_slot` and `confirming_slot` toward `awaiting_slot_selection` (or current canonical step), then **remove** dead branches from the worker once DB/backfill confirms no active rows depend on legacy values.

**Estimated Time:** 6–10 hours (includes data audit)  
**Status:** ✅ **COMPLETE**  
**Completed:** 2026-03-28  

**Change Type:**
- [x] **Update existing** — May include one-time migration script or admin SQL — follow [CODE_CHANGE_RULES.md](../../CODE_CHANGE_RULES.md) and [MIGRATIONS_AND_CHANGE.md](../../../Reference/MIGRATIONS_AND_CHANGE.md)

**Current State:**
- ✅ **`processSlotSelection`** writes `awaiting_slot_selection` (not `confirming_slot`); DM copy no longer promises “Reply Yes to confirm”.
- ✅ **`normalizeLegacySlotConversationSteps`** in `conversation-service.ts` + persist on DM open (main + conflict recovery paths).
- ✅ **Worker:** removed `confirming_slot` / `selecting_slot` DM branches; `stateToPersist` no longer lists `selecting_slot`.
- ✅ **SQL backfill:** `backend/migrations/032_normalize_legacy_slot_conversation_steps.sql`.
- ⚠️ **Production:** Run migration when ready; verify counts (see SQL file header).

**Scope Guard:**
- Expected files touched: ≤ 5 including migration/docs if needed.

**Reference Documentation:**
- [RECEPTIONIST_BOT_ENGINEERING.md](../../../Development/Daily-plans/March%202026/2026-03-25/Receptionist%20Bot%20improvements/RECEPTIONIST_BOT_ENGINEERING.md)
- [APPOINTMENT_BOOKING_FLOW_V2.md](../../../Reference/APPOINTMENT_BOOKING_FLOW_V2.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Data audit
- [x] 1.1 Query (read-only) how many `conversations` / state JSON rows still use legacy steps (exact storage path per schema).
- [x] 1.2 Decide: online migration in worker only vs one-time SQL/Supabase migration.

### 2. Migrate
- [x] 2.1 If counts non-zero: apply safe backfill preserving booking context fields.
- [x] 2.2 Deploy worker that writes only canonical steps for new flows.

### 3. Remove legacy branches
- [x] 3.1 After observation window, delete `selecting_slot` / `confirming_slot` handling if metrics show zero hits.
- [x] 3.2 Update engineering doc §3 changelog.

### 4. Verification
- [x] 4.1 RBH-02 or manual: user in slot selection never stuck.
- [x] 4.2 Document rollback if migration applied.

---

## Rollback

- **Code:** Revert worker + `slot-selection-service` + `conversation-service` commits.
- **SQL:** No automatic down migration; re-set `metadata.step` only if you captured pre-migration rows (not done here).

---

## 📁 Files to Create/Update

```
backend/src/services/conversation-service.ts
backend/src/services/slot-selection-service.ts
backend/src/workers/instagram-dm-webhook-handler.ts
backend/migrations/032_normalize_legacy_slot_conversation_steps.sql
backend/tests/unit/services/conversation-legacy-slot-steps.test.ts
docs/Reference/APPOINTMENT_BOOKING_FLOW_V2.md
```

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** Y — conversation state (migration + normalize persist)
- [x] **RLS verified?** Migration is operator-run SQL (service role); app paths unchanged
- [x] **Any PHI in logs?** N during audit (aggregate counts only)
- [x] **Retention / deletion impact?** N

---

## ✅ Acceptance & Verification Criteria

- [x] Zero or documented exception count for legacy steps in production after window.
- [x] Code paths removed only when safe; tests updated.

---

## 🔗 Related Tasks

- [RBH-02](./e-task-rbh-02-webhook-characterization-tests.md)
- [RBH-05](./e-task-rbh-05-split-webhook-worker-modules.md)

---

**Last Updated:** 2026-03-28  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../TASK_MANAGEMENT_GUIDE.md)
