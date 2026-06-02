-- ============================================================================
-- 072_video_escalation_audit_twilio_error_code.sql
-- Plan 08 · Task 41 — capture Twilio's error code on retry-exhausted
--                     escalation flips
-- Date:    2026-04-19
-- ============================================================================
-- Purpose:
--   Add one nullable column to `video_escalation_audit` (Migration 070):
--
--       twilio_error_code TEXT NULL
--
--   Populated by `recording-escalation-service.patientResponseToEscalation`
--   ONLY when the allow-branch's Twilio rule flip fails twice (initial
--   attempt + 500ms-jitter retry). Every other code path leaves the
--   column NULL. The same code is surfaced to the room as a system
--   message (`video_recording_failed_to_start`); the column is for
--   downstream analytics + post-mortem correlation.
--
-- Why additive + nullable:
--   · Pre-existing rows (all Task 41's early traffic, if any made it to
--     production before this migration) should stay well-formed. A
--     NOT NULL would break them.
--   · The column is never read during the request / respond flow — it's
--     a write-only sink from this migration's perspective.
--
-- Why TEXT rather than INT:
--   · Twilio's error codes are numeric (e.g. 53004) but we may need to
--     store HTTP-style fallbacks ('HTTP_500', 'UNKNOWN', 'NO_ROOM_SID'
--     — see `extractTwilioErrorCode` in the service) without a second
--     `_source` discriminator. TEXT lets us store both cleanly.
--
-- Length cap:
--   Hard-capped at 100 chars via CHECK so a runaway Twilio error text
--   can't bloat the row. The service-side `.slice(0, 100)` is the
--   primary guard; this is belt-and-suspenders.
--
-- Safety:
--   · `ADD COLUMN IF NOT EXISTS` — idempotent on re-runs.
--   · No backfill / no default — NULL for every existing row.
--   · RLS policies inherited from Migration 070 cover the new column.
--
-- Reverse migration (documented at foot).
-- ============================================================================

ALTER TABLE video_escalation_audit
    ADD COLUMN IF NOT EXISTS twilio_error_code TEXT;

ALTER TABLE video_escalation_audit
    DROP CONSTRAINT IF EXISTS video_escalation_audit_twilio_error_code_len;
ALTER TABLE video_escalation_audit
    ADD CONSTRAINT video_escalation_audit_twilio_error_code_len
        CHECK (twilio_error_code IS NULL OR char_length(twilio_error_code) <= 100);

COMMENT ON COLUMN video_escalation_audit.twilio_error_code IS
    'Task 41 allow-branch retry-exhausted Twilio error code. NULL when the '
    'rule flip never ran, succeeded, or was not attempted (decline / timeout '
    'paths). CHECK(len <= 100) guards against runaway error text.';

-- ============================================================================
-- Reverse migration (documented; keep the reverse op one grep away):
--   ALTER TABLE video_escalation_audit
--       DROP CONSTRAINT IF EXISTS video_escalation_audit_twilio_error_code_len;
--   ALTER TABLE video_escalation_audit
--       DROP COLUMN IF EXISTS twilio_error_code;
-- Do NOT revert once Task 41 writes exist in production — loses the
-- correlation between the system-message failure surface + the audit
-- row. Prefer forward superseding.
-- ============================================================================
