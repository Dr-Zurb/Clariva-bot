# RT-06 — Service catalog, matcher, learning, staff-review DMs

**Philosophy:** §2–3, §9 learning, §7 catalog row.

## Paths to read

- `backend/src/utils/service-catalog-deterministic-match.ts`
- `backend/src/services/service-match-learning-*.ts` (ingest, policy, assist, autobook as applicable)
- `backend/src/utils/staff-service-review-dm.ts`
- `backend/src/services/intent-routing-policy.ts` (if touches DM routing)

## What to verify

1. **Hybrid:** High-confidence deterministic + LLM map-to-id — is boundary clear?
2. **Learning:** Structured fields first; no silent PHI storage — cross-check STAFF_FEEDBACK_LEARNING_INITIATIVE.
3. **Staff DMs:** Template vs LLM; consistency with patient-facing philosophy.

## Deliverable

**Boundary statement:** when matcher must call LLM vs when deterministic is acceptable.
