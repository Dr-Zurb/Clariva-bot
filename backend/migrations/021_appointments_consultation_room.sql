-- ============================================================================
-- Add consultation room fields to Appointments (Teleconsultation)
-- ============================================================================
-- Migration: 021_appointments_consultation_room.sql
-- Date: 2026-03-21
-- Description:
--   Add columns for Twilio Video room metadata and consultation verification.
--   Enables storing room SID, join/end times, verified_at for payout eligibility.
--   Backward compatible; all new columns nullable.
-- ============================================================================

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS consultation_room_sid TEXT NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS consultation_started_at TIMESTAMPTZ NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS doctor_joined_at TIMESTAMPTZ NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS patient_joined_at TIMESTAMPTZ NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS consultation_ended_at TIMESTAMPTZ NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS consultation_duration_seconds INTEGER NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS clinical_notes TEXT NULL;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS: No changes needed; existing policies (Users can update own appointments) cover new columns.
-- ============================================================================
