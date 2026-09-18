# Task ilr-15: Comment lead → conversation link

> **Links:** batch [`../plan-p3-instagram-bot-polish-batch.md`](../plan-p3-instagram-bot-polish-batch.md) · exec [`./EXECUTION-ORDER-p3-instagram-bot-polish.md`](./EXECUTION-ORDER-p3-instagram-bot-polish.md)

---

## 📋 Task Overview

Wire `linkCommentLeadToConversation` on first DM after a comment lead (ILR3-D5). Scope update by **`doctor_id` + `commenter_ig_id`** (function today lacks doctor_id filter — fix when wiring).

**Evidence:** `comment-lead-service.ts` ~123–140 defined, **zero callers**; DM create in `run-conversation-turn.ts` ~284–295.

**Status:** ✅ DONE (2026-07-27) via interactions-inbox `ibi-01`
**Skippable:** may park at close gate if timeboxed.

**Scope Guard:**
- No full doctor comment-leads dashboard API in this task (park separately if needed).
- Fix email copy "Check your dashboard" only if still misleading — optional.

---

## ✅ Task Breakdown

- [x] 1.1 Add `doctor_id` to link helper filter. *(also `platform`)*
- [x] 1.2 Call after conversation create/find for Instagram DMs when commenter matches. *(IG + Facebook via `maybeLinkCommentLeadAfterDm`)*
- [x] 1.3 Idempotent (already-linked rows untouched).
- [x] 2.1 Tests for link-on-first-DM + doctor scope. (`comment-lead-link.test.ts`)
- [x] 3.1 Verify green.

---

## 📁 Files

```
UPDATE: backend/src/services/comment-lead-service.ts
UPDATE: backend/src/workers/dm/run-conversation-turn.ts (or DM handler)
CREATE: backend/tests/unit/services/comment-lead-service.test.ts (if missing)
```

---

## ✅ Acceptance Criteria

- [x] First DM from a prior commenter sets `comment_leads.conversation_id` for that doctor.
- [x] No cross-doctor linking; tests green — **or** task parked with note in ilr-16.

---

**Created:** 2026-07-25.
**Closed:** 2026-07-27 — implemented as interactions-inbox `ibi-01`.
