-- ============================================================================
-- 070_video_escalation_audit_and_otp_window.sql
-- Plan 08 · Task 45 (part 2) — video escalation audit + OTP skip-window
-- Date:    2026-04-19
-- ============================================================================
-- Purpose:
--   Two independent tables that light up the rest of Plan 08:
--
--     1. `video_escalation_audit` — one row per doctor-initiated video-
--        recording request. Drives rate-limiting (max 2 per consult, 5-min
--        cooldown) in Plan 08 Task 41 and powers future audit queries
--        ("how many consults requested video; of those, how many patients
--        allowed vs declined vs timed-out").
--
--     2. `video_otp_window` — one row per patient who has verified a
--        video-replay SMS OTP in the last 30 days. Drives Plan 08 Task 44's
--        skip-OTP optimization: a prior successful OTP verification within
--        the rolling window means the patient doesn't re-verify on the
--        next replay attempt.
--
-- CHECK vs ENUM doctrine:
--   All narrow unions in this migration use `TEXT + CHECK` (not `CREATE
--   TYPE … AS ENUM`) so future Plans can widen additively with a DROP +
--   RECREATE under the same CHECK name — ENUMs can `ADD VALUE` but can't
--   drop values without table rewrite. Same pattern as
--   `consultation_messages.sender_role` in Migration 051 and
--   `voice_consult_sessions.modality` across the codebase.
--
-- Why `doctor_id` on `video_escalation_audit` is INTENTIONALLY unFK'd:
--   Matches `consultation_messages.sender_id` from Migration 051. The
--   account-deletion worker (Plan 02 Task 33; Migration 054) may scrub the
--   `doctors` row at regulatory retention end, but the escalation audit
--   must persist under the medical-record carve-out. A hard FK would
--   either block the scrub or cascade-wipe the audit; neither is
--   acceptable. The `doctor_id` column carries the UUID value; downstream
--   joins tolerate NULL / dangling refs.
--
-- Why `patient_id` on `video_otp_window` DOES carry an FK + ON DELETE
-- CASCADE:
--   The OTP window is a live operational cache, not an audit trail. If a
--   patient account is hard-deleted, their stale OTP-verification entry
--   should disappear immediately (no cross-patient leak risk — the row
--   key IS the patient — but keeping stale rows forever would bloat the
--   table for no gain). Cascade is the correct semantic here.
--
-- Safety:
--   · Both tables are CREATE TABLE IF NOT EXISTS.
--   · Foreign keys cascade on delete where appropriate
--     (`video_escalation_audit.session_id`,
--     `video_otp_window.patient_id`).
--   · RLS enabled on both; SELECT policies gate participant visibility.
--     INSERT/UPDATE/DELETE policies are intentionally absent — Task 41
--     and Task 44 write via the service-role client which bypasses RLS.
--     Omitting client-write policies keeps the attack surface tight.
--   · Indexes tuned for the two hot reads pinned in Tasks 41 + 44.
--
-- Reverse migration (documented at file foot).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. video_escalation_audit
--    One row per doctor-initiated video-recording request. Append-only
--    from the service; UPDATEd exactly once (by Task 41's consent-response
--    handler) when the patient responds (allow/decline/timeout).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS video_escalation_audit (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Anchors the request to a consultation session. CASCADE on session
    -- delete — escalation history belongs to the session; Plan 02's
    -- retention worker (Migration 055) may hard-delete sessions at
    -- regulatory retention end, and the audit rows go with them.
    session_id          UUID NOT NULL REFERENCES consultation_sessions(id) ON DELETE CASCADE,

    -- Doctor who initiated the request. INTENTIONAL no-FK: see header.
    -- Matches Migration 051's `consultation_messages.sender_id` pattern.
    doctor_id           UUID NOT NULL,

    -- When the doctor clicked "Request video". Server-assigned; DEFAULT
    -- now() means the service can omit it (Task 41 relies on this for
    -- correctness — patient-side clocks don't get a say).
    requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Free-text reason the doctor typed (or the preset label if the
    -- doctor didn't augment). CHECK bounds mirror Plan 07 Task 28's
    -- pause-reason CHECK for consistency. `char_length()` (not
    -- `length()`) because `length()` returns byte-count for some
    -- encodings; `char_length()` is always codepoint count — matters
    -- when the doctor types in a multi-byte script (Devanagari, Tamil,
    -- etc).
    reason              TEXT NOT NULL CHECK (char_length(reason) BETWEEN 5 AND 200),

    -- Preset tag from the modal's radio buttons (Task 40). NULL allowed
    -- for future callers that don't pick a preset (Plan 10+ might add
    -- an admin-initiated or AI-suggested escalation path). v1 Task 40
    -- always picks one of the four values.
    preset_reason_code  TEXT CHECK (preset_reason_code IN (
                          'visible_symptom',
                          'document_procedure',
                          'patient_request',
                          'other'
                        )),

    -- Patient's response to the consent modal (Task 41). NULL until the
    -- patient responds; then one of the three legal values. The row-shape
    -- CHECK below pins "response + timestamp are co-present".
    patient_response    TEXT CHECK (patient_response IN (
                          'allow',
                          'decline',
                          'timeout'
                        )),

    -- When the patient responded. Server-assigned in the Task 41 consent
    -- handler (clock-skew doctrine — see task-41-* doc Note #5).
    responded_at        TIMESTAMPTZ,

    -- Correlation id threading the whole escalation flow: doctor request
    -- → patient consent modal → Twilio Recording Rules flip → recording
    -- started → system message. Matches `consultation_recording_audit`'s
    -- correlation pattern (Migration 064).
    correlation_id      UUID,

    -- Row-shape CHECK: three legal states.
    --   Pending:  patient_response IS NULL AND responded_at IS NULL
    --   Resolved: both non-NULL
    --   Illegal:  partial (response set without timestamp or vice versa)
    CONSTRAINT video_escalation_audit_response_shape CHECK (
      (patient_response IS NULL AND responded_at IS NULL)
      OR (patient_response IS NOT NULL AND responded_at IS NOT NULL)
    )
);

-- Hot read: Task 41's rate-limit check
--   "SELECT ... WHERE session_id = ? ORDER BY requested_at DESC LIMIT 2"
-- Covered by this index without a heap scan.
CREATE INDEX IF NOT EXISTS idx_video_escalation_audit_session_time
    ON video_escalation_audit(session_id, requested_at DESC);

ALTER TABLE video_escalation_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS video_escalation_audit_select_participants
    ON video_escalation_audit;
CREATE POLICY video_escalation_audit_select_participants
    ON video_escalation_audit
    FOR SELECT
    USING (
      session_id IN (
        SELECT id FROM consultation_sessions
        WHERE doctor_id = auth.uid()
           OR (patient_id IS NOT NULL AND patient_id = auth.uid())
      )
    );
-- NO INSERT / UPDATE / DELETE policies: Task 41 writes via the service
-- role (bypasses RLS). Omitting client-write policies tightens the
-- attack surface — a misbehaving client cannot seed fake escalation
-- rows even via a leaked auth token.

COMMENT ON TABLE video_escalation_audit IS
    'Plan 08 Task 45 (part 2). One row per doctor-initiated video-recording request. '
    'Service-role-only writes via Task 41''s escalation service. Drives rate-limiting '
    '(max 2 per consult, 5-min cooldown) + Plan 10+ analytics.';
COMMENT ON COLUMN video_escalation_audit.session_id IS
    'FK to consultation_sessions(id) ON DELETE CASCADE.';
COMMENT ON COLUMN video_escalation_audit.doctor_id IS
    'Doctor UUID. Intentionally no FK to doctors(id) — account-deletion carve-out '
    '(Migration 054). Matches Migration 051 sender_id pattern.';
COMMENT ON COLUMN video_escalation_audit.reason IS
    'Free-text reason. CHECK (char_length BETWEEN 5 AND 200). Mirrors Plan 07 Task 28 '
    'pause-reason length doctrine.';
COMMENT ON COLUMN video_escalation_audit.preset_reason_code IS
    'Modal preset from Task 40. NULL for future non-modal callers. v1 always set.';
COMMENT ON COLUMN video_escalation_audit.patient_response IS
    'allow | decline | timeout. NULL = still pending. Set by Task 41 consent handler '
    'alongside responded_at (row-shape CHECK enforces co-presence).';
COMMENT ON COLUMN video_escalation_audit.responded_at IS
    'Server-assigned timestamp when Task 41 processes the patient response. '
    'Clock-skew doctrine — never trust client clock.';
COMMENT ON COLUMN video_escalation_audit.correlation_id IS
    'Traces doctor-request → patient-consent → Twilio-rule-flip → system-message. '
    'Matches consultation_recording_audit correlation pattern (Migration 064).';

-- ----------------------------------------------------------------------------
-- 2. video_otp_window
--    One row per patient who has verified a video-replay SMS OTP in the
--    last 30 days. UPSERT-driven on successful OTP verify; read on every
--    video-replay attempt.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS video_otp_window (
    -- PRIMARY KEY IS the patient_id — one row per patient. UPSERT is the
    -- natural write pattern ("re-verified today; bump the timestamp").
    patient_id             UUID PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,

    -- Last successful OTP verification timestamp. Task 44 checks this
    -- against `now() - interval '30 days'` to decide whether to skip
    -- re-verification.
    last_otp_verified_at   TIMESTAMPTZ NOT NULL,

    -- How the patient last proved presence. TEXT + CHECK (not ENUM) so
    -- a future PR can widen to `email` / `authenticator` / `biometric`
    -- without an ALTER TYPE round-trip. Single value 'sms' for v1.
    last_otp_verified_via  TEXT NOT NULL CHECK (last_otp_verified_via IN ('sms')),

    -- Correlation id threading the OTP-verify → replay-grant flow.
    correlation_id         UUID
);

-- Powers the nightly eviction query that a Plan 2.x worker could run:
--   "DELETE WHERE last_otp_verified_at < now() - interval '30 days'"
-- v1 doesn't run the worker (table is small; stale rows are harmless —
-- Task 44's own check correctly returns "OTP required" for stale rows).
-- Index ships anyway because it costs near-nothing on a small table and
-- avoids a migration when the eviction job is added.
CREATE INDEX IF NOT EXISTS idx_video_otp_window_verified_at
    ON video_otp_window(last_otp_verified_at);

ALTER TABLE video_otp_window ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS video_otp_window_select_self
    ON video_otp_window;
CREATE POLICY video_otp_window_select_self
    ON video_otp_window
    FOR SELECT
    USING (patient_id = auth.uid());
-- NO INSERT / UPDATE / DELETE policies: Task 44 writes via the service
-- role (bypasses RLS). Eviction worker (future) also runs service-role.

COMMENT ON TABLE video_otp_window IS
    'Plan 08 Task 45 (part 2). 30-day rolling OTP skip-window per patient. '
    'UPSERT-driven from Task 44''s OTP verify handler. Read on every video-replay '
    'attempt to decide whether to re-prompt for OTP.';
COMMENT ON COLUMN video_otp_window.patient_id IS
    'PK. FK to patients(id) ON DELETE CASCADE. Stale rows are harmless (Task 44 '
    'checks against 30-day window) but cascade-deleting on account wipe keeps the '
    'table tidy.';
COMMENT ON COLUMN video_otp_window.last_otp_verified_at IS
    'Timestamp of last successful OTP verify. Task 44 compares against '
    'now() - interval ''30 days''.';
COMMENT ON COLUMN video_otp_window.last_otp_verified_via IS
    'How the patient proved presence. TEXT + CHECK (v1 single value ''sms''). Widens '
    'additively when a future PR adds email / authenticator.';
COMMENT ON COLUMN video_otp_window.correlation_id IS
    'Traces OTP-verify → replay-grant flow.';

-- ============================================================================
-- Reverse migration (documented; kept in-file so the reverse op is one
-- grep away):
--   DROP TABLE IF EXISTS video_otp_window;
--   DROP TABLE IF EXISTS video_escalation_audit;
-- Do NOT revert once Task 41 rows exist in production — loses regulatory
-- audit trail. Prefer forward superseding.
-- ============================================================================
