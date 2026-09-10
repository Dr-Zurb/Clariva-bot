-- ============================================================================
-- 193_appointment_lobby_presence.sql
-- ============================================================================
-- Date: 2026-08-12
-- Batch: consult-room-checkin (crc-01)
-- Description:
--   Adds lobby presence + check-in notification dedupe columns on
--   `appointments` so patients can check into a consult lobby *before*
--   a `consultation_sessions` row exists (video/voice rooms stay lazy).
--   Operational timestamps only — not PHI. No RLS change. Patient auth
--   for heartbeat remains HMAC consultation token.
--
-- Not on hard-rules list:
--   - No RLS shape change.
--   - No PHI columns.
--
-- Rollback (document only):
--   ALTER TABLE appointments DROP COLUMN IF EXISTS patient_checkin_notified_at;
--   ALTER TABLE appointments DROP COLUMN IF EXISTS patient_lobby_last_seen_at;
--   ALTER TABLE appointments DROP COLUMN IF EXISTS patient_checked_in_at;
-- ============================================================================

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS patient_checked_in_at TIMESTAMPTZ NULL;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS patient_lobby_last_seen_at TIMESTAMPTZ NULL;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS patient_checkin_notified_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN appointments.patient_checked_in_at IS
  'First time the patient opened the consult lobby (crc-01). Operational; not PHI.';

COMMENT ON COLUMN appointments.patient_lobby_last_seen_at IS
  'Last lobby heartbeat from the patient page (crc-01). Fresh within ~2 min → patient_waiting tag.';

COMMENT ON COLUMN appointments.patient_checkin_notified_at IS
  'When the pre-visit check-in DM/SMS/email was sent (crc-03 dedupe). Operational; not PHI.';
