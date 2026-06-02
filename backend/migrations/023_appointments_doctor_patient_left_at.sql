-- ============================================================================
-- Appointments doctor_left_at, patient_left_at (Consultation Verification v2)
-- ============================================================================
-- Migration: 023_appointments_doctor_patient_left_at.sql
-- Date: 2026-03-23
-- Description:
--   Add doctor_left_at, patient_left_at for "who left first" payout verification.
--   Populated by Twilio participant-disconnected webhook.
-- ============================================================================

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS doctor_left_at TIMESTAMPTZ NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS patient_left_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN appointments.doctor_left_at IS 'When doctor disconnected from video room; for payout verification (who left first).';
COMMENT ON COLUMN appointments.patient_left_at IS 'When patient disconnected from video room; for payout verification (who left first).';

-- ============================================================================
-- Migration Complete
-- ============================================================================
