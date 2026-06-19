-- ============================================================================
-- Patient Medications — dose schedule pattern (1-0-1, 1-1-1, …)
-- ============================================================================
-- Migration: 135_patient_medications_dose_schedule.sql
-- Date:      2026-06-11
-- Description:
--   Stores Indian-style dose timing patterns alongside frequency_code.
--   Example: frequency_code = TID, dose_schedule = '1-0-1'
-- ============================================================================

ALTER TABLE patient_medications
  ADD COLUMN IF NOT EXISTS dose_schedule TEXT NULL;

ALTER TABLE patient_medications
  DROP CONSTRAINT IF EXISTS patient_medications_dose_schedule_check;
ALTER TABLE patient_medications
  ADD CONSTRAINT patient_medications_dose_schedule_check
  CHECK (
    dose_schedule IS NULL
    OR dose_schedule ~ '^[0-9]+(-[0-9]+)+$'
  );

COMMENT ON COLUMN patient_medications.dose_schedule IS
  'Dose timing pattern (e.g. 1-0-1, 1-1-1). Complements frequency_code.';

-- Reverse migration:
--   ALTER TABLE patient_medications DROP COLUMN IF EXISTS dose_schedule;
