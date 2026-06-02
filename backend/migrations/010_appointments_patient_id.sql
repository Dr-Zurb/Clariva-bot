-- ============================================================================
-- Appointments patient_id Column (e-task-5)
-- ============================================================================
-- Migration: 010_appointments_patient_id.sql
-- Date: 2026-02-01
-- Description:
--   Add patient_id to appointments so payment confirmation DM can resolve
--   patient -> platform_external_id (Instagram PSID). Worker sets patient_id at
--   booking; payment webhook uses it to send DM. Nullable for existing rows.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Add patient_id column (nullable FK to patients)
-- ----------------------------------------------------------------------------
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS patient_id UUID NULL REFERENCES patients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments(patient_id);

-- ----------------------------------------------------------------------------
-- 2. RLS unchanged: doctors own appointments; service role bypasses RLS
--    (worker reads appointment with patient_id for notifications)
-- ----------------------------------------------------------------------------

-- ============================================================================
-- Migration Complete
-- ============================================================================
