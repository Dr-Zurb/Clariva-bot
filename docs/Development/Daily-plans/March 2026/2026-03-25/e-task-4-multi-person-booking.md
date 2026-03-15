# Task 4: Multi-Person Booking ("me and X")
## 2026-03-25

---

## 📋 Task Overview

When the user says "book for me and my sister" (or mother, father, etc.), detect the multi-person intent, acknowledge both bookings, explain we do one at a time, and ask who to book first. Set state so we collect for the chosen person first, then can offer to book for the other.

**Estimated Time:** 2–3 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-25

**Change Type:**
- [x] **Update existing** — ai-service, webhook-worker; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** book_for_someone_else intent; BOOK_FOR_SOMEONE_ELSE_REGEX; collection for one "other" person
- ❌ **What's missing:** Detection of "me and my X"; handler for choosing who first; state for "pending self booking" or "pending other booking"
- ⚠️ **Notes:** We only support one booking per consent flow; second booking starts fresh after first completes

**Scope Guard:**
- Expected files touched: ≤ 4 (ai-service, webhook-worker, conversation types, docs)

**Reference Documentation:**
- [BOT_INTELLIGENCE_PLANNING.md](../../../Future%20Planning/BOT_INTELLIGENCE_PLANNING.md)
- [BOOKING_FOR_OTHERS_AND_APPOINTMENT_LIMITS.md](../../../Reference/BOOKING_FOR_OTHERS_AND_APPOINTMENT_LIMITS.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Detect "me and X" Pattern

- [x] 1.1 Add regex or intent rule for "book for me and my sister/mother/father/etc"
  - [x] 1.1.1 Pattern: "me and my X", "myself and my X", "us and my X"
  - [x] 1.1.2 Extract relation (sister, mother, etc.)
- [x] 1.2 Return intent book_for_someone_else with multi-person via parseMultiPersonBooking
  - [x] 1.2.1 Extended book_for_someone_else; webhook checks parseMultiPersonBooking first

### 2. Webhook Handler for Multi-Person

- [x] 2.1 When "me and X" detected, add handler before single-person book_for_someone_else
  - [x] 2.1.1 Reply: "I'll help you book for both. Let's do one at a time—[relation] first, then you. Please share: ..."
  - [x] 2.1.2 Set state: bookingForSomeoneElse=true, step=collecting_all, pendingSelfBooking=true
- [x] 2.2 After first booking completes (slot link sent), offer: "Would you like to book one for yourself now?"
  - [x] 2.2.1 If yes, start collection for self (conversation.patient_id)
  - [x] 2.2.2 Clear pendingSelfBooking when done

### 3. State (Optional)

- [x] 3.1 Add `pendingSelfBooking?: boolean` and `pendingOtherBooking?: { relation }` to ConversationState
  - [x] 3.1.1 Set pendingSelfBooking when "me and X" detected (other first)
  - [x] 3.1.2 Set pendingOtherBooking when "me first" (self first, then other)
- [x] 3.2 Cleared when user completes or declines

### 4. Edge Cases

- [x] 4.1 User says "me first" instead of "sister first" — switch to self first, set pendingOtherBooking
- [x] 4.2 User says "book for me and my sister" then "actually just my sister" — clear pendingSelfBooking, single-person flow

### 5. Verification & Testing

- [x] 5.1 Run type-check
- [ ] 5.2 Manual test: "book for me and my sister" → bot explains one-at-a-time, asks for sister's details first
- [ ] 5.3 Manual test: complete sister's booking → bot offers to book for self
- [ ] 5.4 Verify no PHI in logs

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   └── ai-service.ts           (UPDATED - multi-person regex/intent)
├── workers/
│   └── webhook-worker.ts       (UPDATED - multi-person handler)
└── types/
    └── conversation.ts        (UPDATED - optional pendingSelfBooking)
```

**Existing Code Status:**
- ✅ `ai-service.ts` — BOOK_FOR_SOMEONE_ELSE_REGEX
- ✅ `webhook-worker.ts` — book_for_someone_else handler
- ✅ `conversation.ts` — ConversationState

---

## 🧠 Design Constraints

- No PHI in logs (COMPLIANCE.md)
- One booking per consent flow; second is a new flow
- Follow ARCHITECTURE.md for state storage

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y – conversation state)
  - [ ] **RLS verified?** (N/A – metadata only)
- [ ] **Any PHI in logs?** (N)
- [ ] **External API or AI call?** (Y – OpenAI for intent)
  - [ ] **Consent + redaction confirmed?** (Y)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] "book for me and my sister" triggers multi-person flow
- [x] Bot explains one-at-a-time, defaults to other first (supports "me first" to switch)
- [x] After first booking, bot offers to book for self
- [x] Type-check passes

---

## 🔗 Related Tasks

- [e-task-1: AI context enhancement](./e-task-1-ai-context-enhancement.md) — Independent
- [e-task-2: AI prompt improvements](./e-task-2-ai-prompt-improvements.md) — Can improve multi-person reply

---

**Last Updated:** 2026-03-25  
**Reference:** [TASK_TEMPLATE.md](../../../task-management/TASK_TEMPLATE.md)
