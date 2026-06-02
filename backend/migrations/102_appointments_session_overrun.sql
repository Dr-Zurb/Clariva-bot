-- ============================================================================
-- OPD per-day mode: session overrun flag (pdm-09)
-- ============================================================================
-- Migration: 102_appointments_session_overrun.sql
-- Date: 2026-05-17
-- Description:
--   Adds `session_overrun_at` to appointments for DL-7 / DL-8.
--   Set when the flagging cron determines a pending|confirmed row sat past
--   session_end + 30 min. Cleared on resolve (reschedule, complete, cancel, no_show).
-- ============================================================================

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS session_overrun_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN appointments.session_overrun_at IS
  'Set by runOpdOverrunFlaggingCron when status IN (''pending'', ''confirmed'') and now() > session_end + 30 min. Cleared on resolve.';

CREATE INDEX IF NOT EXISTS idx_appointments_session_overrun_at
  ON appointments (session_overrun_at)
  WHERE session_overrun_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_overrun_candidates
  ON appointments (doctor_id, appointment_date)
  WHERE status IN ('pending', 'confirmed') AND session_overrun_at IS NULL;
