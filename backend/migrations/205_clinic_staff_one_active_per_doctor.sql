-- ============================================================================
-- 205_clinic_staff_one_active_per_doctor.sql
-- ============================================================================
-- Date: 2026-08-23
-- Batch: receptionist-portal (doctor-facing invite / one-seat)
-- Description:
--   One ACTIVE receptionist per doctor. Suspended rows are unlimited so a
--   replacement can be added after the current seat is suspended.
--   Absolute — admin and CLI cannot exceed the cap (unique index).
--
--   Replaces the non-unique idx_clinic_staff_doctor_active from 200.
--
-- Hard-rules:
--   - No PHI. Additive index only. No RLS rewrite.
--
-- Rollback (document only):
--   DROP INDEX IF EXISTS idx_clinic_staff_one_active_per_doctor;
--   CREATE INDEX IF NOT EXISTS idx_clinic_staff_doctor_active
--     ON clinic_staff (doctor_id) WHERE status = 'active';
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM clinic_staff
    WHERE status = 'active'
    GROUP BY doctor_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'clinic_staff has more than one active receptionist for a doctor; resolve before applying 205';
  END IF;
END $$;

DROP INDEX IF EXISTS idx_clinic_staff_doctor_active;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_staff_one_active_per_doctor
  ON clinic_staff (doctor_id)
  WHERE status = 'active';

COMMENT ON INDEX idx_clinic_staff_one_active_per_doctor IS
  'receptionist-portal 2026-08-23. At most one active clinic_staff row per doctor.';
