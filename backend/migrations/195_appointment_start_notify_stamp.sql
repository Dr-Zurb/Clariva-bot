-- ============================================================================
-- 195_appointment_start_notify_stamp.sql
-- ============================================================================
-- Date: 2026-08-12
-- Batch: consult-room-checkin (previsit reminders)
-- Description:
--   Dedupe stamp for T=0 "consult starting now" notify (join link).
--   Operational timestamp only — not PHI. No RLS change.
--
-- Not on hard-rules list:
--   - No RLS shape change.
--   - No PHI columns.
--
-- Rollback (document only):
--   ALTER TABLE appointments DROP COLUMN IF EXISTS patient_start_notified_at;
-- ============================================================================

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS patient_start_notified_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN appointments.patient_start_notified_at IS
  'When the T=0 starting-now reminder (with join link) was sent. Operational; not PHI.';
