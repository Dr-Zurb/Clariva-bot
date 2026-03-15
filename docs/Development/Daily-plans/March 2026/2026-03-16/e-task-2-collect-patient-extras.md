# Task 2: Collect Patient Extras (notes)
## 2026-03-16

---

## 📋 Task Overview

Add optional collection of patient extras ("Anything else you'd like the doctor to know?") and store in `appointments.notes`. Depends on e-task-1 (reason_for_visit column) being complete.

**Estimated Time:** 2–3 hours  
**Status:** ✅ **DONE**  
**Completed:** —

**Change Type:**
- [x] **New feature** — Add extraNotes to conversation state and optional prompt

**Current State:**
- ✅ **What exists:** reason_for_visit in appointments (e-task-1); notes column; conversation state has reasonForVisit
- ❌ **What's missing:** extraNotes in state; optional prompt; pass extraNotes to notes when booking
- ⚠️ **Notes:** Depends on e-task-1. Slot-selection currently passes doctor default_notes to notes; we'll combine patient extras + default_notes

**Scope Guard:**
- Expected files touched: ≤ 5 (conversation types, webhook-worker, slot-selection-service, collection-service if needed)

**Reference Documentation:**
- [APPOINTMENT_REASON_AND_NOTES.md](../../../Reference/APPOINTMENT_REASON_AND_NOTES.md) — Column semantics
- [APPOINTMENT_BOOKING_FLOW_V2.md](../../../Reference/APPOINTMENT_BOOKING_FLOW_V2.md) — Collection flow

---

## ✅ Task Breakdown (Hierarchical)

### 1. Conversation State

- [ ] 1.1 Update `backend/src/types/conversation.ts`
  - [ ] 1.1.1 Add `extraNotes?: string` to ConversationState
  - [ ] 1.1.2 Comment: optional patient extras for appointment.notes

### 2. Collection Flow

- [ ] 2.1 Add optional prompt after confirm_details (when user says "Yes")
  - [ ] 2.1.1 After transitioning to consent, optionally ask: "Anything else you'd like the doctor to know before your visit? (optional)"
  - [ ] 2.1.2 Or: add as optional field in "all at once" — if user includes extra text beyond structured fields, capture in extraNotes
- [ ] 2.2 Update webhook-worker to handle extraNotes
  - [ ] 2.2.1 When user replies after "Anything else?" prompt, store in state.extraNotes
  - [ ] 2.2.2 Transition to consent (or slot link) after capturing or skipping

### 3. Slot Selection Service

- [ ] 3.1 Update `backend/src/services/slot-selection-service.ts`
  - [ ] 3.1.1 Build `notes`: combine `state.extraNotes` and `doctorSettings?.default_notes`
  - [ ] 3.1.2 Format: `[patient extras]. [default_notes]` or either alone
  - [ ] 3.1.3 Pass to bookAppointment

### 4. Verification & Testing

- [ ] 4.1 Run type-check
- [ ] 4.2 Manual test: provide extras → verify notes populated
- [ ] 4.3 Manual test: skip extras → verify notes = default_notes or NULL

---

## 📁 Files to Create/Update

```
backend/src/
├── types/
│   └── conversation.ts          (UPDATED - extraNotes)
├── workers/
│   └── webhook-worker.ts        (UPDATED - optional prompt, store extraNotes)
└── services/
    └── slot-selection-service.ts (UPDATED - pass extraNotes to notes)
```

**Existing Code Status:**
- ✅ ConversationState — EXISTS (has reasonForVisit)
- ✅ confirm_details → consent flow — EXISTS
- ❌ extraNotes — MISSING
- ❌ "Anything else?" prompt — MISSING

---

## 🧠 Design Constraints

- No PHI in logs
- extraNotes is optional; user can skip
- notes = patient extras + doctor default_notes (combined when both present)

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y – conversation state, appointments.notes)
  - [ ] **RLS verified?** (Y)
- [ ] **Any PHI in logs?** (N)
- [ ] **External API or AI call?** (Y – OpenAI for response generation)
  - [ ] **Consent + redaction confirmed?** (Y)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [ ] Optional "Anything else?" prompt appears (or extras captured from all-at-once)
- [ ] extraNotes stored in conversation state
- [ ] notes populated at booking when patient provides extras
- [ ] default_notes appended when present

---

## 🔗 Related Tasks

- [e-task-1: Add reason_for_visit column](./e-task-1-reason-for-visit-column.md) — **Prerequisite**

---

**Last Updated:** 2026-03-16  
**Reference:** [TASK_TEMPLATE.md](../../../task-management/TASK_TEMPLATE.md)
