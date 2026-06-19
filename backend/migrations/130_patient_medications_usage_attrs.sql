-- ============================================================================
-- Patient Medications — intake pattern & source (Subjective Phase A)
-- ============================================================================
-- Migration: 130_patient_medications_usage_attrs.sql
-- Date:      2026-06-10
-- Description:
--   Adds clinical usage attributes to patient_medications:
--     - intake_pattern: regular | irregular | prn (as-needed)
--     - source:         prescribed | self | otc
--
--   Both nullable — existing rows remain valid; UI defaults on new entry.
-- ============================================================================

ALTER TABLE patient_medications
  ADD COLUMN IF NOT EXISTS intake_pattern TEXT NULL
    CHECK (intake_pattern IN ('regular', 'irregular', 'prn')),
  ADD COLUMN IF NOT EXISTS source TEXT NULL
    CHECK (source IN ('prescribed', 'self', 'otc'));

COMMENT ON COLUMN patient_medications.intake_pattern IS
  'How the patient takes the drug: regular | irregular | prn (as-needed).';
COMMENT ON COLUMN patient_medications.source IS
  'Origin: prescribed | self (self-medicating) | otc.';

-- ============================================================================
-- Reverse migration:
--   ALTER TABLE patient_medications
--     DROP COLUMN IF EXISTS intake_pattern,
--     DROP COLUMN IF EXISTS source;
-- ============================================================================
-- Migration Complete
-- ============================================================================
