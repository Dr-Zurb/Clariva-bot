-- ============================================================================
-- Patient Medications — structured strength + interval frequency codes
-- ============================================================================
-- Migration: 136_patient_medications_strength_and_interval_freq.sql
-- Date:      2026-06-11
-- Description:
--   - strength_value  NUMERIC — drug strength quantity (e.g. 500)
--   - strength_unit   TEXT    — mg | g | mcg | iu | pct
--   - Extend frequency_code to include interval / weekly codes:
--     Q4H | Q6H | Q8H | Q12H | Q24H | QW
-- ============================================================================

ALTER TABLE patient_medications
  ADD COLUMN IF NOT EXISTS strength_value NUMERIC(10,3) NULL,
  ADD COLUMN IF NOT EXISTS strength_unit   TEXT NULL;

ALTER TABLE patient_medications
  DROP CONSTRAINT IF EXISTS patient_medications_strength_value_check;
ALTER TABLE patient_medications
  ADD CONSTRAINT patient_medications_strength_value_check
  CHECK (strength_value IS NULL OR strength_value > 0);

ALTER TABLE patient_medications
  DROP CONSTRAINT IF EXISTS patient_medications_strength_unit_check;
ALTER TABLE patient_medications
  ADD CONSTRAINT patient_medications_strength_unit_check
  CHECK (
    strength_unit IS NULL
    OR strength_unit IN ('mg','g','mcg','iu','pct')
  );

ALTER TABLE patient_medications
  DROP CONSTRAINT IF EXISTS patient_medications_frequency_code_check;
ALTER TABLE patient_medications
  ADD CONSTRAINT patient_medications_frequency_code_check
  CHECK (
    frequency_code IS NULL
    OR frequency_code IN (
      'OD','BID','TID','QID','QHS','PRN','STAT','CUSTOM',
      'Q4H','Q6H','Q8H','Q12H','Q24H','QW'
    )
  );

COMMENT ON COLUMN patient_medications.strength_value IS
  'Structured drug strength quantity (e.g. 500 in "500 mg").';
COMMENT ON COLUMN patient_medications.strength_unit IS
  'Strength unit: mg | g | mcg | iu | pct. Legacy `strength` mirrors for readers.';
