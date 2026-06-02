-- ============================================================================
-- 069_recording_access_audit_access_type.sql
-- Plan 08 · Task 45 (part 1) — access_type discriminator on recording_access_audit
-- Date:    2026-04-19
-- ============================================================================
-- Purpose:
--   Adds `access_type` ENUM + column to `recording_access_audit` (Migration
--   065, Plan 07 · Task 29) so every replay audit row carries whether the
--   caller accessed the audio-only baseline recording OR the full-video
--   escalation artifact.
--
--   Decision 10 LOCKED a split between audio-only replay (the default for
--   every consult) and full-video replay (only after a doctor-initiated
--   escalation — Plan 08 Tasks 40–42). The audit row needs to distinguish
--   the two so ops triage + analytics + regulatory reporting can answer
--   "of our N consult replays, how many included video?" without re-reading
--   the composition SID and cross-joining Twilio metadata.
--
--   Existing Plan 07 rows (audio replays, transcript downloads) back-fill
--   to `'audio_only'` because:
--     - Plan 07 Task 29's `mintReplayUrl` writes `artifact_kind='audio'`
--       and always reads an audio-only composition.
--     - Plan 07 Task 32's transcript download writes
--       `artifact_kind='transcript'`. Transcripts are audio-derived; they
--       never surface the video track to the caller. `'audio_only'` is
--       correct for them.
--   Plan 08 Task 44's video-replay path is the sole writer of
--   `'full_video'` and will set the column explicitly at INSERT time.
--
-- ENUM naming — why `recording_access_type` and not just `access_type`:
--   `access_type` is a bare, generic identifier that a future migration
--   might reclaim for a different concept (e.g. doctor-dashboard access
--   type, admin-panel access type). Prefixing the ENUM with `recording_`
--   namespaces it to the column's concept without forcing the column name
--   itself to grow the prefix (`recording_access_audit.recording_access_type`
--   would read as stuttering). The occasional schema-tooling confusion
--   around the enum/column name mismatch is mitigated by this comment +
--   the column comment below.
--
-- Safety:
--   · ENUM creation uses the idempotent DO-block pattern (same as
--     `consultation_message_kind` in Migration 051).
--   · Column ADD is nullable during the ALTER + then set NOT NULL after
--     back-fill — two-step pattern prevents the ALTER from holding an
--     ACCESS EXCLUSIVE lock while scanning the table. The table is small
--     today (Plan 07 was the first writer, weeks old) so the ACCESS
--     EXCLUSIVE window is irrelevant in practice, but the pattern stays
--     correct as volume grows.
--   · No index added on `access_type` alone — low-cardinality enum on a
--     write-heavy table. The v1 read path ("audit rows for this session,
--     newest first") is already covered by the `(session_id, created_at
--     DESC)` index from Migration 065. A composite index on `(session_id,
--     access_type)` is considered if Task 44 telemetry shows pressure;
--     ship-then for v1.
--
-- Reverse migration (documented; kept in-file so the reverse op is one
-- grep away):
--   ALTER TABLE recording_access_audit DROP COLUMN IF EXISTS access_type;
--   DROP TYPE IF EXISTS recording_access_type;
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'recording_access_type'
  ) THEN
    CREATE TYPE recording_access_type AS ENUM ('audio_only', 'full_video');
  END IF;
END$$;

-- Step 1: add nullable. `IF NOT EXISTS` keeps the migration idempotent
-- across re-runs in dev; in prod this runs exactly once.
ALTER TABLE recording_access_audit
    ADD COLUMN IF NOT EXISTS access_type recording_access_type;

-- Step 2: back-fill existing rows to 'audio_only'. Plan 07 Tasks 29 + 32
-- were the only writers pre-Plan-08; both are audio-derived.
UPDATE recording_access_audit
SET    access_type = 'audio_only'
WHERE  access_type IS NULL;

-- Step 3: lock down NOT NULL + set default. The default is 'audio_only'
-- because the next writer to land after this migration is Plan 08 Task 44
-- (video-replay) which will ALWAYS set the value explicitly; every other
-- writer (Task 29, Task 32) continues to write audio-derived rows and
-- benefits from not having to thread the new column through.
ALTER TABLE recording_access_audit
    ALTER COLUMN access_type SET NOT NULL,
    ALTER COLUMN access_type SET DEFAULT 'audio_only';

COMMENT ON COLUMN recording_access_audit.access_type IS
    'Decision 10 LOCKED. audio_only | full_video. Discriminator between '
    'Plan 07 replay / transcript (audio-derived, default) and Plan 08 '
    'Task 44 video-replay (full_video, explicit). ENUM is '
    '`recording_access_type` — prefix intentional (see migration header).';

-- ============================================================================
-- Reverse migration (manual):
--   ALTER TABLE recording_access_audit DROP COLUMN IF EXISTS access_type;
--   DROP TYPE IF EXISTS recording_access_type;
-- Do NOT revert once Task 44 rows exist — loses the audio/video split in
-- the audit trail. Prefer forward superseding.
-- ============================================================================
