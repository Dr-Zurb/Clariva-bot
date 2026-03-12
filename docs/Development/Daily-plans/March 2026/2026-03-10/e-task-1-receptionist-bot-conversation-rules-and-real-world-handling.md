# Task 1: Receptionist Bot — Conversation Rules & Real-World Handling
## 2026-03-10

---

## 📋 Task Overview

Improve the receptionist bot to behave like a proper online receptionist: (1) **Conversation rules** — greet back on "hello", offer options before collecting info; never jump straight to "tell me your full name"; (2) **Real-world intent handling** — greetings, general questions, medical queries, irrelevant/vulgar messages, booking, availability, cancellation, emergency, etc.; (3) **Language matching** — respond in the same language the user types in (English, Hinglish, Hindi written in English, etc.); (4) **Doctor settings connection fixes** — filter past slots, fix timezone handling, handle "ok"/"all set" confirmations.

**Rationale:** Current bot misclassifies "hello" as book_appointment and immediately asks for name. It offers past slots, misinterprets "ok" as "message didn't come through", and responds only in English. Users expect a receptionist that greets, offers help, answers questions, and adapts to their language.

**Estimated Time:** 12–16 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-10

**Change Type:**
- [ ] **New feature** — New intents, language matching, deterministic rules
- [x] **Update existing** — ai-service, webhook-worker, availability-service; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** Intent classifier (book_appointment, greeting, ask_question, check_availability, cancel_appointment, revoke_consent, unknown); generateResponse; webhook-worker flow; getAvailableSlots with minAdvanceHours; formatSlotsForDisplay with timezone
- ❌ **What's missing:** Deterministic greeting override; strict intent rules (hello ≠ book); new intents (medical_query, emergency, check_appointment_status, complaint); language-matching in responses; past-slot filter when minAdvanceHours=0; availability timezone fix; "ok"/"all set" as valid confirmations
- ⚠️ **Notes:** "hello" often classified as book_appointment by LLM; minAdvanceHours=0 skips past-slot filter; availability times treated as UTC; slot generation uses `.000Z` suffix

**Scope Guard:**
- Expected files touched: ai-service.ts, webhook-worker.ts, availability-service.ts, types/ai.ts; possibly new utils
- No DB schema changes; no new API endpoints

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)
- [RECIPES.md](../../../Reference/RECIPES.md)
- [RECEPTIONIST_BOT_CONVERSATION_RULES.md](../../../Reference/RECEPTIONIST_BOT_CONVERSATION_RULES.md)
- [e-task-4: Bot uses doctor settings](../2026-03-09/e-task-4-bot-uses-doctor-settings.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Conversation Rules — Greeting vs Booking

- [ ] 1.1 Add deterministic greeting check before AI classifier
  - [ ] 1.1.1 Regex for simple greetings: `hi`, `hello`, `hey`, `hiya`, `good morning`, `good afternoon`, `good evening`, `good day`, `howdy`, `namaste`, `नमस्ते` (and common variants)
  - [ ] 1.1.2 If message matches → return `{ intent: 'greeting', confidence: 1 }` and skip AI call
  - [ ] 1.1.3 Mixed messages (e.g. "Hi I want to book") → do NOT match; let AI classify
- [ ] 1.2 Tighten intent classifier prompt (SYSTEM_PROMPT in ai-service.ts)
  - [ ] 1.2.1 **greeting:** Use when message is ONLY a greeting with no explicit request. NEVER classify simple greetings as book_appointment.
  - [ ] 1.2.2 **book_appointment:** Use ONLY when user explicitly asks to book, schedule, or make an appointment (e.g. "book", "schedule", "I want an appointment", "can I book").
  - [ ] 1.2.3 Add examples: "hello" → greeting; "book appointment" → book_appointment
- [ ] 1.3 Greeting response behavior (RESPONSE_SYSTEM_PROMPT_BASE)
  - [ ] 1.3.1 When intent is greeting: greet back warmly, introduce as practice assistant, ask how you can help (book, check availability, ask a question)
  - [ ] 1.3.2 Do NOT start collecting name, phone, or other booking details on greeting alone

### 2. Real-World Intent Handling

- [ ] 2.1 Extend intent set (types/ai.ts, ai-service.ts)
  - [ ] 2.1.1 Add `medical_query` — user presents symptoms, chief complaints, asks for prescription/advice
  - [ ] 2.1.2 Add `emergency` — urgent/emergency language (chest pain, can't breathe, accident)
  - [ ] 2.1.3 Add `check_appointment_status` — "is my appointment confirmed?", "when is my visit?"
  - [ ] 2.1.4 Add `complaint` / `frustration` — "too slow", "no one responding" (optional; can map to unknown with special handling)
- [ ] 2.2 Intent classifier prompt updates
  - [ ] 2.2.1 **medical_query:** User describes symptoms, chief complaints, or asks for medical advice/prescription. Redirect to doctor/clinic; never diagnose.
  - [ ] 2.2.2 **emergency:** Urgent/emergency language. Redirect to emergency services immediately.
  - [ ] 2.2.3 **ask_question:** General questions (price, timings, location, consultation type). Answer from doctor settings.
  - [ ] 2.2.4 **unknown/irrelevant:** Spam, vulgar, meaningless. Polite deflection, offer options.
- [ ] 2.3 Deterministic rules (before AI)
  - [ ] 2.3.1 Emergency keywords/phrases → force `emergency` intent
  - [ ] 2.3.2 Simple greeting regex → force `greeting` (see 1.1)
- [ ] 2.4 Response templates for sensitive intents
  - [ ] 2.4.1 **medical_query:** Fixed template: "I'm the scheduling assistant. For medical questions, please speak with the doctor during your appointment or call the clinic directly."
  - [ ] 2.4.2 **emergency:** Fixed template: "Please call emergency services or go to the nearest hospital immediately."
  - [ ] 2.4.3 **unknown/irrelevant:** Polite deflection, offer to help with booking or questions

### 3. Language Matching

- [ ] 3.1 Add language-matching instruction to AI prompts
  - [ ] 3.1.1 In RESPONSE_SYSTEM_PROMPT_BASE: "Respond in the SAME language the user writes in. If they write in Hindi, Hinglish, or Hindi written in English (e.g. 'kya aap available ho'), respond in that style. If they write in English, respond in English. Match their tone and script."
  - [ ] 3.1.2 In intent classifier: "Classify intent regardless of language. User may write in English, Hindi, Hinglish, or transliterated Hindi."
- [ ] 3.2 Slot/booking display strings
  - [ ] 3.2.1 System-generated messages (e.g. "Thanks! I've saved your details.", "Reply with 1, 2, or 3") — consider i18n or passing user language preference (future)
  - [ ] 3.2.2 For MVP: AI-generated responses will match language; system strings may stay English until i18n task

### 4. Doctor Settings Connection Fixes

- [ ] 4.1 Filter past slots (availability-service.ts)
  - [ ] 4.1.1 When `minAdvanceHours === 0`, still filter out slots where `slot.start < now`
  - [ ] 4.1.2 Current bug: filter only runs when `minAdvanceHours > 0`; past slots are offered
- [ ] 4.2 Availability timezone (availability-service.ts)
  - [ ] 4.2.1 Document: availability times (09:00–17:00) are stored without timezone. Currently combined with date + `.000Z` (UTC).
  - [ ] 4.2.2 Fix: Use doctor timezone when building slot timestamps (e.g. `dateStr` + time in doctor's TZ, then convert to ISO). Requires passing timezone to `getAvailableSlots` or `generateSlotsFromAvailability`.
  - [ ] 4.2.3 Alternative: Store availability as "local time" and interpret with doctor timezone when generating slots
- [ ] 4.3 "ok" / "all set" as valid confirmations (webhook-worker.ts)
  - [ ] 4.3.1 When state is `selecting_slot` and user just booked: treat "ok", "all set", "thanks", "confirmed", "done" as acknowledgment — no "message didn't come through"
  - [ ] 4.3.2 After successful booking: if user sends affirmative, respond with brief confirmation (e.g. "Great—you're all set for [date]. Let us know if you need anything else.")

### 5. Intent Priority & Flow

- [ ] 5.1 Intent priority: emergency > medical_query > book_appointment > check_availability > ask_question > greeting > unknown
- [ ] 5.2 Webhook worker: handle new intents (medical_query, emergency) with appropriate responses
- [ ] 5.3 Confidence threshold (optional): if `book_appointment` with confidence < 0.8, treat as `unknown` and ask how to help

### 6. Verification & Testing

- [ ] 6.1 Run type-check and lint
- [ ] 6.2 Manual test: "hello" → greeting + options (not "tell me your name")
- [ ] 6.3 Manual test: "book" → booking flow starts
- [ ] 6.4 Manual test: "I have fever" → medical redirect
- [ ] 6.5 Manual test: "chest pain" → emergency redirect
- [ ] 6.6 Manual test: Hinglish/Hindi → bot responds in same language
- [ ] 6.7 Manual test: "ok" after booking → no "message didn't come through"
- [ ] 6.8 Manual test: no past slots offered when minAdvanceHours=0

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   ├── ai-service.ts              (UPDATED - intent classifier prompt, greeting check, response prompt, language matching)
│   └── availability-service.ts    (UPDATED - past-slot filter, timezone for slot generation)
├── workers/
│   └── webhook-worker.ts          (UPDATED - new intents, "ok"/"all set" handling, confirmation flow)
└── types/
    └── ai.ts                      (UPDATED - new intents: medical_query, emergency, check_appointment_status)
```

**Existing Code Status:**
- ✅ ai-service.ts — classifyIntent, generateResponse, SYSTEM_PROMPT, RESPONSE_SYSTEM_PROMPT_BASE
- ✅ webhook-worker.ts — isBookIntent, inCollection, consent flow, selecting_slot handling
- ✅ availability-service.ts — getAvailableSlots, minAdvanceHours filter, generateSlotsFromAvailability
- ✅ types/ai.ts — Intent type, VALID_INTENTS

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- No PHI in logs (COMPLIANCE.md)
- Medical/emergency responses: fixed templates only; no AI-generated medical advice
- Intent classifier: deterministic rules before AI when possible (greeting, emergency)
- Language matching: instruction in prompt; no new i18n infra for MVP
- Fallback: when intent unknown, offer options (book, check availability, ask question)

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (N – no new tables; read doctor_settings)
- [ ] **Any PHI in logs?** (MUST be No)
- [ ] **External API or AI call?** (Y – OpenAI, Instagram)
  - [ ] **Consent + redaction confirmed?** (Y – PHI redacted before AI)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [ ] "hello" → greeting + options; never "tell me your full name"
- [ ] "book appointment" → booking flow starts
- [ ] "I have fever" → medical redirect (no advice)
- [ ] "chest pain" / "emergency" → emergency redirect
- [ ] Hinglish/Hindi input → bot responds in same language
- [ ] "ok" after booking → no "message didn't come through"
- [ ] No past slots offered (e.g. 10 AM when it's 3 PM)
- [ ] Slot times respect doctor timezone (availability 09:00–17:00 in doctor's TZ)

---

## 📝 Intent Map (Reference)

| Intent | Examples | Bot Action |
|--------|----------|------------|
| `greeting` | Hi, Hello, Good morning, नमस्ते | Greet, introduce, offer options |
| `book_appointment` | Book, schedule, I want an appointment | Start booking flow |
| `check_availability` | When free?, Available slots? | Show slots |
| `ask_question` | Price?, Timings?, Location? | Answer from doctor settings |
| `medical_query` | I have fever, prescribe X | Redirect to doctor/clinic; no advice |
| `emergency` | Chest pain, emergency | Redirect to emergency services |
| `cancel_appointment` | Cancel, reschedule | Cancel/reschedule flow |
| `check_appointment_status` | Is it confirmed? When? | Look up and confirm (if implemented) |
| `revoke_consent` | Delete data, revoke consent | Revocation flow |
| `unknown` / `irrelevant` | Spam, vulgar, ??? | Polite deflection, offer options |

---

## 🔗 Related Tasks

- [e-task-4: Bot uses doctor settings](../2026-03-09/e-task-4-bot-uses-doctor-settings.md)
- [e-task-1: Receptionist bot reply fix](../2026-03-08/e-task-1-receptionist-bot-reply-and-webhook-fixes.md)

---

**Last Updated:** 2026-03-10  
**Reference:** [TASK_TEMPLATE.md](../../../task-management/TASK_TEMPLATE.md) | [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)
