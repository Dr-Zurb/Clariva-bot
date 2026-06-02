-- ============================================================================
-- SFU-04: Idempotent care-episode processing for completed appointments
-- ============================================================================
-- Migration: 037_appointment_care_episode_completion.sql
-- Date: 2026-03-29
-- Description:
--   When an appointment moves to completed, episode open/increment runs once.
--   NULL = not yet processed; set to first-success timestamp for idempotency.
-- ============================================================================

ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS care_episode_completion_processed_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN appointments.care_episode_completion_processed_at IS
  'SFU-04: set when care_episode create/increment succeeded for this completed visit; prevents double increment on retry.';

CREATE INDEX IF NOT EXISTS idx_appointments_care_episode_completion_processed
    ON appointments(care_episode_completion_processed_at)
    WHERE care_episode_completion_processed_at IS NOT NULL;

-- ============================================================================
-- Migration Complete
-- ============================================================================
