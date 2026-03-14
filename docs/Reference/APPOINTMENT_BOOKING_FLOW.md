# Appointment Booking Flow — Design Reference

**Purpose:** Canonical reference for the receptionist bot's appointment booking flow. Used by webhook-worker, collection-service, consent-service, and availability-service.

**Note:** For the redesigned flow (all-at-once collection, external slot picker, proactive messaging), see [APPOINTMENT_BOOKING_FLOW_V2.md](./APPOINTMENT_BOOKING_FLOW_V2.md).

**Related:** [e-task-2: Appointment booking flow refinements](../../Development/Daily-plans/March%202026/2026-03-10/e-task-2-appointment-booking-flow-refinements.md)

---

## Design Principles

1. **Receptionist-first:** Greet, offer options, collect info step-by-step. Never jump to "tell me your name" on "hello".
2. **Minimal friction:** Avoid redundant steps (e.g. explicit consent when phone implies it).
3. **User-driven slot selection:** Show availability first; user picks date/time; bot checks and confirms or offers alternatives.
4. **Timezone-aware:** Slots displayed in doctor's local timezone.

---

## Flow Overview (Target State)

| Step | Bot Action | User Response |
|------|------------|---------------|
| 1 | Greet, offer options (book / availability / question) | "book appointment" |
| 2 | "What's your full name?" | "Abhishek Sahil" |
| 3 | "What's the best phone number to reach you?" | "8264602737" |
| 4 | [Combined consent] "We'll use **8264602737** to confirm your appointment. Ready to pick a time?" | (implicit yes) or "no" |
| 5 | [Optional] "Would you prefer **Video** or **In-clinic** consultation?" | "Video" / "In-clinic" |
| 6 | "Our doctor is usually available: Mon 9–5, Tue 12–5, Wed 9–12, Thu–Fri 9–5. When would you like to come?" | "Tuesday at 2pm" |
| 7a | If slot free: "Tuesday Mar 14 at 2:00 PM is available. Confirm?" | "yes" / "1" |
| 7b | If slot taken: "2pm is taken. Free slots on Tue Mar 14: 1. 10 AM 2. 12:30 PM 3. 3:30 PM. Reply 1, 2, or 3." | "2" |
| 8 | Book → Payment link / confirmation | — |

---

## Consent Options

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A. Remove** | Treat phone as implicit consent | Shortest flow | Weaker legal record |
| **B. Combine** | Single message: "We'll use X for reminders. Ready to pick a time?" | Clear, one step | — |
| **C. Opt-out** | "We'll reach you at X. Reply **no** if you'd prefer not to be contacted." | Explicit choice | One extra step |

**Recommendation:** Option B (combine).

---

## Consultation Type

- **When:** After phone, before slots.
- **Options:** Video, In-clinic (driven by `doctor_settings.consultation_types`).
- **Storage:** `appointments.consultation_type` (e.g. 'video', 'in_clinic').
- **Validation:** Accept "video", "1", "in-clinic", "2", "clinic", "in person".

---

## Slot Selection — Two Modes

### Mode 1: Natural Language (Target)

1. Bot shows weekly availability summary.
2. User says "Tuesday 2pm" or "Mar 14 at 10am".
3. Bot parses (AI or regex) → date + time.
4. Bot checks availability:
   - **Free** → confirm and book.
   - **Taken** → list all free slots for that day; user picks by number.

### Mode 2: Numbered Fallback (Current)

1. Bot shows slots: "1. 10:00 AM 2. 2:30 PM 3. 3:00 PM. Reply with 1, 2, or 3."
2. User replies "1", "2", or "3".
3. Bot books selected slot.

**Use fallback when:** Parsing fails, user sends invalid input, or for backward compatibility.

---

## Date/Time Parsing

- **Relative:** "Tuesday" → next Tuesday; "tomorrow" → tomorrow's date.
- **Absolute:** "Mar 14", "14 March", "2026-03-14".
- **Time:** "2pm", "14:00", "2:30 pm".
- **Ambiguity:** "Tuesday" without week → assume next occurrence.
- **AI:** Use OpenAI to extract `{ date: 'YYYY-MM-DD', time: 'HH:MM' }` when regex insufficient.

---

## Platform Constraints

### Instagram DMs

- **No native calendar/date picker.**
- **Quick replies:** Up to 13 text buttons (~20 chars). Tapping sends button text as message.
- **Generic template:** Carousel with image, title, subtitle, buttons.
- **Web link:** "Pick date & time" button → opens web page with calendar. User selects → submit → backend books → DM confirmation.

### WhatsApp (Future)

- **DatePicker / CalendarPicker** in Flows.
- **List messages** for slot selection.

---

## State Machine (Conversation Steps)

| Step | Description |
|------|-------------|
| `collecting_name` | Asking for full name |
| `collecting_phone` | Asking for phone |
| `collecting_consultation_type` | Asking Video vs In-clinic |
| `consent` | (Legacy) Asking contact permission — may be removed/combined |
| `awaiting_date_time` | Shown weekly availability; waiting for user to say date/time |
| `selecting_slot` | Shown slots for a day; user picks 1, 2, 3 |
| `responded` | Flow complete or paused |

---

## References

- [RECEPTIONIST_BOT_CONVERSATION_RULES.md](./RECEPTIONIST_BOT_CONVERSATION_RULES.md)
- [DOCTOR_SETTINGS_PHASES.md](./DOCTOR_SETTINGS_PHASES.md)
- [e-task-2: Appointment booking flow refinements](../../Development/Daily-plans/March%202026/2026-03-10/e-task-2-appointment-booking-flow-refinements.md)

---

**Last Updated:** 2026-03-10
