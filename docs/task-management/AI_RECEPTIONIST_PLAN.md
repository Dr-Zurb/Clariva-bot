# AI Receptionist — Human-Like Bot Plan

**Purpose:** Transform the Clariva bot from regex-heavy, template-driven behavior to an AI-first, human-like receptionist that understands conversations and stores data intelligently.

**Status:** Planning  
**Created:** 2026-03-26  
**Related:** [BOT_INTELLIGENCE_PLANNING.md](../Development/Future%20Planning/BOT_INTELLIGENCE_PLANNING.md)

---

## Vision

The bot should mimic a human receptionist with basic intelligence:
- **Understand context** — "We asked for gender" → interpret "he is my father he is male obviously" as gender only
- **Store data intelligently** — Extract and persist only what the user meant, not regex artifacts
- **Respond naturally** — Acknowledge, clarify, and guide like a real person
- **Remember the conversation** — Use prior turns to disambiguate and avoid repetition

---

## Problem: Current Architecture

| Layer | Current | Desired |
|-------|---------|---------|
| **Extraction** | Regex first, AI only when regex returns empty | AI-first when context exists; regex for simple structured input only |
| **Context to extraction** | Single message + missing fields list | + Last bot message, what we asked for, conversation summary |
| **Response generation** | Handlers → templates; AI for ambiguous | AI as primary; handlers only for structured actions (yes, slot link) |
| **Understanding** | Stateless per-message | Conversation-aware, semantic |

**Example failure:** User says "he is my father he is male obviously" (gender only). Regex extracts it as name + reason. AI never runs because regex "succeeded." Result: dumb confirmation with wrong data.

---

## Strategy: AI-First, Human-Like

1. **AI-first extraction** when we have conversation context (missing fields, last bot message)
2. **Conversation-aware prompts** — Pass "we asked for X, user said Y" so AI understands intent
3. **Regex as fast path** — Only for clearly structured input: "male", "9814861579", "Name: X, Age: 25"
4. **Human-like responses** — AI generates most replies; templates only for confirm, consent, slot link
5. **Smarter merge** — Prefer AI extraction when context is narrow (e.g. only gender missing)

---

## Task Dependencies

```
e-task-1 (AI-first extraction) ──┬──► e-task-2 (Conversation-aware extraction)
                                 │
                                 └──► e-task-3 (Human-like responses)
                                 
e-task-4 (Regex fast-path) — after e-task-1, e-task-2 (simplify regex)
```

---

## Task Summary

| Task | Title | Est. | Depends |
|------|-------|------|---------|
| e-task-1 | AI-first extraction with context | 4–5 h | — |
| e-task-2 | Conversation-aware extraction | 3–4 h | e-task-1 |
| e-task-3 | Human-like response generation | 4–5 h | e-task-1 |
| e-task-4 | Simplify regex to fast-path only | 2–3 h | e-task-1, e-task-2 |

---

## Success Criteria

- User: "he is my father he is male obviously" → Bot extracts only gender; confirmation shows correct name (Ramesh Masih) and reason
- User: "i wanna get her checked for diabetes" → Bot extracts reason, not name
- Bot acknowledges context: "Got it, male. Let me confirm: **Ramesh Masih**, **56**, **male**..."
- Feels conversational, not robotic
- No PHI in logs; compliance preserved

---

## Reference Documentation

- [BOT_INTELLIGENCE_PLANNING.md](../Development/Future%20Planning/BOT_INTELLIGENCE_PLANNING.md)
- [APPOINTMENT_BOOKING_FLOW_V2.md](../Reference/APPOINTMENT_BOOKING_FLOW_V2.md)
- [COMPLIANCE.md](../Reference/COMPLIANCE.md)
- [CODE_CHANGE_RULES.md](./CODE_CHANGE_RULES.md)

---

**Last Updated:** 2026-03-26
