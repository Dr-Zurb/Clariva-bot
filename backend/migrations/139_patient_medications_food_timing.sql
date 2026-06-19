-- ============================================================================
-- Patient medications — food / timing relevance (chart med cards)
-- ============================================================================
-- Migration: 139_patient_medications_food_timing.sql
-- Date:      2026-06-13
-- Description:
--   Structured food-timing on chart meds (with food, empty stomach, etc.).
--   Mirrors prescription_medicines.food_timing (migration 133). Free-text
--   edge cases (e.g. "avoid milk") stay in `note`.
-- ============================================================================

ALTER TABLE patient_medications
  ADD COLUMN IF NOT EXISTS food_timing TEXT NULL;

ALTER TABLE patient_medications
  DROP CONSTRAINT IF EXISTS patient_medications_food_timing_check;

ALTER TABLE patient_medications
  ADD CONSTRAINT patient_medications_food_timing_check
  CHECK (
    food_timing IS NULL
    OR food_timing IN ('before_food','after_food','with_food','empty_stomach','bedtime')
  );

COMMENT ON COLUMN patient_medications.food_timing IS
  'Structured food/timing instruction for chart meds. Free-text notes stay in note.';

-- ============================================================================
-- Reverse migration:
--   ALTER TABLE patient_medications
--     DROP CONSTRAINT IF EXISTS patient_medications_food_timing_check,
--     DROP COLUMN IF EXISTS food_timing;
-- ============================================================================
