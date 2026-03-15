# Bot Intelligence — Planning Document

**Purpose:** Plan and track improvements to make the receptionist bot feel as smart and context-aware as ChatGPT/Gemini for the booking flow.

**Status:** Planning  
**Created:** 2026-03-25  
**Related:** [task-management README](../../task-management/README.md)

---

## Problem Statement

The bot currently feels "dumb" compared to general-purpose AI assistants:

- **Rigid routing:** Intent → fixed handler → template. Little room for nuance.
- **Context loss:** Repeats prompts, doesn't acknowledge user clarifications ("my sister?", "i share my sisters detail first").
- **Template-heavy:** Most replies come from hard-coded strings, not AI.
- **Limited history:** AI gets few message pairs; can't reason about full conversation.
- **Ambiguity handling:** User says "book for me and my sister" — bot doesn't understand two bookings or who goes first.

---

## Root Cause Analysis

| Factor | Current | Desired |
|--------|---------|---------|
| **Response source** | Handlers → templates; AI as fallback | AI as primary; handlers for actions only |
| **Context to AI** | Step, intent, collectedFields | + Collected values, missing fields, last bot message, relation, booking-for-someone-else |
| **History** | 5 message pairs | 8–10 pairs (or configurable) |
| **Ambiguous messages** | Forced through extraction or wrong handler | Route to AI with full context |
| **Multi-person** | Not handled | Detect "me and X", acknowledge, one-at-a-time |

---

## Strategy: Hybrid AI-First

1. **Keep handlers for clear, structured actions** — "yes" → consent; structured data → extract & validate.
2. **Use AI for conversational turns** — Clarifications, questions, odd phrasings, relation mentions.
3. **Enrich AI context** — Pass collected data, missing fields, last bot message, relation.
4. **Improve AI prompt** — Explicit instructions: acknowledge user, don't repeat, be natural.
5. **Handle "me and X"** — Detect, acknowledge two bookings, explain one-at-a-time, ask who first.

---

## Task Dependencies

```
e-task-1 (AI Context) ──┬──► e-task-2 (AI Prompt)
                        │
                        └──► e-task-3 (Route Ambiguous)
                        
e-task-4 (Multi-person) — independent, can run in parallel

e-task-5 (History) — independent

e-task-6 (Hybrid Fallback) — depends on e-task-1, e-task-2
```

---

## Success Criteria

- User says "my sister?" → Bot acknowledges "your sister" and asks for details naturally.
- User says "book for me and my sister" → Bot explains one-at-a-time, asks who first.
- User provides data in odd format → Bot or extraction handles it; no dumb repeat.
- Bot feels conversational, not robotic.
- No PHI in logs; compliance preserved.

---

## Reference Documentation

- [RECEPTIONIST_BOT_CONVERSATION_RULES.md](../../Reference/RECEPTIONIST_BOT_CONVERSATION_RULES.md)
- [APPOINTMENT_BOOKING_FLOW_V2.md](../../Reference/APPOINTMENT_BOOKING_FLOW_V2.md)
- [BOOKING_FOR_OTHERS_AND_APPOINTMENT_LIMITS.md](../../Reference/BOOKING_FOR_OTHERS_AND_APPOINTMENT_LIMITS.md)
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md)

---

**Last Updated:** 2026-03-25
