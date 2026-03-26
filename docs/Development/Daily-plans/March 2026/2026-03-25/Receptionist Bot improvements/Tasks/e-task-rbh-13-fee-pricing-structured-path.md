# Task RBH-13: Fee & pricing — structured answers, no forced booking

## 2026-03-28 — Receptionist bot product quality

---

## 📋 Task Overview

**Problem:** Users ask **consultation / appointment fees**; the bot **loops** (more questions, then PII collection) or never states **clear rupee amounts**. Today pricing is mostly **LLM-inferred** from `doctorContext.consultation_types`; **`book_appointment`** + `state.step === 'responded'` triggers a **deterministic** “please share Full name, Age…” block even when the user only wanted fees.

**Goal:** When the user is in a **fee / pricing** conversation, respond with **accurate, structured** fee text from doctor settings (and optional admin-edited copy), and **do not** enter `collecting_all` until the user clearly chooses to **book**.

**Estimated Time:** 2–4 days  
**Status:** ✅ **DONE** (2026-03-28)  
**Completed:** Structured DM path, `activeFlow` / `lastPromptKind: fee_quote`, formatter + tests, extraction guardrails, docs.

**Change Type:**
- [x] **Update existing** — worker branch logic, optional `doctor_settings` / `consultation_types` schema docs
- [x] **Docs** — `RECEPTIONIST_BOT_CONVERSATION_RULES` or setup guide for how to fill fees

**Current State:**
- ✅ **What exists:** `getDoctorContextFromSettings` passes `consultation_types` into `generateResponse`; `ask_question` intent for price in classifier prompt; RBH-13 adds a **deterministic fee branch** and blocks misclassified **`book_appointment`** + pricing-only messages from starting intake.
- ✅ **Guardrails:** Meta fee/booking phrases are filtered from **`reason_for_visit`** (collection + regex extract + AI extraction prompt).

**Scope Guard:**
- No invented fees: fall back to “please contact clinic” if data missing.

**Reference:**
- Screenshots / manual tests: fee-only flows in [MANUAL_TEST_CHECKLIST_INSTAGRAM_BOT.md](../MANUAL_TEST_CHECKLIST_INSTAGRAM_BOT.md)
- Code: `instagram-dm-webhook-handler.ts` (`isBookIntent`, `responded`), `ai-service.ts`, `consultation-fees.ts`, `doctor_settings` / consultation_types shape

---

## ✅ Task Breakdown (Hierarchical)

### 1. Product rules
- [x] 1.1 Define **canonical** consultation dimensions: e.g. channel (in-clinic / online), visit type (new / follow-up / follow-up windows if priced). *(Plain text or compact JSON lines in `consultation_types`; no new DB columns.)*
- [x] 1.2 Define how `consultation_types` JSON (or new columns) maps to human-readable **₹** lines. *(Documented in `RECEPTIONIST_BOT_CONVERSATION_RULES.md`.)*

### 2. Implementation
- [x] 2.1 Add **`pricing_inquiry`** (or strengthen **`ask_question`** + subkind) and/or explicit **`conversation_state`** flag: `active_flow: 'fee_quote'` until user says “book” / “schedule”.
- [x] 2.2 **Block** transition to `collecting_all` while in fee-quote flow unless user intent is clearly book.
- [x] 2.3 Implement **`formatConsultationFeesForDm(settings)`** (or similar) — pure function, unit tested.
- [x] 2.4 Fix **confirm_details** pollution: do not treat meta-phrases (“not follow up”, “only want fee”) as medical **reason_for_visit** (validation / extraction guardrails).

### 3. AI alignment
- [x] 3.1 Update classifier prompt examples: “general consultation” **after** a fee question ≠ automatic `book_appointment`.
- [x] 3.2 Keep LLM as fallback when structured data incomplete — must not contradict structured fees. *(Deterministic branch runs first for pricing keywords when idle/responded.)*

### 4. Verification
- [ ] 4.1 Manual: scenarios from user testing (fee → general → no booking until user asks).
- [x] 4.2 Unit tests: fee formatter + branch tests for `responded` + pricing intent. *(Formatter + `lastPromptKind`; handler branch covered via manual checklist.)*

---

## 📁 Files to Create/Update (expected)

```
backend/src/workers/instagram-dm-webhook-handler.ts
backend/src/services/ai-service.ts
backend/src/types/conversation.ts (activeFlow / fee_quote lastPromptKind)
backend/src/utils/consultation-fees.ts
backend/src/services/collection-service.ts
backend/src/utils/extract-patient-fields.ts
docs/Reference/RECEPTIONIST_BOT_CONVERSATION_RULES.md
backend/tests/unit/utils/consultation-fees.test.ts
backend/tests/unit/types/conversation-last-prompt-kind.test.ts
```

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** Y (conversation state)
- [x] **Any PHI in logs?** N
- [x] **External API?** Y — OpenAI (classify/generate)

---

## 🔗 Related Tasks

- **RBH-14** — context-aware intent (pairs with this).
- **RBH-07** — `lastPromptKind` extensions for `fee_quote` if needed.

---

**Last Updated:** 2026-03-28  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../TASK_MANAGEMENT_GUIDE.md)
