# Daily Plan: 2026-03-10

## Receptionist Bot — Conversation Rules & Appointment Flow

This folder contains tasks for improving the receptionist bot: conversation rules, real-world handling, and appointment booking flow refinements.

---

## Task Index

| Task | Description | Status | Depends On |
|------|-------------|--------|------------|
| [e-task-1](./e-task-1-receptionist-bot-conversation-rules-and-real-world-handling.md) | Conversation rules, intent handling, language matching, doctor settings fixes | ✅ Completed | e-task-4 (2026-03-09) |
| [e-task-2](./e-task-2-appointment-booking-flow-refinements.md) | Consent refinement, consultation type, slot UX (show availability, user picks), timezone fix, polish | ⏳ Pending | e-task-1 |

---

## Summary

### e-task-1 (Completed)
- **Greeting vs booking:** "hello" → greet + offer options; never jump to "tell me your name"
- **Real-world intents:** Greetings, questions, medical queries, emergency, irrelevant/vulgar
- **Language matching:** Respond in same language as user (English, Hinglish, Hindi in English)
- **Doctor settings fixes:** Filter past slots, "ok"/"all set" confirmations

### e-task-2 (Pending)
- **Consent:** Remove or combine redundant "Do I have your permission?" step
- **Consultation type:** Ask Video vs In-clinic before slots
- **Slot UX:** Show weekly availability first; user says date/time; bot checks and shows alternatives if taken
- **Timezone:** Fix availability so slots match doctor's local hours
- **Polish:** Skip blank messages, extend "ok thanks" acknowledgment, optional quick replies

---

**Last Updated:** 2026-03-10
