-- ============================================================================
-- Per-doctor patient identity seam (rcp-25)
-- ============================================================================
-- Migration: 113_patients_doctor_id_per_doctor_identity.sql
-- Date: 2026-05-31
-- Description:
--   Additive schema for per-doctor patient rows. No backfill in this PR.
--   - Nullable patients.doctor_id (FK auth.users) for future per-doctor rows.
--   - Partial unique index on (doctor_id, platform, platform_external_id)
--     WHERE platform IS NOT NULL — excludes book-for-other / manual patients
--     (platform = NULL, see createPatientForBooking in patient-service.ts).
--   - Legacy global idx_patients_platform_external_id retained until rcp-29.
--     (Dropped by migration 115_drop_global_patient_platform_unique.sql.)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. patients.doctor_id (nullable; populated by rcp-29 backfill + rcp-26 new rows)
-- ----------------------------------------------------------------------------
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN patients.doctor_id IS
  'Owning doctor for platform-linked patients (rcp-25). NULL for legacy global rows until rcp-29 backfill.';

CREATE INDEX IF NOT EXISTS idx_patients_doctor_id ON patients(doctor_id);

-- ----------------------------------------------------------------------------
-- 2. Per-doctor platform identity (partial — platform IS NOT NULL only)
--    Book-for-other rows (platform = NULL) are excluded so multiple doctors
--    can each have manual patients with the same phone without collision.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_doctor_platform_external_id
  ON patients (doctor_id, platform, platform_external_id)
  WHERE platform IS NOT NULL;

-- Legacy global index idx_patients_platform_external_id (migration 004) is
-- intentionally NOT dropped here — rcp-29 removes it after backfill.

-- ============================================================================
-- Migration Complete
-- ============================================================================
