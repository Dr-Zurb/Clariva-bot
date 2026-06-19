-- ============================================================================
-- Prescription Medicines — dose details (medication card redesign)
-- ============================================================================
-- Migration: 133_prescription_medicines_dose_details.sql
-- Date:      2026-06-11
-- Description:
--   Additive columns on `prescription_medicines` for the substance-style
--   medicine cards + one-line sig parsing:
--     - dose_qty     NUMERIC NULL  — quantity per dose (e.g. 2 in "2 tab")
--     - dose_unit    TEXT NULL     — unit per dose (tab/cap/ml/spoon/…)
--     - form         TEXT NULL     — pharmaceutical form (tab/syrup/ointment/…)
--                                    copied from drug_master.form or parsed
--                                    from the "syp/oint/inj" sig prefix
--     - food_timing  TEXT NULL     — structured food/timing instruction
--                                    (before/after/with food, empty stomach,
--                                    bedtime); free-text notes stay in
--                                    `instructions`
--
--   Legacy free-text columns (`dosage`, `frequency`, `duration`, `route`,
--   `instructions`) STAY and keep being mirrored (Decision T2-D4), so the
--   PDF / SMS / older viewers keep working unchanged.
-- ============================================================================

ALTER TABLE prescription_medicines
  ADD COLUMN IF NOT EXISTS dose_qty    NUMERIC(6,2) NULL,
  ADD COLUMN IF NOT EXISTS dose_unit   TEXT NULL,
  ADD COLUMN IF NOT EXISTS form        TEXT NULL,
  ADD COLUMN IF NOT EXISTS food_timing TEXT NULL;

ALTER TABLE prescription_medicines
  DROP CONSTRAINT IF EXISTS prescription_medicines_dose_qty_check;
ALTER TABLE prescription_medicines
  ADD CONSTRAINT prescription_medicines_dose_qty_check
  CHECK (dose_qty IS NULL OR dose_qty > 0);

ALTER TABLE prescription_medicines
  DROP CONSTRAINT IF EXISTS prescription_medicines_dose_unit_check;
ALTER TABLE prescription_medicines
  ADD CONSTRAINT prescription_medicines_dose_unit_check
  CHECK (
    dose_unit IS NULL
    OR dose_unit IN ('tab','cap','ml','spoon','drops','puff','sachet','unit','application')
  );

ALTER TABLE prescription_medicines
  DROP CONSTRAINT IF EXISTS prescription_medicines_food_timing_check;
ALTER TABLE prescription_medicines
  ADD CONSTRAINT prescription_medicines_food_timing_check
  CHECK (
    food_timing IS NULL
    OR food_timing IN ('before_food','after_food','with_food','empty_stomach','bedtime')
  );

COMMENT ON COLUMN prescription_medicines.dose_qty IS
  'Quantity per dose (e.g. 2 in "2 tab OD"). Pairs with dose_unit.';
COMMENT ON COLUMN prescription_medicines.dose_unit IS
  'Unit per dose: tab | cap | ml | spoon (≈5ml) | drops | puff | sachet | unit | application.';
COMMENT ON COLUMN prescription_medicines.form IS
  'Pharmaceutical form (tab/syrup/ointment/…). Free text — mirrors drug_master.form or the parsed sig prefix.';
COMMENT ON COLUMN prescription_medicines.food_timing IS
  'Structured food/timing instruction. Free-text notes (e.g. "avoid face") stay in instructions.';

-- ============================================================================
-- Reverse migration:
--   ALTER TABLE prescription_medicines
--     DROP COLUMN IF EXISTS dose_qty,
--     DROP COLUMN IF EXISTS dose_unit,
--     DROP COLUMN IF EXISTS form,
--     DROP COLUMN IF EXISTS food_timing;
-- ============================================================================
