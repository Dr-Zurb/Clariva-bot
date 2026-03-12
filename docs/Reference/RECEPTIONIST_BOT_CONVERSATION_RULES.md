# Receptionist Bot — Conversation Rules & Intent Map

**Purpose:** Reference for how the receptionist bot should handle real-world user messages. Used by ai-service, webhook-worker, and related code.

**Related:** [e-task-1: Receptionist bot conversation rules](../../Development/Daily-plans/March%202026/2026-03-10/e-task-1-receptionist-bot-conversation-rules-and-real-world-handling.md)

---

## Design Principles

1. **Receptionist-first:** Greet, offer help, then collect info. Never jump straight to "tell me your name" on "hello".
2. **Medical boundary:** Never diagnose, prescribe, or give medical advice. Redirect medical/chief-complaint messages.
3. **Emergency handling:** Detect emergency language → redirect to emergency services immediately.
4. **Language matching:** Respond in the same language the user types in (English, Hinglish, Hindi written in English).
5. **Graceful degradation:** For unclear messages, stay polite and offer clear next steps.

---

## Intent Map

| Intent | User Examples | Bot Action |
|--------|---------------|------------|
| `greeting` | Hi, Hello, Hey, Good morning, नमस्ते | Greet back, introduce practice, ask how to help |
| `book_appointment` | Book, schedule, I want an appointment | Start booking flow (name, phone, consent, slots) |
| `check_availability` | When free?, Available slots? | Show available slots |
| `ask_question` | Price?, Timings?, Location? | Answer from doctor settings |
| `medical_query` | I have fever, prescribe X, chief complaint | Redirect: "Speak with doctor during appointment or call clinic" |
| `emergency` | Chest pain, emergency, can't breathe | Redirect: "Call emergency services or go to nearest hospital" |
| `cancel_appointment` | Cancel, reschedule | Cancel/reschedule flow |
| `check_appointment_status` | Is it confirmed? When is my visit? | Look up and confirm (if implemented) |
| `revoke_consent` | Delete data, revoke consent | Revocation flow |
| `unknown` / `irrelevant` | Spam, vulgar, ???, nonsense | Polite deflection, offer options |

---

## Intent Priority

When multiple intents could apply: **emergency > medical_query > book_appointment > check_availability > ask_question > greeting > unknown**

---

## Deterministic Rules (Before AI)

- **Simple greeting:** Regex match → `greeting` (skip AI)
- **Emergency keywords:** Match → `emergency` (skip AI)
- **Mixed message:** e.g. "Hi I want to book" → let AI classify (don't match greeting regex)

---

## Language Matching

- Bot responds in the **same language** the user writes in.
- Supports: English, Hinglish, Hindi written in English (transliterated), Hindi (Devanagari).
- Instruction in AI prompt: "Respond in the SAME language the user writes in."

---

## Fixed Response Templates

| Intent | Template (English) |
|--------|-------------------|
| `medical_query` | "I'm the scheduling assistant. For medical questions, please speak with the doctor during your appointment or call the clinic directly." |
| `emergency` | "Please call emergency services or go to the nearest hospital immediately." |

---

**Last Updated:** 2026-03-10
