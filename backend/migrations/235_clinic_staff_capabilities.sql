-- ============================================================================
-- 235_clinic_staff_capabilities.sql
-- Date: 2026-09-12
-- ============================================================================
-- Purpose:
--   Relax the one-active-staff-per-doctor cap (205) so a receptionist and a
--   clinical assistant can both be active. Capabilities decide what each
--   login may do on the existing /desk portal. No second portal.
--
--   Existing rows default to all three capabilities — byte-identical to today.
--
--   Seat rule: at most one active front_desk seat and one active previsit
--   seat per doctor. A combined-role person occupies both.
--
--   Provenance: history sidecar source may be 'assistant' (DVP-DL-6).
--
-- Hard-rules:
--   - Additive column + CHECK widen. No RLS rewrite (R6).
--   - clinic_staff is NOT PHI. patient_history_submissions.source is PHI.
--
-- Rollback (document only):
--   Re-add idx_clinic_staff_one_active_per_doctor after collapsing to one
--   active row per doctor. Drop capabilities. Restore source CHECK.
-- ============================================================================

ALTER TABLE clinic_staff
  DROP CONSTRAINT IF EXISTS clinic_staff_role_check;

ALTER TABLE clinic_staff
  ADD CONSTRAINT clinic_staff_role_check
  CHECK (role IN ('receptionist', 'assistant'));

ALTER TABLE clinic_staff
  ADD COLUMN IF NOT EXISTS capabilities TEXT[] NOT NULL
    DEFAULT ARRAY['front_desk', 'billing', 'previsit']::TEXT[];

ALTER TABLE clinic_staff
  DROP CONSTRAINT IF EXISTS clinic_staff_capabilities_check;

ALTER TABLE clinic_staff
  ADD CONSTRAINT clinic_staff_capabilities_check
  CHECK (
    capabilities <@ ARRAY['front_desk', 'billing', 'previsit']::TEXT[]
    AND CARDINALITY(capabilities) >= 1
  );

COMMENT ON COLUMN clinic_staff.capabilities IS
  'Staff desk capabilities: front_desk | billing | previsit. Row is authoritative (RQ2).';

DROP INDEX IF EXISTS idx_clinic_staff_one_active_per_doctor;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_staff_one_active_front_desk
  ON clinic_staff (doctor_id)
  WHERE status = 'active' AND 'front_desk' = ANY (capabilities);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_staff_one_active_previsit
  ON clinic_staff (doctor_id)
  WHERE status = 'active' AND 'previsit' = ANY (capabilities);

COMMENT ON INDEX idx_clinic_staff_one_active_front_desk IS
  'At most one active front_desk seat per doctor.';
COMMENT ON INDEX idx_clinic_staff_one_active_previsit IS
  'At most one active previsit seat per doctor.';

ALTER TABLE patient_history_submissions
  DROP CONSTRAINT IF EXISTS patient_history_submissions_source_check;

ALTER TABLE patient_history_submissions
  ADD CONSTRAINT patient_history_submissions_source_check
  CHECK (source IN ('front_desk', 'patient', 'assistant'));

COMMENT ON COLUMN patient_history_submissions.source IS
  'front_desk | patient | assistant. Who typed the answers (DVP-DL-6).';
