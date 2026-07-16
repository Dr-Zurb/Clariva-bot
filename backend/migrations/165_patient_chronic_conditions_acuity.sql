-- ============================================================================
-- Patient Chronic Conditions — clinical trajectory / acuity (Assessment card)
-- ============================================================================
-- Migration: 165_patient_chronic_conditions_acuity.sql
-- Date:      2026-07-12
-- Description:
--   Adds an `acuity` column to patient_chronic_conditions so the Assessment
--   "Known conditions" cards can record a condition's clinical trajectory
--   (improving | stable | worsening), mirroring the per-diagnosis acuity added
--   for prescription diagnoses in migration 160/161. Optional (NULL = not
--   assessed); does not affect the Active | Past status.
-- ============================================================================

ALTER TABLE patient_chronic_conditions
  ADD COLUMN IF NOT EXISTS acuity TEXT NULL;

-- Value constraint (drop + add so re-runs stay idempotent even if the column
-- pre-existed without the check).
ALTER TABLE patient_chronic_conditions
  DROP CONSTRAINT IF EXISTS patient_chronic_conditions_acuity_chk;

ALTER TABLE patient_chronic_conditions
  ADD CONSTRAINT patient_chronic_conditions_acuity_chk
  CHECK (acuity IS NULL OR acuity IN ('improving', 'stable', 'worsening'));

COMMENT ON COLUMN patient_chronic_conditions.acuity IS
  'PHI. Clinical trajectory of the condition: improving | stable | worsening. NULL = not assessed. Mirrors per-diagnosis acuity (migration 160/161).';

-- RLS unchanged: patient_chronic_conditions already carries the doctor-scoped
-- policies from its original migration; this additive column inherits them.

-- ============================================================================
-- Reverse migration:
--   ALTER TABLE patient_chronic_conditions
--     DROP CONSTRAINT IF EXISTS patient_chronic_conditions_acuity_chk;
--   ALTER TABLE patient_chronic_conditions
--     DROP COLUMN IF EXISTS acuity;
-- ============================================================================
-- Migration Complete
-- ============================================================================
