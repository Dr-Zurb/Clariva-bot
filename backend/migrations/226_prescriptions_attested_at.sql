-- ============================================================================
-- 226_prescriptions_attested_at.sql
-- Attest stamp on prescriptions (rx-lifecycle / rxl-05).
-- Date:    2026-08-31
-- ============================================================================
-- Purpose:
--   Record the moment a prescription was attested — the lock boundary
--   everything in rx-lifecycle is measured from. Distinct from
--   sent_to_patient_at, which means only that the digital send happened.
--
--   Set once (rxl-06) by the first of finish / send / print (RXL-Q1).
--   This migration adds the column only. No writer. No behaviour change.
--
-- Hard-rules:
--   - Additive ALTER. No backfill. Historical rows stay NULL and are
--     treated as locked by appointment status until re-attested.
--   - Drafts stay NULL (no attest time yet).
--   - RLS unchanged: doctor-owned via doctor_id (migration 026) covers
--     the new column. All four prescriptions policies still apply.
--   - No speculative index — no query in this phase filters on the column.
--   - No revision / supersede columns — those are rxl-11.
--
-- Rollback (document only):
--   ALTER TABLE prescriptions DROP COLUMN IF EXISTS attested_at;
-- ============================================================================

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS attested_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN prescriptions.attested_at IS
  'Lock boundary. Set once by the first of finish / send / print. Not sent_to_patient_at (digital send only). Null on drafts and historical rows; no backfill.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged: auth.uid() = doctor_id (026) covers attested_at.
-- Additive only: existing rows stay NULL; reads and writes unaffected.
-- No index: no filter on this column yet.
-- ============================================================================
