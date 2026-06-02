-- ============================================================================
-- 065_recording_access_audit.sql
-- Plan 07 · Task 29 (also adopting Plan 02 Migration B sibling — see note)
-- Date:    2026-04-20
-- ============================================================================
-- Purpose:
--   Land the `recording_access_audit` table. Decision 4 LOCKED patient
--   self-serve replay for 90 days, with mandatory audit + revocation +
--   watermark. This table is the audit storage layer for every
--   `mintReplayUrl()` call (granted AND denied) plus every
--   `getReplayAvailability()` is intentionally NOT audited (preflight
--   for UI; would pollute the trail).
--
--   The Plan 02 master plan listed this table alongside
--   `consultation_recording_audit` (Plan 02 Migration B), but only the
--   pause/resume audit table landed in the executed Plan 02 run (we
--   shipped that ourselves in migration 064). This migration completes
--   the pair so Task 29's service can land in the same PR.
--
-- Schema shape:
--
--   One row per access ATTEMPT, keyed by `session_id`. The service writes
--   exactly one row per `mintReplayUrl()` invocation regardless of
--   outcome — denials (revoked, beyond_self_serve_window, not_a_participant,
--   etc.) are first-class signal, not silent failures. Regulatory
--   doctrine treats "denied access attempt" as as-important as a granted
--   one; a support-ticket search for "denied: revoked" needs to surface
--   every attempt.
--
--   `artifact_kind` is a TEXT with CHECK rather than an ENUM so future
--   plans can add kinds (`video`, `transcript`) without an ALTER TYPE
--   round-trip. Initial v1 set: `audio`.
--
--   `accessed_by_role` mirrors `consultation_recording_audit`:
--     - 'doctor'        — the clinician on the session
--     - 'patient'       — the patient on the session
--     - 'support_staff' — ops escalation (Decision 4 allowance; requires
--                          `metadata.escalation_reason` ≥ 10 chars,
--                          enforced at the service layer not in SQL)
--
--   `metadata` is JSONB for the pinned shape:
--     {
--       "outcome":           "granted" | "denied",
--       "deny_reason":       "<MintReplayErrorCode>",   // present iff outcome='denied'
--       "escalation_reason": "<free text>",             // present iff role='support_staff'
--       "ttl_seconds":       900,                       // present iff outcome='granted'
--       "twilio_status":     "completed",               // composition status at mint time
--       "url_prefix":        "<canonical artifact prefix that was checked>",
--       "policy_id":         "<regulatory_retention_policy.id>",
--       "self_serve_window_ends_at": "ISO timestamp"   // present iff role='patient' and outcome='granted'
--     }
--   The shape is pinned by unit tests in
--   backend/tests/unit/services/recording-access-service.test.ts so
--   silent drift breaks the build.
--
-- Safety:
--   - `CREATE TABLE IF NOT EXISTS` is idempotent.
--   - No RLS policy: service-role only (the access service uses the
--     admin client). Doctor / patient surfacing of "who replayed your
--     recording" is gated by Plan 07 Task 30's notification fan-out, not
--     direct reads from this table.
--   - Indexes tuned for the two hot reads:
--       1. Per-session access history (support / ops triage).
--       2. Per-session denial sweep (support dashboards: "show me all
--          revoked-replay attempts in the last 24h").
--
-- Rollback:
--   Reverse ops documented at the bottom. Do NOT revert once audit rows
--   exist — loses regulatory audit trail. Prefer forward superseding.
-- ============================================================================

CREATE TABLE IF NOT EXISTS recording_access_audit (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Anchors the access attempt to a consultation session. ON DELETE
    -- CASCADE because if the session row is ever pruned (post-archival),
    -- the access trail goes with it — there is no archive worker that
    -- targets this table directly.
    session_id      UUID NOT NULL REFERENCES consultation_sessions(id) ON DELETE CASCADE,

    -- Provider-side artifact reference (Twilio Composition SID for
    -- audio). Free-text so future kinds (transcript file UUID, video
    -- composition SID) slot in without a schema bump. Audit rows for
    -- denials that occurred BEFORE the artifact was even resolved
    -- (e.g. `not_a_participant` denial) carry the empty string — the
    -- column is NOT NULL to keep the audit shape uniform.
    artifact_ref    TEXT NOT NULL DEFAULT '',

    -- v1 set: 'audio'. Plan 08 adds 'video', Task 32 adds 'transcript'.
    -- TEXT + CHECK over ENUM so a new kind doesn't need an ALTER TYPE
    -- round-trip.
    artifact_kind   TEXT NOT NULL CHECK (artifact_kind IN ('audio', 'video', 'transcript', 'chat_export')),

    -- Caller's user id. Free UUID (no FK) because support_staff rows
    -- carry the support user's id which lives in a different table
    -- (and patient ids are nullable on consultation_sessions for guest
    -- bookings). The audit trail must survive any future hard-delete of
    -- the user row.
    accessed_by     UUID NOT NULL,

    -- Role at time of access. CHECK rather than ENUM for the same
    -- evolution-friendly reason as `artifact_kind`.
    accessed_by_role TEXT NOT NULL CHECK (accessed_by_role IN ('doctor', 'patient', 'support_staff')),

    -- Pinned JSONB shape (see header). Stored as JSONB for efficient
    -- containment-query indexing (e.g. `metadata @> '{"outcome":
    -- "denied"}'`).
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,

    correlation_id  TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hot read: per-session access history, newest first. Used by the
-- (future) ops admin "show me everyone who replayed this consult"
-- screen, and by Plan 10 analytics aggregations.
CREATE INDEX IF NOT EXISTS idx_recording_access_audit_session_created_at
    ON recording_access_audit(session_id, created_at DESC);

-- Sweep index for "denials in the last N days" — partial-indexed on
-- `metadata->>'outcome' = 'denied'` so the index stays small (denials
-- are the minority case).
CREATE INDEX IF NOT EXISTS idx_recording_access_audit_denials
    ON recording_access_audit(created_at DESC)
    WHERE (metadata->>'outcome') = 'denied';

-- Correlation-id lookup for "trace this support-ticket request through
-- our logs" — small index, covers the support-debugging hot path.
CREATE INDEX IF NOT EXISTS idx_recording_access_audit_correlation_id
    ON recording_access_audit(correlation_id)
    WHERE correlation_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- RLS: service-role only. Doctor / patient access to "who replayed my
-- recording" is gated at Plan 07 Task 30's notification fan-out, not at
-- the row level here.
-- ----------------------------------------------------------------------------
ALTER TABLE recording_access_audit ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE recording_access_audit IS
    'Plan 07 Task 29 / Plan 02 Migration B sibling. One row per mintReplayUrl() attempt — granted AND denied. Service-role-only writes via recording-access-service.ts. Append-only; never pruned.';
COMMENT ON COLUMN recording_access_audit.session_id IS
    'FK to consultation_sessions(id) ON DELETE CASCADE.';
COMMENT ON COLUMN recording_access_audit.artifact_ref IS
    'Provider artifact id (Twilio Composition SID for audio). Empty string for denials that occurred before artifact resolution.';
COMMENT ON COLUMN recording_access_audit.artifact_kind IS
    'audio | video | transcript | chat_export. CHECK constraint; new kinds add via a follow-up migration.';
COMMENT ON COLUMN recording_access_audit.accessed_by IS
    'Caller user id (doctor uuid, patient uuid, or support-staff uuid). No FK so audit survives any future user hard-delete.';
COMMENT ON COLUMN recording_access_audit.accessed_by_role IS
    'doctor | patient | support_staff. CHECK constraint.';
COMMENT ON COLUMN recording_access_audit.metadata IS
    'Pinned JSONB shape; see migration header. Holds outcome, deny_reason, escalation_reason, ttl_seconds, etc.';
COMMENT ON COLUMN recording_access_audit.correlation_id IS
    'Per-request id propagated from req.correlationId for tracing. NULL for service-internal writes (rare).';

-- ============================================================================
-- Reverse migration (documented; kept in-file so the reverse op is one
-- grep away). Do NOT revert once audit rows exist in production.
--
--   DROP INDEX IF EXISTS idx_recording_access_audit_correlation_id;
--   DROP INDEX IF EXISTS idx_recording_access_audit_denials;
--   DROP INDEX IF EXISTS idx_recording_access_audit_session_created_at;
--   DROP TABLE IF EXISTS recording_access_audit;
-- ============================================================================
