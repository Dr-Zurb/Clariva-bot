# RT-01 — `ai-service.ts` (intent, extraction, booking turns)

**Philosophy:** §1–3 (LLM-first), §4.1 (regex sprawl), §4.5 (duplicate classification), §4.8 (context before keywords), code map §7.

## Paths to read (primary)

- `backend/src/services/ai-service.ts` (full file; use sections: intent cache, `classifyIntent`, `extractFieldsWithAI`, `EXTRACTION_*` prompts, `resolveConsentReplyForBooking`, `resolveConfirmDetailsReplyForBooking`, `classifyConsentReplySemantic`, booking turn classifiers, `generateResponse` / `buildClassifyIntentContext`)
- `backend/src/types/ai.ts` — intent enums, `IntentDetectionResult`, topics

## What to verify

1. **Single source of truth:** Is there intent logic duplicated in webhook with overlapping keyword checks? Note every place that re-implements “fee” / “book” / “yes” outside the LLM path.
2. **Extraction:** Is `extractFieldsWithAI` the primary path when API is available? Is regex fallback clearly bounded?
3. **Consent / confirm:** Does `resolveConsentReplyForBooking` apply **last assistant message** before global deny lists? (`booking-consent-context` imports)
4. **Prompts:** Are JSON shapes stable? Any prompt that could invent prices/URLs?
5. **Cache / flags:** Document cache key prefixes and when stale behavior could diverge from philosophy.

## Deliverable

Bullet list: **aligned** / **gap** / **severity** (P0–P3) with line references if possible.
