-- ============================================================================
-- Patient Chronic Conditions — detail fields (condition card UX)
-- ============================================================================
-- Migration: 132_patient_chronic_conditions_details.sql
-- Date:      2026-06-10
-- Description:
--   Adds structured detail fields for substance-style condition cards:
--     - diagnosed_ago_value / diagnosed_ago_unit (relative diagnosis timing)
--     - resolved_ago_value / resolved_ago_unit (when past/resolved)
--     - on_treatment (explicit gate for medication block)
--   diagnosed_on (existing) remains for exact-date mode.
-- ============================================================================

ALTER TABLE patient_chronic_conditions
  ADD COLUMN IF NOT EXISTS diagnosed_ago_value INTEGER NULL
    CHECK (diagnosed_ago_value IS NULL OR (diagnosed_ago_value >= 1 AND diagnosed_ago_value <= 120)),
  ADD COLUMN IF NOT EXISTS diagnosed_ago_unit TEXT NULL
    CHECK (diagnosed_ago_unit IS NULL OR diagnosed_ago_unit IN ('days', 'weeks', 'months', 'years')),
  ADD COLUMN IF NOT EXISTS resolved_ago_value INTEGER NULL
    CHECK (resolved_ago_value IS NULL OR (resolved_ago_value >= 1 AND resolved_ago_value <= 120)),
  ADD COLUMN IF NOT EXISTS resolved_ago_unit TEXT NULL
    CHECK (resolved_ago_unit IS NULL OR resolved_ago_unit IN ('days', 'weeks', 'months', 'years')),
  ADD COLUMN IF NOT EXISTS on_treatment BOOLEAN NULL;

COMMENT ON COLUMN patient_chronic_conditions.diagnosed_ago_value IS 'Approx diagnosis timing (relative) when exact date unknown.';
COMMENT ON COLUMN patient_chronic_conditions.diagnosed_ago_unit IS 'Unit for diagnosed_ago_value: days | weeks | months | years.';
COMMENT ON COLUMN patient_chronic_conditions.resolved_ago_value IS 'Approx time since resolution (past conditions).';
COMMENT ON COLUMN patient_chronic_conditions.resolved_ago_unit IS 'Unit for resolved_ago_value.';
COMMENT ON COLUMN patient_chronic_conditions.on_treatment IS 'Whether patient is/was on treatment for this condition; drives med block in UI.';

-- ============================================================================
-- Reverse migration:
--   ALTER TABLE patient_chronic_conditions
--     DROP COLUMN IF EXISTS diagnosed_ago_value,
--     DROP COLUMN IF EXISTS diagnosed_ago_unit,
--     DROP COLUMN IF EXISTS resolved_ago_value,
--     DROP COLUMN IF EXISTS resolved_ago_unit,
--     DROP COLUMN IF EXISTS on_treatment;
-- ============================================================================
-- Migration Complete
-- ============================================================================
