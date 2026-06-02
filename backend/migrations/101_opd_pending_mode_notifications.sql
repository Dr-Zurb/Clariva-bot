-- ============================================================================
-- OPD per-day mode: pending notification batch (pdm-06)
-- ============================================================================
-- Migration: 101_opd_pending_mode_notifications.sql
-- Date: 2026-05-17
-- Description:
--   One upsertable row per (doctor_id, session_date) holding the to-be-dispatched
--   mode-change notification batch. Drained by a 60s cron worker.
--
--   Debounce: row's scheduled_for is set to now() + 5 min on each flip. A flip
--   within 5 min overwrites scheduled_for (debouncing the previous batch).
--   Net-zero flip (slot→queue→slot inside the window with the same final mode
--   as first_flip_mode) deletes the row.
--
--   Hard ceiling: first_flip_at + 30 min — drainer dispatches the latest-state
--   batch regardless of further flips after the ceiling.
--
-- RLS: service-role only. Patients and doctors do not read this table directly.
-- ============================================================================

CREATE TABLE IF NOT EXISTS doctor_opd_pending_mode_notifications (
  doctor_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_date        DATE NOT NULL,
  first_flip_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  latest_flip_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  scheduled_for       TIMESTAMPTZ NOT NULL,
  first_flip_mode     TEXT NOT NULL
    CONSTRAINT doctor_opd_pending_mode_notifications_first_flip_mode_check CHECK (first_flip_mode IN ('slot', 'queue')),
  latest_flip_mode    TEXT NOT NULL
    CONSTRAINT doctor_opd_pending_mode_notifications_latest_flip_mode_check CHECK (latest_flip_mode IN ('slot', 'queue')),
  payload_json        JSONB NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (doctor_id, session_date)
);

CREATE INDEX IF NOT EXISTS idx_doctor_opd_pending_mode_notifications_scheduled
  ON doctor_opd_pending_mode_notifications (scheduled_for);
CREATE INDEX IF NOT EXISTS idx_doctor_opd_pending_mode_notifications_first_flip
  ON doctor_opd_pending_mode_notifications (first_flip_at);

COMMENT ON TABLE doctor_opd_pending_mode_notifications IS
  'Debounced mode-change notification batch (pdm-06). One row per (doctor, session_date). '
  'Drained by cron every 60s. Net-zero flip deletes the row.';
COMMENT ON COLUMN doctor_opd_pending_mode_notifications.first_flip_at IS
  'Timestamp of the first flip in this debounce window. Used for the 30-min ceiling.';
COMMENT ON COLUMN doctor_opd_pending_mode_notifications.first_flip_mode IS
  'Mode the day was in BEFORE the first flip. Net-zero detection: if next flip targets this mode, delete the row.';
COMMENT ON COLUMN doctor_opd_pending_mode_notifications.payload_json IS
  'JSON: { from_mode, to_mode, affected_apt_count, overflow_count, correlation_id }. Recomputed on each flip.';

-- RLS: service-role only. No doctor / patient access.
ALTER TABLE doctor_opd_pending_mode_notifications ENABLE ROW LEVEL SECURITY;
-- No policies created: only the service role bypasses RLS (and the worker uses the admin client).
-- This is intentional: notifications are an internal queue, not user-facing data.

-- updated_at trigger
DROP TRIGGER IF EXISTS doctor_opd_pending_mode_notifications_updated_at ON doctor_opd_pending_mode_notifications;
CREATE TRIGGER doctor_opd_pending_mode_notifications_updated_at
  BEFORE UPDATE ON doctor_opd_pending_mode_notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Migration Complete
-- ============================================================================
