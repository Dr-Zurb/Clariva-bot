-- ============================================================================
-- 201_patients_registered_via.sql
-- ============================================================================
-- Date: 2026-08-22
-- Batch: receptionist-portal (P2)
-- Description:
--   Additive provenance on patients so roster analytics can tell bot intake
--   from front-desk registration after MRN is assigned immediately on manual
--   create (R2 / R10). Operational label — not PHI.
--
--   No backfill. Existing rows stay NULL (unknown pre-desk provenance).
--   New desk creates set registered_via = 'front_desk'.
--
-- Hard-rules:
--   - Additive column on patients. No RLS change. Not a PHI column.
--
-- Rollback (document only):
--   ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_registered_via_check;
--   ALTER TABLE patients DROP COLUMN IF EXISTS registered_via;
-- ============================================================================

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS registered_via TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'patients_registered_via_check'
  ) THEN
    ALTER TABLE patients
      ADD CONSTRAINT patients_registered_via_check
      CHECK (
        registered_via IS NULL
        OR registered_via IN ('bot', 'front_desk', 'booking_for_other', 'import')
      );
  END IF;
END $$;

COMMENT ON COLUMN patients.registered_via IS
  'How the patient row was created (receptionist-portal P2 / R10). Not PHI. '
  'Values: bot | front_desk | booking_for_other | import. NULL = pre-column / unknown.';
