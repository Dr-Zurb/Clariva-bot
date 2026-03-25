# 2026-03-25 — Bot Intelligence & Conversation UX

**Date:** 2026-03-25  
**Theme:** Make the receptionist bot context-aware and conversational (ChatGPT/Gemini-like)

---

## Overview

Improve the bot's ability to understand context, handle ambiguity, and respond naturally. The bot currently feels "dumb" due to rigid intent→handler→template routing. This plan shifts toward AI-first response generation with richer context.

---

## Task Order

| Order | Task | Dependency |
|-------|------|------------|
| 1 | [e-task-1: AI context enhancement](./e-task-1-ai-context-enhancement.md) | — |
| 2 | [e-task-2: AI prompt improvements](./e-task-2-ai-prompt-improvements.md) | e-task-1 |
| 3 | [e-task-3: Route ambiguous messages to AI](./e-task-3-route-ambiguous-to-ai.md) | e-task-1, e-task-2 |
| 4 | [e-task-4: Multi-person booking "me and X"](./e-task-4-multi-person-booking.md) | — |
| 5 | [e-task-5: Conversation history expansion](./e-task-5-conversation-history-expansion.md) | — |
| 6 | [e-task-6: Hybrid extraction fallback](./e-task-6-hybrid-extraction-fallback.md) | e-task-1, e-task-2 |

**Recommended order:** e-task-1 → e-task-2 → e-task-3 (core context flow). e-task-4 and e-task-5 can run in parallel. e-task-6 after e-task-2.

---

## Plans (code map & hardening)

- [Receptionist bot — engineering map & backlog](./Receptionist%20Bot%20improvements/RECEPTIONIST_BOT_ENGINEERING.md) — DM + comment pipeline, redundancy, test gaps; execution tasks: [task-management RBH-01…11](../../../../task-management/tasks/receptionist-bot-hardening/README.md)

---

## Reference

- [BOT_INTELLIGENCE_PLANNING.md](../../../Future%20Planning/BOT_INTELLIGENCE_PLANNING.md) — Master planning doc
- [RECEPTIONIST_BOT_CONVERSATION_RULES.md](../../../Reference/RECEPTIONIST_BOT_CONVERSATION_RULES.md)
- [APPOINTMENT_BOOKING_FLOW_V2.md](../../../Reference/APPOINTMENT_BOOKING_FLOW_V2.md)

---

**Last Updated:** 2026-03-25
