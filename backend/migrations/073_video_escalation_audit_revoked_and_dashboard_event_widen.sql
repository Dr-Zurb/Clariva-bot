-- ============================================================================
-- 073_video_escalation_audit_revoked_and_dashboard_event_widen.sql
-- Plan 08 · Task 42 — patient revoke mid-call + dashboard-feed event kind
-- Date:    2026-04-19
-- ============================================================================
-- Purpose:
--   Two additive changes, bundled because Task 42 writes to both tables in
--   the same code path (revoke → update audit row → insert dashboard event).
--
--   1. `video_escalation_audit.revoked_at TIMESTAMPTZ NULL`
--      + `video_escalation_audit.revoke_reason TEXT NULL` (CHECK-bounded).
--
--      A non-NULL `revoked_at` records "this allow-row was rolled back mid-
--      call". Task 42's `patientRevokeVideoMidCall` atomically stamps this
--      after the Twilio rule-flip returns to audio_only. The deriveState
--      logic in `recording-escalation-service` treats an `allow` row with
--      `revoked_at IS NOT NULL` as a terminal resolution (same class as
--      `decline` / `timeout`), which:
--        · Keeps `attemptsUsed` honest (the doctor used one attempt even
--          though the recording ultimately rolled back — task-42 doc
--          item "Re-escalation after revoke").
--        · Starts a cooldown window from the original `requested_at` so the
--          doctor can't immediately re-escalate (Decision 10 LOCKED rate-
--          limit doctrine: cooldown is per-request, not per-successful-
--          recording).
--        · Flips Task 40's doctor button OFF the `locked:already_recording_
--          video` state via the Postgres-changes UPDATE event, re-enabling
--          it (subject to cooldown + max-2 budget).
--
--      Why a separate column rather than reusing `patient_response`? The
--      response field pins what the patient's DECISION on the modal was
--      (allow / decline / timeout). A revoke is NOT a "decision on the
--      modal" — the patient already allowed. Treating revoke as a second
--      decision on the same row would overload the semantics AND break the
--      row-shape CHECK (patient_response + responded_at co-presence).
--      Separate columns keep the two concerns orthogonal.
--
--      `revoke_reason` is forward-compat scaffolding. v1 only writes
--      `'patient_revoked'`. Future v1.1+ plans may add:
--        · `'doctor_revert'`      — doctor hit pause during video recording.
--        · `'system_error_fallback'` — Twilio composition failure.
--      The CHECK constraint enumerates the legal values up-front so
--      forward-additions only require a DROP CONSTRAINT + ADD CONSTRAINT.
--
--   2. Widen `doctor_dashboard_events.event_kind` CHECK to include
--      `'patient_revoked_video_mid_session'`.
--
--      Task 30 pinned a single v1 kind (`patient_replayed_recording`). Plan
--      08 was always planned to widen additively (migration 066 comments
--      "Plan 08: patient_replayed_video"). Task 42 is the first Plan-08
--      consumer: when a patient revokes mid-call, the doctor sees a
--      dashboard-event-feed row (subtler than a banner — see task-42 doc
--      "Doctor-side reactive surface").
--
--      Additive CHECK widening pattern mirrors Plan 06 Task 39's
--      `sender_role` CHECK drop+re-add.
--
-- Safety:
--   · Both `ADD COLUMN IF NOT EXISTS` and the DROP CONSTRAINT / ADD
--     CONSTRAINT pair are idempotent on re-runs.
--   · No backfill required — pre-existing `video_escalation_audit` rows
--     have `revoked_at IS NULL` by default; pre-existing
--     `doctor_dashboard_events` rows use only the legacy kind which stays
--     legal under the widened CHECK.
--   · RLS policies on both tables are inherited; neither the added
--     column nor the widened CHECK needs a policy update (patient writes
--     go through service-role Supabase admin per Migration 070 / 066).
--
-- Reverse migration:
--   Removing the `revoke_reason` CHECK value requires the usual ENUM-style
--   rename-and-recreate dance; for a simple CHECK constraint, DROP
--   CONSTRAINT + ADD CONSTRAINT with the narrower IN list works. See
--   file foot.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Part 1 — video_escalation_audit: revoked_at + revoke_reason
-- ----------------------------------------------------------------------------

ALTER TABLE video_escalation_audit
    ADD COLUMN IF NOT EXISTS revoked_at    TIMESTAMPTZ;

ALTER TABLE video_escalation_audit
    ADD COLUMN IF NOT EXISTS revoke_reason TEXT;

-- CHECK: revoke_reason must be one of the enumerated values OR NULL. Drop
-- and re-add idempotently so re-runs of the migration tolerate an earlier
-- partial state.
ALTER TABLE video_escalation_audit
    DROP CONSTRAINT IF EXISTS video_escalation_audit_revoke_reason_check;
ALTER TABLE video_escalation_audit
    ADD CONSTRAINT video_escalation_audit_revoke_reason_check CHECK (
      revoke_reason IS NULL
      OR revoke_reason IN (
        'patient_revoked',
        'doctor_revert',
        'system_error_fallback'
      )
    );

-- CHECK: co-presence — if revoked_at is set, revoke_reason must be set
-- too (and vice versa). Prevents half-filled rows from any future caller.
ALTER TABLE video_escalation_audit
    DROP CONSTRAINT IF EXISTS video_escalation_audit_revoke_shape;
ALTER TABLE video_escalation_audit
    ADD CONSTRAINT video_escalation_audit_revoke_shape CHECK (
      (revoked_at IS NULL AND revoke_reason IS NULL)
      OR (revoked_at IS NOT NULL AND revoke_reason IS NOT NULL)
    );

-- CHECK: revoke only makes sense after an `allow`. Prevents a
-- mis-targeted UPDATE from stamping a revoke onto a pending or declined
-- row. `patient_response` is the existing column; this links the two
-- state machines.
ALTER TABLE video_escalation_audit
    DROP CONSTRAINT IF EXISTS video_escalation_audit_revoke_requires_allow;
ALTER TABLE video_escalation_audit
    ADD CONSTRAINT video_escalation_audit_revoke_requires_allow CHECK (
      revoked_at IS NULL OR patient_response = 'allow'
    );

COMMENT ON COLUMN video_escalation_audit.revoked_at IS
    'Plan 08 Task 42. Timestamp when an accepted (allow) video recording was '
    'subsequently rolled back mid-call (patient revoke in v1; future: doctor '
    'pause, system fallback). NULL for pending, declined, timed-out, or '
    'still-active-recording rows. Co-presence CHECK pins with revoke_reason.';

COMMENT ON COLUMN video_escalation_audit.revoke_reason IS
    'Plan 08 Task 42. Discriminator for who/why the revoke fired. v1 writes '
    'only ''patient_revoked''. CHECK allows doctor_revert + '
    'system_error_fallback for forward-compat (v1.1+). Co-presence CHECK '
    'pins with revoked_at.';

-- ----------------------------------------------------------------------------
-- Part 2 — doctor_dashboard_events.event_kind widening
-- ----------------------------------------------------------------------------

ALTER TABLE doctor_dashboard_events
    DROP CONSTRAINT IF EXISTS doctor_dashboard_events_event_kind_check;
ALTER TABLE doctor_dashboard_events
    ADD CONSTRAINT doctor_dashboard_events_event_kind_check CHECK (
      event_kind IN (
        'patient_replayed_recording',
        'patient_revoked_video_mid_session'
      )
    );

COMMENT ON COLUMN doctor_dashboard_events.event_kind IS
    'Plan 07 Task 30 + Plan 08 Task 42. Legal values: '
    'patient_replayed_recording (v1), patient_revoked_video_mid_session '
    '(Task 42). Future Plans 08.x/09 widen additively via DROP/ADD CONSTRAINT.';

-- ============================================================================
-- Reverse migration (documented; kept in-file so the reverse op is one
-- grep away). Do NOT revert once Task 42 rows exist in production — the
-- doctor's feed + the escalation-state derivation would regress.
--
--   ALTER TABLE video_escalation_audit
--       DROP CONSTRAINT IF EXISTS video_escalation_audit_revoke_requires_allow;
--   ALTER TABLE video_escalation_audit
--       DROP CONSTRAINT IF EXISTS video_escalation_audit_revoke_shape;
--   ALTER TABLE video_escalation_audit
--       DROP CONSTRAINT IF EXISTS video_escalation_audit_revoke_reason_check;
--   ALTER TABLE video_escalation_audit
--       DROP COLUMN IF EXISTS revoke_reason;
--   ALTER TABLE video_escalation_audit
--       DROP COLUMN IF EXISTS revoked_at;
--
--   ALTER TABLE doctor_dashboard_events
--       DROP CONSTRAINT IF EXISTS doctor_dashboard_events_event_kind_check;
--   ALTER TABLE doctor_dashboard_events
--       ADD CONSTRAINT doctor_dashboard_events_event_kind_check CHECK (
--         event_kind IN ('patient_replayed_recording')
--       );
-- ============================================================================
