# pmt-01 — Migration + types + dual-read

> **Model:** Opus (new migration).  
> **Depends:** —  
> **Plan:** [plan-patients-multi-tag-batch.md](../plan-patients-multi-tag-batch.md) · PMT-D1, D2, D6

## Goal

Add `patients.patient_tags TEXT[]`, backfill from `patient_tag`, wire TypeScript / list summary dual-read.

## Work

1. New migration (next number after latest in `backend/migrations/`):
   - `ADD COLUMN patient_tags TEXT[] NOT NULL DEFAULT '{}'`
   - Backfill from `patient_tag`
   - GIN index suitable for membership (`?tag=`)
   - Comment: clinic-internal labels, not PHI
   - Do **not** drop `patient_tag` in this migration
2. Update `backend/src/types/database.ts` (or regenerate per repo practice).
3. List summary mapper: emit `patient_tags: string[]` and keep `patient_tag: tags[0] ?? null` for one release.
4. Unit/migration smoke: backfill row with existing tag; empty tag → `{}`.

## Out of scope

Bulk `op` API (pmt-02), FE (pmt-03+), dropping `patient_tag`.

## Done when

- Migration applies clean on fresh + existing DB.
- List payloads include `patient_tags` for tagged patients.
- Existing `patient_tag` readers still see a value via dual-read.
