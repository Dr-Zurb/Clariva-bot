-- ============================================================================
-- ROLLBACK: Re-add legacy appointments.consultation_room_* columns
-- ============================================================================
-- Migration: 060_rollback_drop_legacy_appointments_consultation_room.sql
-- Date: 2026-04-19
-- Task: 35 (reverse migration for 059)
-- Description:
--   Reverse migration for 059. Only run this if you need to roll back the
--   column drop — e.g. if a downstream consumer we missed still depends on
--   the legacy columns.
--
--   Re-adds the three dropped columns as NULL and back-fills from
--   `consultation_sessions` so appointments that had a live/ended session
--   during the cutover window (between 059 going live and this rollback
--   running) don't look "empty" to legacy readers.
--
-- Safety:
--   * All three ADD COLUMN statements use `IF NOT EXISTS`.
--   * The back-fill uses the most-recent session per appointment. If
--     multiple sessions exist for one appointment (e.g. after a modality
--     switch) the last-ended-at / last-started-at wins, matching the
--     behavior the legacy columns had before 059.
--   * This rollback is idempotent; running it twice is a no-op.
-- ============================================================================

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS consultation_room_sid TEXT NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS consultation_started_at TIMESTAMPTZ NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS consultation_ended_at TIMESTAMPTZ NULL;

-- Back-fill from consultation_sessions. Pick the latest session per
-- appointment. Only update rows that are still NULL (preserves any value
-- an operator may have manually restored before running this rollback).
WITH latest_session AS (
  SELECT DISTINCT ON (cs.appointment_id)
    cs.appointment_id,
    cs.provider_session_id,
    cs.actual_started_at,
    cs.actual_ended_at
  FROM consultation_sessions cs
  ORDER BY cs.appointment_id, cs.created_at DESC
)
UPDATE appointments a
SET
  consultation_room_sid    = COALESCE(a.consultation_room_sid,    ls.provider_session_id),
  consultation_started_at  = COALESCE(a.consultation_started_at,  ls.actual_started_at),
  consultation_ended_at    = COALESCE(a.consultation_ended_at,    ls.actual_ended_at)
FROM latest_session ls
WHERE a.id = ls.appointment_id
  AND (
       a.consultation_room_sid IS NULL
    OR a.consultation_started_at IS NULL
    OR a.consultation_ended_at IS NULL
  );

-- ============================================================================
-- Rollback Complete
-- ============================================================================
