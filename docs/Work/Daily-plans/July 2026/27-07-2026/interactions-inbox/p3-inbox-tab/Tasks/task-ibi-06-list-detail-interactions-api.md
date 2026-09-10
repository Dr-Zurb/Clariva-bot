# Task ibi-06: List/detail interactions API + enrichment + signal filter

> **Links:** batch [`../plan-p3-interactions-inbox-tab-batch.md`](../plan-p3-interactions-inbox-tab-batch.md) · exec [`./EXECUTION-ORDER-p3-interactions-inbox-tab.md`](./EXECUTION-ORDER-p3-interactions-inbox-tab.md)

---

## 📋 Task Overview

Add doctor-scoped list + detail for Inbox interactions (conversation-anchored rows first). Document the **signal** predicate and fused **status** enum. Extend the `/api/v1/interactions` surface from p2.

**Program / Phase:** interactions-inbox · p3 · Wave 1  
**Estimated Time:** ~4–8 hours  
**Status:** ✅ DONE (2026-07-27)  
**Change Type:** New feature (PHI list/detail)  
**Model:** **Opus**  
**Depends on:** `ibi-03` (messages route); booking-review enrichment pattern

---

## ✅ Task Breakdown

### 1. Types + status
- [x] 1.1 Define list item DTO: id, kind (`conversation`), channel, patient display/MRN/lead label, last snippet, fused status, timestamps, optional flags (`has_comment_lead`, `needs_review`).
- [x] 1.2 Document fused status enum (`new_lead | in_conversation | needs_review | booking_pending | booked | paid` — adjust only with reason in PR).
- [x] 1.3 Document **signal** predicate (IBI-D3) in service comment + this task's notes when implemented.

### 2. Service
- [x] 2.1 `listInteractionsForDoctor(doctorId, { scope, channel, status, cursor, limit })` — admin client + `.eq('doctor_id', doctorId)`.
- [x] 2.2 Enrich with patient + latest appointment + pending review existence (mirror `listEnrichedServiceStaffReviewsForDoctor` multi-query style).
- [x] 2.3 `getInteractionForDoctor(doctorId, id)` — ownership check; summary for detail shell (timeline filled in `ibi-08`).
- [x] 2.4 Cursor pagination (IBI-D4); default `scope=signal`.

### 3. Controller + routes
- [x] 3.1 `GET /api/v1/interactions` + `GET /api/v1/interactions/:id` — asyncHandler, Zod query/params.
- [x] 3.2 Keep `GET …/:id/messages` from p2 working.

### 4. Tests
- [x] 4.1 Doctor scoping on list/detail.
- [x] 4.2 Signal vs all filter.
- [x] 4.3 Cross-doctor detail → not found.

---

## 📁 Files

```
UPDATE: backend/src/routes/api/v1/interactions.ts
UPDATE: backend/src/controllers/interaction-controller.ts
CREATE/UPDATE: backend/src/services/interaction-service.ts (preferred) or conversation-service list helpers
UPDATE: backend/src/utils/validation.ts
UPDATE: backend/src/types/… as needed
CREATE: backend/tests/unit/services|controllers for interactions
UPDATE: frontend/lib/api.ts (typed fetchers)
DO NOT TOUCH: comment-only merge (ibi-07); timeline steps (ibi-08); Sidebar (ibi-09)
```

---

## ⚠️ Scope Guard

- PHI — no logging of names/phones/message bodies.
- No SQL UNION for comment-only yet (ibi-07).
- No new migration unless forced — prefer compute status in service. If migration needed → STOP (agent-contract).

---

## ✅ Acceptance Criteria

- [x] Authenticated doctor lists own interactions with signal default.
- [x] Detail ownership-checked.
- [x] Status chip fields present and documented.
- [x] Tests green; Opus review of authz path.

---

**Created:** 2026-07-27.  
**Closed:** 2026-07-27.
