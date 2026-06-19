-- ============================================================================
-- Patient Medications — combo / fixed-dose-combination strength components
-- ============================================================================
-- Migration: 138_patient_medications_strength_components.sql
-- Date:      2026-06-13
-- Description:
--   Adds `strength_components` JSONB to patient_medications so fixed-dose
--   combinations (FDCs) like Rcinex "600/300" or Augmentin "625" can be
--   stored as one addressable entry per active ingredient:
--
--     [ { "value": 600, "unit": "mg" },
--       { "value": 300, "unit": "mg" } ]
--
--   Why a JSONB array (not the scalar strength_value/strength_unit from
--   migration 136):
--     - the scalar columns can only hold ONE number, so combos previously
--       collapsed to free-text `strength` ("600/300 mg") with no structured
--       representation (no dose math, no per-salt interaction checks).
--     - an array handles 2-, 3-, and 4-drug FDCs (e.g. TB 4-FDC) uniformly.
--     - `ingredient` is optional — populated when the salt name is known
--       (drug_master / AI parse), omitted when the doctor just types "600/300".
--
--   Backward compatibility (mirrors Decision T2-D4):
--     - Single-ingredient meds keep using strength_value/strength_unit and
--       leave strength_components NULL.
--     - Combos leave strength_value/strength_unit NULL and carry the array.
--     - The free-text `strength` column keeps mirroring the rendered display
--       string ("600/300 mg") for the PDF / SMS / older readers.
-- ============================================================================

ALTER TABLE patient_medications
  ADD COLUMN IF NOT EXISTS strength_components JSONB NULL;

ALTER TABLE patient_medications
  DROP CONSTRAINT IF EXISTS patient_medications_strength_components_check;
ALTER TABLE patient_medications
  ADD CONSTRAINT patient_medications_strength_components_check
  CHECK (
    strength_components IS NULL
    OR jsonb_typeof(strength_components) = 'array'
  );

COMMENT ON COLUMN patient_medications.strength_components IS
  'Fixed-dose-combination strength, one entry per active ingredient: '
  '[{"value":600,"unit":"mg","ingredient":"Rifampicin"},…]. NULL for '
  'single-ingredient meds (which use strength_value/strength_unit). '
  'Free-text `strength` mirrors the rendered "600/300 mg" string.';

-- ============================================================================
-- Reverse migration:
--   ALTER TABLE patient_medications
--     DROP CONSTRAINT IF EXISTS patient_medications_strength_components_check,
--     DROP COLUMN IF EXISTS strength_components;
-- ============================================================================
-- Migration Complete
-- ============================================================================
