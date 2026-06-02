-- ============================================================================
-- 064_consultation_recording_audit.sql
-- Plan 07 · Task 28 (adopting Plan 02 Migration B — see note below)
-- Date:    2026-04-19
-- ============================================================================
-- Purpose:
--   Land the `consultation_recording_audit` table. Decision 4 LOCKED the
--   mid-consult pause/resume flow with (a) mandatory reason, (b)
--   both-parties-visible "Recording paused" indicator, (c) audit row per
--   event. This migration provides the audit storage layer those writes
--   target.
--
--   This table was originally scoped to Plan 02 (Migration B in
--   plan-02-recording-governance-foundation.md). In the executed Plan 02
--   run the three companion tables landed (`signed_url_revocation`,
--   `account_deletion_audit`, `regulatory_retention_policy`,
--   `recording_artifact_index`, `archival_history`) but this one was
--   missed — confirmed via grep of backend/migrations/*.sql through
--   migration 063. Task 28 is the first caller; shipping the missing
--   table here so the pause/resume service can land in the same PR.
--
-- Schema shape:
--
--   One row per recording-lifecycle action, keyed by `session_id`. Ledger
--   pattern: the pause/resume service writes one "attempted" row BEFORE
--   calling Twilio, then a second "completed" / "failed" row after, both
--   tagged with the same `correlation_id`. Plan 02's reconciliation
--   worker (to be scheduled in a future task) resolves orphan
--   `attempted` rows after a 5-minute SLA.
--
--   `action` is an ENUM — every value Plan 02/07/08 will need is seeded
--   up front so later plans only have to INSERT, never ALTER TYPE ADD
--   VALUE (which Postgres refuses to commit in the same transaction as
--   the value's first use — see migration 062/063 split).
--
--   `action_by_role` is a TEXT with CHECK rather than an ENUM:
--     - 'doctor' — the clinician on the session
--     - 'patient' — patient-initiated (Plan 08 Task 42 patient revoke)
--     - 'system' — cron / worker / reconciliation path
--     - 'support_staff' — ops escalation (Decision 4 allowance; no UI
--       surface in v1; SQL / admin API only)
--
--   `metadata` is JSONB for the pinned ledger shape:
--     {
--       "twilio_sid": "RM…",
--       "kind":       "audio" | "video",
--       "status":     "attempted" | "completed" | "failed",
--       "error":      "…"   -- present only on status='failed'
--     }
--   The shape is pinned by a unit test in
--   backend/tests/unit/services/recording-pause-service.test.ts so
--   silent drift breaks the build.
--
-- Safety:
--   - `CREATE TYPE IF NOT EXISTS` is NOT supported in PostgreSQL; we use
--     the DO-block guard (`pg_type` lookup) so re-running the migration
--     is a no-op.
--   - `CREATE TABLE IF NOT EXISTS` is idempotent.
--   - No RLS policy here: this table is service-role-only (the pause
--     service uses the admin client). Read-side from the Realtime tap
--     goes through `consultation_messages` (system rows), not direct
--     reads from this table.
--   - Indexes tuned for the two hot reads:
--       1. Latest action for a session (getCurrentRecordingState).
--       2. Reconciliation-worker sweep for stale `attempted` rows.
--
-- Rollback:
--   Reverse ops documented at the bottom. Do NOT revert once audit rows
--   exist in production — loses regulatory audit trail. Prefer forward
--   superseding migrations.
-- ============================================================================

-- 1. ENUM for the action column (seed every future value up front).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'recording_audit_action'
  ) THEN
    CREATE TYPE recording_audit_action AS ENUM (
      'recording_started',
      'recording_paused',
      'recording_resumed',
      'recording_stopped',
      'patient_declined_pre_session',
      'patient_revoked_video_mid_session'
    );
  END IF;
END
$$;

-- 2. Table.
CREATE TABLE IF NOT EXISTS consultation_recording_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES consultation_sessions(id) ON DELETE CASCADE,
  action          recording_audit_action NOT NULL,
  action_by       UUID NOT NULL,                   -- auth.users.id of the actor
  action_by_role  TEXT NOT NULL CHECK (action_by_role IN ('doctor', 'patient', 'system', 'support_staff')),
  reason          TEXT,                            -- ≥5 chars when action IN ('recording_paused', 'recording_stopped', 'patient_revoked_video_mid_session'); NULL on resume/started/declined
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  correlation_id  TEXT,                            -- matches the request's X-Correlation-Id / assistant-minted id
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Reason length CHECK — only when the action semantically requires one.
--    Not enforced via trigger (overkill); regular CHECK is sufficient.
ALTER TABLE consultation_recording_audit
  DROP CONSTRAINT IF EXISTS consultation_recording_audit_reason_check;

ALTER TABLE consultation_recording_audit
  ADD CONSTRAINT consultation_recording_audit_reason_check CHECK (
    (action IN ('recording_paused', 'recording_stopped', 'patient_revoked_video_mid_session')
      AND reason IS NOT NULL
      AND char_length(btrim(reason)) BETWEEN 5 AND 200)
    OR
    (action NOT IN ('recording_paused', 'recording_stopped', 'patient_revoked_video_mid_session'))
  );

-- 4. Hot-path index for getCurrentRecordingState — "latest action for a session".
CREATE INDEX IF NOT EXISTS idx_recording_audit_session_created_at
  ON consultation_recording_audit(session_id, created_at DESC);

-- 5. Partial index for the reconciliation-worker sweep: rows stuck at
--    `metadata.status = 'attempted'` for > 5 min. Partial keeps the
--    index tiny (most rows are `completed` / `failed`).
CREATE INDEX IF NOT EXISTS idx_recording_audit_attempted
  ON consultation_recording_audit(created_at)
  WHERE (metadata->>'status') = 'attempted';

-- 6. Index on correlation_id for debugging / cross-row ledger joins
--    (attempted + completed rows share the correlation id).
CREATE INDEX IF NOT EXISTS idx_recording_audit_correlation_id
  ON consultation_recording_audit(correlation_id)
  WHERE correlation_id IS NOT NULL;

-- 7. Column / table comments for future operators running psql `\d+`.
COMMENT ON TABLE consultation_recording_audit IS
  'Plan 07 · Task 28 (adopts Plan 02 Mig B) · Audit ledger for recording-lifecycle events (start/pause/resume/stop + patient revokes). Ledger pattern: one "attempted" row BEFORE the Twilio call, one "completed"/"failed" row AFTER, same correlation_id. Service-role-only; public reads go through consultation_messages system rows.';

COMMENT ON COLUMN consultation_recording_audit.action IS
  'Enumerated lifecycle event. All future values seeded up front so Plans 07/08 only INSERT; no ALTER TYPE required (postgres 55P04 trap).';

COMMENT ON COLUMN consultation_recording_audit.action_by IS
  'auth.users.id of the actor. For action_by_role=''system'', use the all-zeros UUID (matches consultation-message-service SYSTEM_SENDER_ID convention).';

COMMENT ON COLUMN consultation_recording_audit.action_by_role IS
  'Classification: doctor | patient | system | support_staff. Used by read-side RBAC + ops dashboards.';

COMMENT ON COLUMN consultation_recording_audit.reason IS
  'Free-text reason (5..200 chars when action requires one). Patient sees the verbatim text via the RecordingPausedIndicator banner — Decision 4 keeps the reason visible to both parties.';

COMMENT ON COLUMN consultation_recording_audit.metadata IS
  'Pinned JSONB shape: { twilio_sid, kind (audio|video), status (attempted|completed|failed), error (when failed) }. Do not mutate shape without bumping the shape-pin test in recording-pause-service.test.ts.';

COMMENT ON COLUMN consultation_recording_audit.correlation_id IS
  'Request correlation id. The attempted + completed/failed rows for the same request share this; Plan 02 reconciliation worker joins on it.';

-- ============================================================================
-- Reverse (documented only; kept in-file so reverse is one grep away).
--
--   DROP INDEX IF EXISTS idx_recording_audit_correlation_id;
--   DROP INDEX IF EXISTS idx_recording_audit_attempted;
--   DROP INDEX IF EXISTS idx_recording_audit_session_created_at;
--   ALTER TABLE consultation_recording_audit
--     DROP CONSTRAINT IF EXISTS consultation_recording_audit_reason_check;
--   DROP TABLE IF EXISTS consultation_recording_audit;
--   DROP TYPE IF EXISTS recording_audit_action;
-- ============================================================================
