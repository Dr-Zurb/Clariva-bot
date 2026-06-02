# RT-04 — Reason-first triage, fees, DM context, reply composers

**Philosophy:** §4.1 (reason regex sprawl), §4.7, §7 reason row.

## Paths to read

- `backend/src/utils/reason-first-triage.ts`
- `backend/src/utils/dm-turn-context.ts`
- `backend/src/utils/consultation-fees.ts`
- `backend/src/utils/dm-reply-composer.ts` (and related fee quote composition if split)
- `backend/src/utils/dm-routing-clinical-idle-preview.ts` (if used in DM path)

## What to verify

1. **reason-first:** Is LLM primary for visit reasons per philosophy? Where does regex grow?
2. **Fee routing:** Classifier-led vs keyword arms race — map to `intent-routing-policy` if any.
3. **DM context:** Is `dm-turn-context` the single memory layer or duplicated in handler?

## Deliverable

List of **forbidden** future patterns (e.g. “new symptom regex in triage”) + **approved** extension point (which prompt / test file).
