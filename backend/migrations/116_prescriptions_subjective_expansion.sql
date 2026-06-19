-- ============================================================================
-- Prescriptions subjective expansion — structured complaints + owned histories
-- ============================================================================
-- Migration: 116_prescriptions_subjective_expansion.sql
-- Date:      2026-06-03
-- Batch:     subjective-tab (Phase 1) — task subj-01
-- Description:
--   Adds structured chief-complaint cards (`complaints` JSONB array) and
--   three owned narrative history columns (family / social / past-surgical)
--   to `prescriptions`. The existing `cc` and `hopi` columns STAY — the
--   cockpit form derives them from `complaints` on save (ST-D2) so PDF,
--   SMS summary, and snapshot readers remain unchanged.
--
-- PHI:
--   Every new column carries PHI. RLS on `prescriptions` already covers all
--   columns (doctor-only access via `auth.uid() = doctor_id`, migration 026).
--   This migration does NOT modify RLS policies. 7-year retention applies
--   per COMPLIANCE; account-deletion cascade already covers `prescriptions`.
--
-- Idempotency:
--   All `ADD COLUMN` statements use `IF NOT EXISTS` (Postgres 9.6+).
--
-- Rollback (NOT shipped as a separate migration — documented only):
--   ALTER TABLE prescriptions
--     DROP COLUMN IF EXISTS past_surgical_history,
--     DROP COLUMN IF EXISTS social_history,
--     DROP COLUMN IF EXISTS family_history,
--     DROP COLUMN IF EXISTS complaints;
-- ============================================================================

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS complaints              JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS family_history          TEXT  NULL,
  ADD COLUMN IF NOT EXISTS social_history          TEXT  NULL,
  ADD COLUMN IF NOT EXISTS past_surgical_history   TEXT  NULL;

COMMENT ON COLUMN prescriptions.complaints IS
  'PHI: structured chief-complaint + HPI cards (OLDCARTS). cc/hopi are derived from this on save. subjective-tab / ST-D1.';

COMMENT ON COLUMN prescriptions.family_history IS
  'PHI: family history narrative (free-text). subjective-tab / ST-D3.';

COMMENT ON COLUMN prescriptions.social_history IS
  'PHI: social / personal history narrative (free-text). subjective-tab / ST-D3.';

COMMENT ON COLUMN prescriptions.past_surgical_history IS
  'PHI: past surgical history narrative (free-text). subjective-tab / ST-D3.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged: doctor-only access via `auth.uid() = doctor_id` (migration 026)
--                covers all new columns.
-- PHI: every added column carries PHI; 7-year retention applies per COMPLIANCE.
-- ============================================================================
