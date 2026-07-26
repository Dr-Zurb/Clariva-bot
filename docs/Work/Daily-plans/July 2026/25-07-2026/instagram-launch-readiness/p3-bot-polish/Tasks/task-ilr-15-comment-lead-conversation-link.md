# Task ilr-15: Comment lead → conversation link

> **Links:** batch [`../plan-p3-instagram-bot-polish-batch.md`](../plan-p3-instagram-bot-polish-batch.md) · exec [`./EXECUTION-ORDER-p3-instagram-bot-polish.md`](./EXECUTION-ORDER-p3-instagram-bot-polish.md)

---

## 📋 Task Overview

Wire `linkCommentLeadToConversation` on first DM after a comment lead (ILR3-D5). Scope update by **`doctor_id` + `commenter_ig_id`** (function today lacks doctor_id filter — fix when wiring).

**Evidence:** `comment-lead-service.ts` ~123–140 defined, **zero callers**; DM create in `run-conversation-turn.ts` ~284–295.

**Status:** ⏳ PENDING · ~1–2h · Sonnet  
**Skippable:** may park at close gate if timeboxed.

**Scope Guard:**
- No full doctor comment-leads dashboard API in this task (park separately if needed).
- Fix email copy "Check your dashboard" only if still misleading — optional.

---

## ✅ Task Breakdown

- [ ] 1.1 Add `doctor_id` to link helper filter.
- [ ] 1.2 Call after conversation create/find for Instagram DMs when commenter matches.
- [ ] 1.3 Idempotent (already-linked rows untouched).
- [ ] 2.1 Tests for link-on-first-DM + doctor scope.
- [ ] 3.1 Verify green.

---

## 📁 Files

```
UPDATE: backend/src/services/comment-lead-service.ts
UPDATE: backend/src/workers/dm/run-conversation-turn.ts (or DM handler)
CREATE: backend/tests/unit/services/comment-lead-service.test.ts (if missing)
```

---

## ✅ Acceptance Criteria

- [ ] First DM from a prior commenter sets `comment_leads.conversation_id` for that doctor.
- [ ] No cross-doctor linking; tests green — **or** task parked with note in ilr-16.

---

**Created:** 2026-07-25.
