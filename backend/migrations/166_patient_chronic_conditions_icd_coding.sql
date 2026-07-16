-- ============================================================================
-- Patient Chronic Conditions — optional ICD-11 coding (PMH / Known conditions)
-- ============================================================================
-- Migration: 166_patient_chronic_conditions_icd_coding.sql
-- Date:      2026-07-12
-- Description:
--   Adds optional `code` + `code_title` columns so chronic conditions can carry
--   the same ICD-11 (MMS) coding used by visit diagnoses (asmt-06). Coding is
--   OPTIONAL — free-text / uncoded conditions still save. Enables shared ICD
--   entry UX across Assessment diagnoses, Known conditions, and Subjective PMH,
--   with dedupe-by-code when a code is present.
-- ============================================================================

ALTER TABLE patient_chronic_conditions
  ADD COLUMN IF NOT EXISTS code TEXT NULL,
  ADD COLUMN IF NOT EXISTS code_title TEXT NULL;

COMMENT ON COLUMN patient_chronic_conditions.code IS
  'PHI. Optional ICD-11 (MMS) stem code from diagnosis_catalog (e.g. BA00). NULL = uncoded free-text condition.';

COMMENT ON COLUMN patient_chronic_conditions.code_title IS
  'PHI. Canonical ICD-11 title for `code` (e.g. Essential hypertension). NULL when uncoded.';

-- RLS unchanged: patient_chronic_conditions already carries the doctor-scoped
-- policies from its original migration; these additive columns inherit them.

-- ============================================================================
-- Reverse migration:
--   ALTER TABLE patient_chronic_conditions
--     DROP COLUMN IF EXISTS code,
--     DROP COLUMN IF EXISTS code_title;
-- ============================================================================
-- Migration Complete
-- ============================================================================
