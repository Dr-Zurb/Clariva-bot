-- ============================================================================
-- Patient Medications — relative start timing (chart med redesign)
-- ============================================================================
-- Migration: 137_patient_medications_started_ago.sql
-- Date:      2026-06-12
-- Description:
--   How long the patient has been on an active medication ("for 5 years",
--   "since 2 years"). Mirrors stopped_ago_* (migration 134) and condition
--   diagnosed_ago_* — relative only; absolute started_on stays optional.
-- ============================================================================

ALTER TABLE patient_medications
  ADD COLUMN IF NOT EXISTS started_ago_value INTEGER NULL,
  ADD COLUMN IF NOT EXISTS started_ago_unit  TEXT NULL;

ALTER TABLE patient_medications
  DROP CONSTRAINT IF EXISTS patient_medications_started_ago_value_check;
ALTER TABLE patient_medications
  ADD CONSTRAINT patient_medications_started_ago_value_check
  CHECK (started_ago_value IS NULL OR started_ago_value > 0);

ALTER TABLE patient_medications
  DROP CONSTRAINT IF EXISTS patient_medications_started_ago_unit_check;
ALTER TABLE patient_medications
  ADD CONSTRAINT patient_medications_started_ago_unit_check
  CHECK (
    started_ago_unit IS NULL
    OR started_ago_unit IN ('days','weeks','months','years')
  );

COMMENT ON COLUMN patient_medications.started_ago_value IS
  'Relative duration the patient has been on this medication (e.g. 5 in "for 5 years").';
COMMENT ON COLUMN patient_medications.started_ago_unit IS
  'Unit for started_ago_value: days | weeks | months | years.';
