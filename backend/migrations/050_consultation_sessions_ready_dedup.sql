-- ============================================================================
-- Consultation-ready notification dedup column (Plan 01 · Task 16)
-- ============================================================================
-- Migration: 050_consultation_sessions_ready_dedup.sql
-- Date:      2026-04-19
-- Description:
--   Adds `last_ready_notification_at` to `consultation_sessions`. Used by
--   `sendConsultationReadyToPatient` (notification-service.ts) to short-
--   circuit duplicate fan-outs fired within
--   `env.CONSULTATION_READY_NOTIFY_DEDUP_SECONDS` (default 60s).
--
--   Stays NULL until the first ready-fan-out fires; subsequent fan-outs
--   compare `now() - last_ready_notification_at` to the dedup window.
--
-- Safety:
--   · Additive, nullable — zero impact on existing reads.
--   · Idempotent — `ADD COLUMN IF NOT EXISTS`.
--   · Reverse migration: `ALTER TABLE consultation_sessions
--     DROP COLUMN IF EXISTS last_ready_notification_at;` — the column has no
--     dependencies (no index, no FK, no policy reference).
-- ============================================================================

ALTER TABLE consultation_sessions
  ADD COLUMN IF NOT EXISTS last_ready_notification_at TIMESTAMPTZ;

-- ============================================================================
-- Migration Complete
-- ============================================================================
