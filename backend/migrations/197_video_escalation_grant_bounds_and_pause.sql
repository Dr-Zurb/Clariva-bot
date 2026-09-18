-- ============================================================================
-- 197_video_escalation_grant_bounds_and_pause.sql
-- recording-governance-v2 · p4-video-escalation-control · rec-21
-- Date:    2026-08-20
-- ============================================================================
-- Purpose:
--   Additive schema on `video_escalation_audit` so a video grant can
--   have a bounded lifetime (REC-D8), a patient pause that is not a
--   revoke (REC-D7 / REC4-D6), and an initiator so later attempt
--   counting can exclude patient offers (REC-D12 / REC4-D8).
--
--   Live head at write time was
--   `196_recording_pause_reason_codes_and_auto_resume_stamps.sql`.
--   Charter budgeted 198 for this file. rec-21 re-derived the next
--   sequential number: 197. Do not assume the budget.
--
-- 1. Grant expiry (REC-D8)
--   `grant_expires_at TIMESTAMPTZ` — when an allowed grant auto-reverts
--   to audio-only. Written when the allow lands (rec-22). NULL on
--   pending / decline / timeout rows and on every legacy row. No
--   backfill.
--
-- 2. Extension stamp (REC-D8)
--   `grant_extended_at TIMESTAMPTZ` — stamped when the doctor spends
--   the single allowed extension. Presence IS the "already extended"
--   flag. No boolean, no counter.
--
-- 3. Patient video pause (REC-D7 / REC4-D6)
--   `video_paused_at TIMESTAMPTZ` — non-NULL means the grant is
--   currently paused by the patient. Cleared on resume. Current state
--   only; no pause-counter column (history lives on
--   `consultation_recording_audit`). Pause does NOT set `revoked_at`
--   and does NOT use any `revoke_reason` value.
--
-- 4. Initiator (REC-D12 / REC4-D8)
--   `initiated_by TEXT NOT NULL DEFAULT 'doctor'` + CHECK
--   (`doctor` | `patient`). TEXT + CHECK, not CREATE TYPE (070 L21–27).
--   NOT NULL with a doctor default so existing rows are unambiguous
--   (every pre-rec-25 request is doctor-initiated). rec-25 writes
--   `patient` on offers.
--
-- 5. Widen revoke_reason (same file — REC4-D1)
--   `grant_expired` is the honest discriminator for auto-revert at
--   grant expiry. `system_error_fallback` would be a lie (nothing
--   failed); `doctor_revert` would be a lie (nobody clicked).
--   DROP/ADD `video_escalation_audit_revoke_reason_check` only.
--   `video_escalation_audit_revoke_shape` and
--   `video_escalation_audit_revoke_requires_allow` are not dropped
--   and not rewritten.
--
-- Safety:
--   · ADD COLUMN IF NOT EXISTS; DROP CONSTRAINT IF EXISTS before ADD.
--   · No backfill on the three nullable stamps.
--   · No RLS policy added, dropped or altered. Service-role writes
--     only, as Migration 070 left it. The new columns inherit the
--     existing participant SELECT policy.
--   · The `reason` column's NOT NULL and 5..200 CHECK are untouched
--     (REC4-D9).
--
-- Reverse migration documented at file foot. Do NOT revert once
-- rec-22/24/25 write these columns in production — prefer forward
-- superseding.
-- ============================================================================

ALTER TABLE video_escalation_audit
    ADD COLUMN IF NOT EXISTS grant_expires_at TIMESTAMPTZ;

ALTER TABLE video_escalation_audit
    ADD COLUMN IF NOT EXISTS grant_extended_at TIMESTAMPTZ;

ALTER TABLE video_escalation_audit
    ADD COLUMN IF NOT EXISTS video_paused_at TIMESTAMPTZ;

ALTER TABLE video_escalation_audit
    ADD COLUMN IF NOT EXISTS initiated_by TEXT NOT NULL DEFAULT 'doctor';

ALTER TABLE video_escalation_audit
    DROP CONSTRAINT IF EXISTS video_escalation_audit_initiated_by_check;
ALTER TABLE video_escalation_audit
    ADD CONSTRAINT video_escalation_audit_initiated_by_check CHECK (
      initiated_by IN ('doctor', 'patient')
    );

-- Widen revoke_reason only. Do not recreate the shape or
-- revoke-requires-allow CHECKs (073 L101–120).
ALTER TABLE video_escalation_audit
    DROP CONSTRAINT IF EXISTS video_escalation_audit_revoke_reason_check;
ALTER TABLE video_escalation_audit
    ADD CONSTRAINT video_escalation_audit_revoke_reason_check CHECK (
      revoke_reason IS NULL
      OR revoke_reason IN (
        'patient_revoked',
        'doctor_revert',
        'system_error_fallback',
        'grant_expired'
      )
    );

COMMENT ON COLUMN video_escalation_audit.grant_expires_at IS
    'rec-21 / REC-D8. When an allowed grant auto-reverts to audio-only. '
    'Written by rec-22 when the allow lands. NULL on pending / decline / '
    'timeout rows and on all legacy rows. Countdowns anchor to this '
    'timestamp, never Date.now() + N.';

COMMENT ON COLUMN video_escalation_audit.grant_extended_at IS
    'rec-21 / REC-D8. Stamped when the doctor spends the single allowed '
    'extension. Presence is the already-extended flag — no boolean, no '
    'counter. NULL means the extension has not been used (or the row is '
    'not an active grant).';

COMMENT ON COLUMN video_escalation_audit.video_paused_at IS
    'rec-21 / REC-D7. Non-NULL means the grant is currently paused by the '
    'patient. Cleared on resume. Current state only — not a history. '
    'Pause is not revoke (REC4-D6): this column never sets revoked_at and '
    'never uses a revoke_reason value.';

COMMENT ON COLUMN video_escalation_audit.initiated_by IS
    'rec-21 / REC-D12. Who started the request: doctor (default, including '
    'every legacy row) or patient (rec-25 offers). TEXT + CHECK, not ENUM. '
    'NOT NULL so attemptsUsed can exclude patient offers without treating '
    'NULL as unknown.';

COMMENT ON COLUMN video_escalation_audit.revoke_reason IS
    'Plan 08 Task 42 + rec-21. Discriminator for who/why a grant ended. '
    'v1 wrote patient_revoked. CHECK now also allows doctor_revert, '
    'system_error_fallback, and grant_expired (auto-revert at expiry — '
    'not a failure, not a click). Co-presence CHECK with revoked_at is '
    'unchanged. Pause does not write this column.';

-- ============================================================================
-- Reverse migration (documented; keep the reverse op one grep away).
-- Do NOT revert once rec-22/24/25 rows exist in production.
--
--   ALTER TABLE video_escalation_audit
--       DROP CONSTRAINT IF EXISTS video_escalation_audit_revoke_reason_check;
--   ALTER TABLE video_escalation_audit
--       ADD CONSTRAINT video_escalation_audit_revoke_reason_check CHECK (
--         revoke_reason IS NULL
--         OR revoke_reason IN (
--           'patient_revoked',
--           'doctor_revert',
--           'system_error_fallback'
--         )
--       );
--   ALTER TABLE video_escalation_audit
--       DROP CONSTRAINT IF EXISTS video_escalation_audit_initiated_by_check;
--   ALTER TABLE video_escalation_audit
--       DROP COLUMN IF EXISTS initiated_by;
--   ALTER TABLE video_escalation_audit
--       DROP COLUMN IF EXISTS video_paused_at;
--   ALTER TABLE video_escalation_audit
--       DROP COLUMN IF EXISTS grant_extended_at;
--   ALTER TABLE video_escalation_audit
--       DROP COLUMN IF EXISTS grant_expires_at;
-- ============================================================================
