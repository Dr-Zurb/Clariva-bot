-- ============================================================================
-- Post-consult chat-history DM idempotency column (Plan 07 · Task 31)
-- ============================================================================
-- Migration: 067_consultation_sessions_post_consult_dm_sent_at.sql
-- Date:      2026-04-19
-- Description:
--   Adds `post_consult_dm_sent_at` to `consultation_sessions`. Used by
--   `sendPostConsultChatHistoryDm` (notification-service.ts) to short-
--   circuit duplicate fan-outs. The DM fires from
--   `consultation-session-service.ts#endSession`; this column lets a
--   re-fired endSession (idempotent path) skip the DM cleanly.
--
--   Stays NULL until the first chat-history DM fan-out fires; subsequent
--   calls return `{ skipped: true, reason: 'already_sent' }` without
--   re-dispatching to IG-DM / SMS.
--
-- Why a column instead of joining against audit_logs?
--   Low-cardinality, one-write-per-session boolean-style lookup. Joining
--   audit_logs by `metadata->>'session_id'` for every endSession would
--   add a per-call query and defeat the cheap "fired once" semantics.
--   This mirrors `last_ready_notification_at` (migration 050) and the
--   `consent_recorded_at`-style additive column pattern.
--
-- Safety:
--   · Additive, nullable — zero impact on existing reads.
--   · Idempotent — `ADD COLUMN IF NOT EXISTS`.
--   · No index — the read path is keyed on PK (`id`); the column is only
--     consulted inside `sendPostConsultChatHistoryDm` which already has
--     the row by id.
--   · Reverse migration: `ALTER TABLE consultation_sessions DROP COLUMN
--     IF EXISTS post_consult_dm_sent_at;` — no dependencies (no index,
--     no FK, no policy reference).
-- ============================================================================

ALTER TABLE consultation_sessions
  ADD COLUMN IF NOT EXISTS post_consult_dm_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN consultation_sessions.post_consult_dm_sent_at IS
  'Plan 07 Task 31: timestamp of the post-consult chat-history DM fan-out (set by sendPostConsultChatHistoryDm). NULL until the first dispatch. Drives idempotency for the endSession-fired DM.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
