-- ============================================================================
-- 194_appointment_previsit_notify_stamps.sql
-- ============================================================================
-- Date: 2026-08-12
-- Batch: consult-room-checkin (previsit reminders)
-- Description:
--   Dedupe stamps for T−24h soft reminder (no join link) and T−15 / T−5
--   check-in nudges (with join link; skip when patient already waiting).
--   Operational timestamps only — not PHI. No RLS change.
--
-- Not on hard-rules list:
--   - No RLS shape change.
--   - No PHI columns.
--
-- Rollback (document only):
--   ALTER TABLE appointments DROP COLUMN IF EXISTS patient_checkin_nudge_5_notified_at;
--   ALTER TABLE appointments DROP COLUMN IF EXISTS patient_checkin_nudge_15_notified_at;
--   ALTER TABLE appointments DROP COLUMN IF EXISTS patient_reminder_24h_notified_at;
-- ============================================================================

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS patient_reminder_24h_notified_at TIMESTAMPTZ NULL;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS patient_checkin_nudge_15_notified_at TIMESTAMPTZ NULL;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS patient_checkin_nudge_5_notified_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN appointments.patient_reminder_24h_notified_at IS
  'When the T−24h soft reminder (no join link) was sent. Operational; not PHI.';

COMMENT ON COLUMN appointments.patient_checkin_nudge_15_notified_at IS
  'When the T−15 check-in nudge (with join link) was sent. Operational; not PHI.';

COMMENT ON COLUMN appointments.patient_checkin_nudge_5_notified_at IS
  'When the T−5 check-in nudge (with join link) was sent. Operational; not PHI.';
