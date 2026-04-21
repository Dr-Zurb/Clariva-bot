-- ============================================================================
-- 074_video_replay_otp_attempts_and_dashboard_event_widen.sql
-- Plan 08 · Task 44 — SMS OTP storage for video-replay 30-day skip window +
-- additive widen of doctor_dashboard_events.event_kind for 'patient_replayed_video'.
-- Date:    2026-04-19
-- ============================================================================
-- Purpose:
--   Two additive changes bundled into one migration because they land with
--   the same PR (Task 44):
--
--   1. `video_replay_otp_attempts` — per-send row capturing the hashed
--      6-digit OTP that the patient must enter to start the first video
--      replay of a 30-day rolling window. Powers `video-replay-otp-service`
--      (send / verify / rate-limit). Companion to the `video_otp_window`
--      table from Migration 070 (Task 45): the *window* table records
--      "patient X proved presence at time Y (skip OTP until Y + 30 days)";
--      the *attempts* table records each individual OTP issuance so we can
--      rate-limit sends + lock a code after 5 wrong tries.
--
--   2. Widen `doctor_dashboard_events.event_kind` CHECK from Migration 066
--      (Task 30) + Migration 073 (Task 42) to additionally permit
--      `'patient_replayed_video'`. Task 30's `notifyDoctorOfPatientReplay`
--      grows an `artifactType: 'video'` branch that writes this new kind so
--      the doctor's dashboard distinguishes audio from video replays.
--
-- OTP body storage — WHY HASHED:
--   A DB snapshot leak must not enable anyone to replay OTPs — even
--   5-min-TTL codes are credentials. Codes are stored as
--   SHA-256(salt || code) with a per-row 16-byte salt. On verify we
--   hash the submitted code with the row's salt + compare.
--
--   Per-row salt (not per-app env): easier rotation, and a compromised
--   row's hash is worthless against other rows. Salt is TEXT (hex)
--   because bytea handling in supabase-js is brittle and the on-disk
--   savings are negligible at our volumes.
--
-- Rate limits (enforced in app code; no partial index for now):
--   · sendVideoReplayOtp: max 3 sends per patient per hour — prevents
--     SMS bomb. Enforced via "count(*) WHERE patient_id=? AND
--     created_at > now() - interval '1 hour'" against the
--     (patient_id, created_at DESC) index.
--   · verifyVideoReplayOtp: max 5 wrong attempts per row — enforced via
--     `attempt_count` CHECK (0..5) + app-level lockout at 5.
--
-- Correlation:
--   `correlation_id` threads send → verify → replay-grant through the
--   same audit lens as `video_otp_window.correlation_id` (Migration 070)
--   and `video_escalation_audit.correlation_id` (also Migration 070).
--
-- Safety:
--   · `IF NOT EXISTS` on table + index so the migration is idempotent
--     across dev re-runs.
--   · RLS enabled with NO policies — writes/reads are service-role-only.
--     Unlike `video_otp_window` which has a self-SELECT policy (patients
--     read their own window state), the *attempts* table is internal
--     plumbing: the client never needs to list a patient's OTP history.
--
-- Reverse migration (documented; kept in-file so the reverse op is one
-- grep away). Do NOT revert once Task 44 rows exist in production — the
-- OTP history + doctor dashboard video events would regress.
--
--   DROP INDEX IF EXISTS idx_video_replay_otp_patient_time;
--   DROP TABLE IF EXISTS video_replay_otp_attempts;
--
--   ALTER TABLE doctor_dashboard_events
--       DROP CONSTRAINT IF EXISTS doctor_dashboard_events_event_kind_check;
--   ALTER TABLE doctor_dashboard_events
--       ADD CONSTRAINT doctor_dashboard_events_event_kind_check CHECK (
--         event_kind IN (
--           'patient_replayed_recording',
--           'patient_revoked_video_mid_session'
--         )
--       );
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Part 1 — video_replay_otp_attempts
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS video_replay_otp_attempts (
    -- Surrogate key — the app uses this as the `otpId` returned to the
    -- client so verify can look up the row without exposing the
    -- hashed code or the patient_id.
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Patient this OTP was sent to. Cascade on patient delete so
    -- account-deletion cleanup doesn't leave orphan attempt rows.
    patient_id       UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

    -- SHA-256(salt || code) as lowercase hex. See header rationale.
    code_hash        TEXT NOT NULL,

    -- Per-row salt as lowercase hex (16 bytes → 32 hex chars).
    salt             TEXT NOT NULL,

    -- 5-min from issue. Task 44 treats any verify after this instant
    -- as `reason: 'expired'` without incrementing attempt_count
    -- (the row is already effectively locked).
    expires_at       TIMESTAMPTZ NOT NULL,

    -- Wrong-guess counter. `5` is the app-level lockout threshold;
    -- CHECK caps at 5 so a corrupted update can't wedge the row into
    -- a state the service can't reason about.
    attempt_count    INT NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),

    -- NULL until verified. Set once on successful verify. A verified
    -- row is single-use — the service rejects a second verify against
    -- the same id with `reason: 'already_consumed'` (mapped to
    -- `'wrong_code'` on the wire to avoid leaking which id is valid).
    consumed_at      TIMESTAMPTZ,

    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Threads send → verify → replay-grant through the same audit
    -- lens as video_otp_window + video_escalation_audit.
    correlation_id   UUID
);

-- Powers the rate-limit query:
--   "SELECT count(*) FROM video_replay_otp_attempts
--    WHERE patient_id = ? AND created_at > now() - interval '1 hour'"
-- DESC order is the common-read direction; matches the convention in
-- idx_recording_access_audit_session_created_at (Migration 065).
CREATE INDEX IF NOT EXISTS idx_video_replay_otp_patient_time
    ON video_replay_otp_attempts(patient_id, created_at DESC);

ALTER TABLE video_replay_otp_attempts ENABLE ROW LEVEL SECURITY;
-- NO policies: all writes and reads are service-role-only. The patient
-- UI never needs to enumerate their own OTP history — only "is OTP
-- required right now?" (served from `video_otp_window`).

COMMENT ON TABLE video_replay_otp_attempts IS
    'Plan 08 Task 44. Per-send row for video-replay SMS OTP: hashed 6-digit '
    'code, per-row salt, expiry, wrong-attempt counter, single-use consumed_at. '
    'Service-role-only (RLS ON, no policies). Companion to video_otp_window '
    '(Migration 070) which tracks the 30-day skip window.';
COMMENT ON COLUMN video_replay_otp_attempts.code_hash IS
    'lowercase hex of sha256(salt || plaintext_code). Storing a hash keeps a DB '
    'snapshot leak from enabling OTP replay even for the 5-min TTL.';
COMMENT ON COLUMN video_replay_otp_attempts.salt IS
    'Per-row 16-byte salt (lowercase hex). Per-row (not per-app) so rotation '
    'is a forward-write not a mass rehash.';
COMMENT ON COLUMN video_replay_otp_attempts.expires_at IS
    '5 min from issue. Verify past this returns reason=expired without '
    'incrementing attempt_count.';
COMMENT ON COLUMN video_replay_otp_attempts.attempt_count IS
    'Wrong-guess counter. App-level lockout at 5; CHECK caps at 5 defensively.';
COMMENT ON COLUMN video_replay_otp_attempts.consumed_at IS
    'NULL until verified. Single-use — a second verify against a consumed '
    'row is rejected.';
COMMENT ON COLUMN video_replay_otp_attempts.correlation_id IS
    'Threads send → verify → replay-grant. Matches video_otp_window.correlation_id '
    'and video_escalation_audit.correlation_id so an ops search surfaces the full '
    'OTP → replay flow for a single patient action.';

-- ----------------------------------------------------------------------------
-- Part 2 — doctor_dashboard_events.event_kind widening
--
-- Migration 066 introduced `patient_replayed_recording`.
-- Migration 073 widened to add `patient_revoked_video_mid_session` (Task 42).
-- This widening adds `patient_replayed_video` (Task 44).
--
-- Additive-only: DROP + ADD the CHECK with the full enumerated list so
-- future migrations see the current list in one place.
-- ----------------------------------------------------------------------------

ALTER TABLE doctor_dashboard_events
    DROP CONSTRAINT IF EXISTS doctor_dashboard_events_event_kind_check;
ALTER TABLE doctor_dashboard_events
    ADD CONSTRAINT doctor_dashboard_events_event_kind_check CHECK (
      event_kind IN (
        'patient_replayed_recording',
        'patient_revoked_video_mid_session',
        'patient_replayed_video'
      )
    );

COMMENT ON COLUMN doctor_dashboard_events.event_kind IS
    'Plan 07 Task 30 + Plan 08 Tasks 42 + 44. Legal values: '
    'patient_replayed_recording (Task 30, audio baseline), '
    'patient_revoked_video_mid_session (Task 42), '
    'patient_replayed_video (Task 44). Future Plans widen additively via '
    'DROP/ADD CONSTRAINT.';

-- ============================================================================
-- End of migration.
-- ============================================================================
