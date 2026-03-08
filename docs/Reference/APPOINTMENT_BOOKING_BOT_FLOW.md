# Appointment Booking Bot Flow Reference

**Purpose:** Canonical flow design for Clariva Care's Instagram DM appointment booking bot. Based on industry research (BuiltABot, AgentZap, Microsoft Copilot slot-filling, Instagram DM automation patterns) and our existing collection/consent/slot architecture.

**Status:** Reference for implementation. Code MUST align with this flow.

---

## 1. Industry Best Practices (Research Summary)

### 1.1 Optimal Conversation Structure

From scheduling chatbot guides (2024–2026):

1. **Greeting** – Warm, set expectations, identify as AI
2. **Intent discovery** – Understand what user needs (book vs question)
3. **Progressive information gathering** – One question at a time
4. **Time/date selection** – **Show available slots** (not free-text "what date/time?")
5. **Client info** – Name, phone, email
6. **Confirmation** – Summarize booking details

**Key insight:** "Time/date selection with available options" – bots should **check calendar and offer time slots directly**, not ask users to type free-form dates. Reduces decision fatigue and errors.

### 1.2 Slot Selection vs Free-Text Date/Time

| Approach | UX | Best for |
|----------|-----|----------|
| **Show slots** | "Here are available times: 1. 2:00 PM, 2. 2:30 PM" | Low friction, clear choices |
| **Free-text** | "What date/time works for you?" | User flexibility, but more ambiguity |

**Recommendation:** Show 3–5 pre-fetched slots. Users reply with number (1, 2, 3). If user says "tomorrow 9 AM", parse and show slots for that day.

### 1.3 Never Repeat Questions

- Once user has chosen "book appointment", do NOT ask "book or question?" again
- Once user has provided name, do NOT ask for name again
- If state shows `collecting_phone`, we already have name – do not re-ask

### 1.4 Instagram DM Specifics

- Bot checks calendar and offers time slots directly in DM
- Sequential nodes: name → phone → date/time picker (or slot list)
- Warm, action-oriented language; minimal friction

---

## 2. Clariva Care Flow (Target State)

### 2.1 State Machine

```
[greeting] 
    → user: "book appointment" 
    → collecting_name

[collecting_name] 
    → user: "John Doe" 
    → collecting_phone

[collecting_phone] 
    → user: "8264602737" 
    → consent (optional fields skipped if not required)

[consent] 
    → user: "yes" 
    → selecting_slot (SHOW SLOTS IMMEDIATELY)

[selecting_slot] 
    → user: "1" or "2" 
    → book_appointment → payment_confirmation
```

### 2.2 Critical Rules

| Rule | Implementation |
|------|----------------|
| After consent granted | **Immediately** transition to `selecting_slot` and show slots. Do NOT ask "book or check availability?" again. |
| When in `selecting_slot` | Show slots only. Do NOT ask "what date/time?" – we already have slots. |
| When in `collecting_*` | Ask for exactly one field. Do not ask for date/time or "two options". |
| AI fallback | Never use AI to ask for date/time when we have deterministic slot flow. Use `formatSlotsForDisplay()` and show slots. |

### 2.3 Flow Gaps (Fixed 2026-03-08)

1. ~~**persistPatientAfterConsent** returns "book or check?"~~ – Worker now shows slots immediately after consent.
2. ~~**AI prompt** asks for "two date/time options"~~ – Prompt updated to forbid this; slot flow used.
3. ~~**After consent** we set `step: 'responded'`~~ – Now set `step: 'selecting_slot'` and show slots in same reply.

---

## 3. Implementation Checklist

- [x] Consent granted → transition to `selecting_slot`, show slots in same reply (no "book or check?" again)
- [x] Remove "two date/time options" from AI prompt; when we need date/time, use slot flow
- [x] When `state.step === 'selecting_slot'`, always use deterministic slot display, never AI for date question
- [x] Ensure AI never asks "what date/time?" when step is `selecting_slot` or when we have `collectedFields` including name+phone

---

## 4. References

- BuiltABot: Appointment Scheduling Chatbot Guide 2026
- AgentZap: Conversational AI for Bookings Best Practices
- Microsoft Copilot: Slot-filling best practices
- Instagram DM automation: Calendar integration, slot presentation

---

**Last Updated:** 2026-03-08  
**Version:** 1.0.0
