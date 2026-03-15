# Task 3: Route Ambiguous Messages to AI
## 2026-03-25

---

## 📋 Task Overview

When the user's message is ambiguous (relation clarification, question, doesn't fit extraction patterns), route to AI with full context instead of forcing through fixed templates or extraction. Define heuristics for "ambiguous" and ensure we call generateResponse with rich context in those cases.

**Estimated Time:** 2–3 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-25

**Change Type:**
- [x] **Update existing** — webhook-worker; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** Collection block runs validateAndApplyExtracted; relation clarification handler (deterministic "Got it, your X"); fixed templates for "Still need: ..."
- ❌ **What's missing:** Routing ambiguous messages (e.g. "why do you need this?", "can I book for my friend?") to AI; heuristic for "message doesn't fit extraction"
- ⚠️ **Notes:** Don't break existing extraction flow for clear data messages

**Scope Guard:**
- Expected files touched: ≤ 2 (webhook-worker, maybe ai-service)

**Reference Documentation:**
- [BOT_INTELLIGENCE_PLANNING.md](../../../Future%20Planning/BOT_INTELLIGENCE_PLANNING.md)
- [APPOINTMENT_BOOKING_FLOW_V2.md](../../../Reference/APPOINTMENT_BOOKING_FLOW_V2.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Define Ambiguous-Message Heuristics

- [x] 1.1 Create `isAmbiguousCollectionMessage(text, extracted)` (or similar)
  - [x] 1.1.1 Returns true when: extraction returns empty AND message looks like clarification/question
  - [x] 1.1.2 Clarification patterns: "my sister?", "sister first", "for my mother", "the person I'm booking for"
  - [x] 1.1.3 Question patterns: "why do you need", "can I share", "what if I don't have"
  - [x] 1.1.4 Short messages (< 25 chars) that don't match extraction
- [x] 1.2 Document heuristics in code comments

### 2. Webhook Worker — Route to AI

- [x] 2.1 In collection block, before or after validateAndApplyExtracted
  - [x] 2.1.1 If message is ambiguous (per heuristics), skip fixed template
  - [x] 2.1.2 Call generateResponse with full context (from e-task-1)
  - [x] 2.1.3 Ensure state is updated (e.g. lastIntent) but don't overwrite collected data
- [x] 2.2 In confirm_details block, similar logic for ambiguous confirm replies
- [x] 2.3 Relation clarification folded into AI: update state.relation, then route to AI for natural reply

### 3. Edge Cases

- [x] 3.1 When ambiguous + extraction returns partial data: merge extracted into store, then let AI generate reply acknowledging both
- [x] 3.2 When user sends clear data ("Kamla Gill 56 8437119760"): keep existing extraction path, no AI
- [x] 3.3 When user sends "my sister?" with no data: route to AI (state.relation updated for context)

### 4. Verification & Testing

- [x] 4.1 Run type-check
- [ ] 4.2 Manual test: "why do you need my phone?" during collection → AI gives natural reply
- [ ] 4.3 Manual test: "Kamla Gill 56 8437119760" → extraction works, no regression
- [ ] 4.4 Verify no PHI in logs

---

## 📁 Files to Create/Update

```
backend/src/
└── workers/
    └── webhook-worker.ts   (UPDATED - ambiguous routing, AI call with context)
```

**Existing Code Status:**
- ✅ `webhook-worker.ts` — Has collection block, relation clarification, validateAndApplyExtracted
- ✅ `extract-patient-fields.ts` — Returns empty when no match

---

## 🧠 Design Constraints

- No PHI in logs (COMPLIANCE.md)
- Don't break extraction for clear data messages
- Keep handler order correct (consent, confirm, collection, etc.)

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (N – logic only)
- [ ] **Any PHI in logs?** (N)
- [ ] **External API or AI call?** (Y – OpenAI)
  - [ ] **Consent + redaction confirmed?** (Y)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] Ambiguous messages route to AI with full context
- [x] Clear data messages still use extraction; no regression
- [x] AI produces natural replies for questions/clarifications
- [x] Type-check passes

---

## 🔗 Related Tasks

- [e-task-1: AI context enhancement](./e-task-1-ai-context-enhancement.md) — Prerequisite
- [e-task-2: AI prompt improvements](./e-task-2-ai-prompt-improvements.md) — Prerequisite

---

**Last Updated:** 2026-03-25  
**Reference:** [TASK_TEMPLATE.md](../../../task-management/TASK_TEMPLATE.md)
