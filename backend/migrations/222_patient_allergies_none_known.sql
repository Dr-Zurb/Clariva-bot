-- ============================================================================
-- 222_patient_allergies_none_known.sql
-- Explicit "no known allergies" assertion for the allergies section.
-- Date:    2026-08-29
-- ============================================================================
-- Purpose:
--   An empty patient_allergies list is ambiguous: it can mean "asked, nothing
--   known" or "never asked". The Rx has to say which, so the doctor records
--   the nil-known assertion instead of us inferring it from an empty list.
--   FALSE (the default) means never asserted → the Rx prints "Not recorded".
--
-- Safety:
--   Additive columns on an existing doctor-scoped PHI table. Idempotent.
--   No backfill: DEFAULT FALSE is the correct value for every existing row
--   (none of them carry an assertion). Reverse at file foot.
--
-- RLS:
--   Unchanged. Migration 158 policies gate on doctor_id only, so the new
--   columns are covered by the existing SELECT/INSERT/UPDATE/DELETE policies.
-- ============================================================================

ALTER TABLE patient_allergies_section_notes
  ADD COLUMN IF NOT EXISTS no_known_allergies BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE patient_allergies_section_notes
  ADD COLUMN IF NOT EXISTS no_known_allergies_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN patient_allergies_section_notes.no_known_allergies IS
  'Doctor asserted the patient has no known allergies. FALSE = never asserted, not a negative finding. Cleared when an allergen is recorded.';
COMMENT ON COLUMN patient_allergies_section_notes.no_known_allergies_at IS
  'When the nil-known assertion was last made. NULL whenever no_known_allergies is FALSE.';

-- ============================================================================
-- Reverse migration (manual):
--
--   ALTER TABLE patient_allergies_section_notes
--     DROP COLUMN IF EXISTS no_known_allergies_at;
--   ALTER TABLE patient_allergies_section_notes
--     DROP COLUMN IF EXISTS no_known_allergies;
-- ============================================================================
