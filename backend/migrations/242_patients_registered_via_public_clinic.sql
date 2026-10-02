-- ============================================================================
-- 242_patients_registered_via_public_clinic.sql
-- ============================================================================
-- Date: 2026-09-23
-- Batch: clinic-link (clk-03)
-- Description:
--   A public clinic link (/d/:slug) is not the bot, the desk, a book-for-other
--   chat, an import, or the doctor typing the row. Widen registered_via with
--   one operational value: public_clinic.
--
--   No backfill. No RLS change. Not a PHI column.
--
-- Rollback (document only):
--   UPDATE patients SET registered_via = NULL WHERE registered_via = 'public_clinic';
--   ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_registered_via_check;
--   ALTER TABLE patients ADD CONSTRAINT patients_registered_via_check
--     CHECK (registered_via IS NULL OR registered_via IN
--       ('bot', 'front_desk', 'booking_for_other', 'import', 'doctor'));
-- ============================================================================

ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_registered_via_check;

ALTER TABLE patients
  ADD CONSTRAINT patients_registered_via_check
  CHECK (
    registered_via IS NULL
    OR registered_via IN (
      'bot',
      'front_desk',
      'booking_for_other',
      'import',
      'doctor',
      'public_clinic'
    )
  );

COMMENT ON COLUMN patients.registered_via IS
  'How the patient row was created. Not PHI. '
  'Values: bot | front_desk | booking_for_other | import | doctor | public_clinic. '
  'public_clinic = the practice booking link, with no DM conversation. '
  'NULL = pre-column / unknown.';
