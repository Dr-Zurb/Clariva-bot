# RT-03 — Collection, consent, patient match

**Philosophy:** §4.6–4.7 (blobs, thread context), §4.8, extraction code map §7.

## Paths to read

- `backend/src/services/collection-service.ts`
- `backend/src/services/consent-service.ts` — `parseConsentReply`, persist/deny
- `backend/src/utils/extract-patient-fields.ts` — treat as **fallback only** per file header
- `backend/src/utils/booking-consent-context.ts`
- `backend/src/services/patient-matching-service.ts` (DM-relevant paths)
- `backend/src/services/patient-service.ts` (booking create / placeholder)

## What to verify

1. **AI-first:** `validateAndApplyExtracted` — confirm ordering: phone/email extract → AI → regex fallback.
2. **Merge guards:** Symptom/relation/gender guards — are they minimal validation vs NLU duplication?
3. **Consent:** Keyword lists in `parseConsentReply` — document when semantic layer is skipped.
4. **Thread:** Does reason_for_visit pull from thread state where appropriate?

## Deliverable

Table: **file** | **risk** (regex-heavy / OK) | **recommended direction** (prompt-only / structured output / keep guard).
