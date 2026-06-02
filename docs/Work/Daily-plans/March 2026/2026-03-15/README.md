# AI Receptionist — Human-Like Bot
## 2026-03-15

---

All 4 tasks completed. The bot now uses AI-first extraction with conversation context, human-like replies, and simplified regex for narrow-context messages.

## Completed Tasks

| Task | Status | Summary |
|------|--------|---------|
| [e-task-1: AI-first extraction](./ai-receptionist-e-task-1-ai-first-extraction.md) | ✅ | AI runs when 1–2 fields missing + lastBotMessage; regex fast-path for "male", phone, etc. |
| [e-task-2: Conversation-aware extraction](./ai-receptionist-e-task-2-conversation-aware-extraction.md) | ✅ | ExtractionContext: collectedSummary, relation, recentTurns; richer AI prompt |
| [e-task-3: Human-like responses](./ai-receptionist-e-task-3-human-like-responses.md) | ✅ | AI for "missing fields" reply; collecting_all hint when missingFields; fallback to template |
| [e-task-4: Regex fast-path](./ai-receptionist-e-task-4-regex-fast-path.md) | ✅ | extractFieldsFromMessage(text, { fastPathOnly }) when AI-first; skip name/reason heuristics |

## Key Changes

- **ai-service.ts**: extractFieldsWithAI accepts ExtractionContext; collectingAllHint when missingFields
- **collection-service.ts**: AI-first logic, fastPathOnly, ExtractionContext build, options.recentMessages
- **webhook-worker.ts**: getLastBotMessage, pass lastBotMessage + recentMessages; AI for missing-fields reply
- **extract-patient-fields.ts**: ExtractFieldsOptions.fastPathOnly; skip heuristics when true

## Manual Testing

- [ ] "he is my father he is male obviously" (only gender missing) → gender only; correct confirmation
- [ ] "male" alone → regex fast path, no AI
- [ ] "ramesh masih 56, 9814861579" → AI extracts name; natural "Still need: gender" reply

---

**Reference:** [AI_RECEPTIONIST_PLAN.md](../../../task-management/AI_RECEPTIONIST_PLAN.md)
