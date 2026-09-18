# Task ibi-04: Read-only thread drawer in Booking review

> **Links:** batch [`../plan-p2-interactions-inbox-thread-drawer-batch.md`](../plan-p2-interactions-inbox-thread-drawer-batch.md) · exec [`./EXECUTION-ORDER-p2-interactions-inbox-thread-drawer.md`](./EXECUTION-ORDER-p2-interactions-inbox-thread-drawer.md)

---

## 📋 Task Overview

Replace the "Conversation view coming soon" placeholder in Booking review detail with a **read-only** message thread loaded via `GET /api/v1/interactions/:id/messages`.

**Program / Phase:** interactions-inbox · p2 · Wave 2  
**Estimated Time:** ~2–4 hours  
**Status:** ✅ DONE (2026-07-27)  
**Change Type:** UI feature  
**Model:** Sonnet  
**Depends on:** `ibi-03`

---

## ✅ Task Breakdown

### 1. Fetch
- [x] 1.1 When detail sheet opens with a review that has `conversation_id`, fetch messages with doctor token.
- [x] 1.2 Loading / empty / error states (no PHI in error toasts beyond generic).

### 2. Render
- [x] 2.1 Simple chronological thread: patient vs bot/system bubbles (match existing design tokens; no overbuilt chat chrome).
- [x] 2.2 **No composer / no send button.**
- [x] 2.3 Remove or replace "coming soon" copy.

### 3. Tests
- [x] 3.1 Component test: renders messages when API returns rows; shows empty state when none.

---

## 📁 Files

```
UPDATE: frontend/components/service-reviews/ReviewDetailSheet.tsx
CREATE: frontend/components/service-reviews/ReviewConversationThread.tsx
UPDATE: frontend/components/service-reviews/ServiceReviewsInbox.tsx
UPDATE: frontend/lib/api.ts (getInteractionMessages in ibi-03)
CREATE: frontend/components/service-reviews/__tests__/ReviewConversationThread.test.tsx
DO NOT TOUCH: Sidebar; Booking review route removal; backend authz (ibi-03)
```

---

## ✅ Acceptance Criteria

- [x] Opening a pending review with a conversation shows the DM thread.
- [x] Read-only — no reply UI.
- [x] Placeholder "coming soon" gone for this surface.
- [x] FE tests + typecheck green. *(targeted vitest green; repo has unrelated duplicate `* 2.ts` tsc noise)*

---

**Created:** 2026-07-27.  
**Closed:** 2026-07-27.
