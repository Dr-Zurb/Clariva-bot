# RT-07 — Shared utils, validation, conversation types

**Philosophy:** §4.5 (one canonical output), §5 (strict grammars).

## Paths to read

- `backend/src/types/conversation.ts` — `ConversationState`, steps, `lastPromptKind`
- `backend/src/utils/validation.ts` — patient field validation
- `backend/src/utils/booking-link-copy.ts`
- `backend/src/utils/log-instagram-dm-routing.ts` (if routing instrumentation)

## What to verify

1. **State:** `lastPromptKind` used consistently to reduce substring hacks in handler?
2. **Validation:** `validatePatientField` — pure validation, not NLU (good).
3. **Observability:** Logs — metadata only, no PHI in logs per policy.

## Deliverable

Gaps: **state fields** that should exist to avoid regex detection of “what we asked”.
