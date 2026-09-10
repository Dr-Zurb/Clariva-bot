# Task ibi-01: Wire `linkCommentLeadToConversation` on first DM from commenter

> **Links:** batch [`../plan-p1-interactions-inbox-comment-link-batch.md`](../plan-p1-interactions-inbox-comment-link-batch.md) · exec [`./EXECUTION-ORDER-p1-interactions-inbox-comment-link.md`](./EXECUTION-ORDER-p1-interactions-inbox-comment-link.md)

---

## 📋 Task Overview

Call the existing `linkCommentLeadToConversation` when a DM conversation is resolved for a sender who has an unlinked comment lead for this doctor.

**Program / Phase:** interactions-inbox · p1 · Wave 1  
**Estimated Time:** ~1–3 hours  
**Status:** ✅ DONE (2026-07-27)  
**Change Type:** Bugfix / wiring (P0 gap)  
**Model:** Sonnet  
**Depends on:** `comment-lead-service.linkCommentLeadToConversation` already exists

---

## ✅ Task Breakdown

### 1. Find the right call site
- [x] 1.1 Trace where `createConversation` / `findConversationByPlatformId` runs in `run-conversation-turn.ts` (or DM handler).
- [x] 1.2 After conversation id is known for `(doctorId, platform, senderId)`, call link.

### 2. Wire + platform
- [x] 2.1 Pass doctor-scoped sender id matching `comment_leads.commenter_ig_id` + platform (IG + Facebook).
- [x] 2.2 Confirm service is idempotent when already linked / no lead exists.
- [x] 2.3 Never log comment text or raw PHI.

### 3. Tests
- [x] 3.1 Unit test: unlinked lead → after turn (or after explicit service call from turn helper) → `conversation_id` set.
- [x] 3.2 Unit test: no lead → no error.
- [x] 3.3 Unit test: already linked → no overwrite error.

---

## 📁 Files

```
UPDATE: backend/src/workers/run-conversation-turn.ts (or DM handler that resolves conversation)
UPDATE: backend/src/services/comment-lead-service.ts (only if signature needs platform — prefer no change)
CREATE/UPDATE: backend/tests/unit/… covering the wire path
DO NOT TOUCH: frontend; doctor-facing APIs; Inbox UI
```

---

## ✅ Acceptance Criteria

- [x] First DM from a commenter links their `comment_leads` row.
- [x] Safe when no lead / already linked.
- [x] Works for `platform` instagram and facebook (where comment leads exist).
- [x] Targeted tests green; no PII in logs.

---

**Created:** 2026-07-27.  
**Closed:** 2026-07-27 — also satisfies overlapping `ilr-15` (doctor_id + platform scope + wire in `run-conversation-turn`).
