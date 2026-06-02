# RT-08 — Tests, golden corpora, characterization

**Philosophy:** Regression corpus as quality gate (checklist §6).

## Paths to read

- `backend/tests/unit/workers/dm-routing-golden.test.ts`
- `backend/tests/unit/utils/dm-routing-golden-corpus.test.ts` (and corpus data files referenced)
- `backend/tests/unit/workers/webhook-worker-characterization.test.ts`
- `backend/tests/unit/services/booking-turn-classifiers.test.ts`
- `backend/tests/unit/services/ai-service.test.ts` (sample)
- `backend/tests/unit/services/collection-service.test.ts`

## What to verify

1. **Coverage:** Do corpora cover **context** cases (optional extras, confirm_details, fee thread) or only keywords?
2. **Gaps:** Add future cases for “no thats it”, multi-field blobs, Hinglish.
3. **Flaky:** Any tests that depend on live OpenAI (should be mocked or skipped without key)?

## Deliverable

List of **minimum new corpus entries** needed for “elite” patient experience.
