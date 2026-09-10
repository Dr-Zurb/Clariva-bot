-- ============================================================================
-- 196_recording_pause_reason_codes_and_auto_resume_stamps.sql
-- recording-governance-v2 · p3-pause-integrity · rec-13
-- Date:    2026-08-18
-- ============================================================================
-- Purpose:
--   Additive schema on `consultation_recording_audit` so pause can stop
--   collecting clinical free text (REC-D14), own an auto-resume deadline
--   across pod restarts (REC-D16), and attribute a patient-initiated
--   pause without widening `action_by` (REC-D15 / REC3-D4).
--
--   Live head at write time was `195_appointment_start_notify_stamp.sql`.
--   Charter budgeted 197 for this file (196 reserved for p2). p2 has
--   not landed; rec-13 re-derived the next sequential number: 196.
--   p2 must re-derive from this folder when it ships.
--
-- 1. Reason codes (REC-D14 · REC3-D2)
--   New ENUM `recording_pause_reason_code` with the five locked presets.
--   All five are seeded in the CREATE TYPE (Migration 064 L31–34):
--   `ALTER TYPE … ADD VALUE` cannot be used in the same transaction as
--   the value's first use. Do not leave a value "for later".
--
--   Nullable column `pause_reason_code`. Historical `recording_paused`
--   rows stay NULL — we never guess a code (REC3-D3).
--
--   CHECK `consultation_recording_audit_pause_reason_code_required`
--   requires the code on `recording_paused` rows. It is added NOT VALID
--   and is intentionally left unvalidated. NOT VALID still enforces the
--   CHECK on subsequent INSERT/UPDATE; it only skips the scan of
--   existing rows at ADD time. Historical pause rows (NULL code, redacted
--   sentinel reason) are therefore exempt forever. VALIDATE CONSTRAINT
--   would fail on those rows and must not be run.
--
--   The Migration 064 reason CHECK
--   `consultation_recording_audit_reason_check` (5–200 chars on
--   recording_paused / recording_stopped /
--   patient_revoked_video_mid_session) is not dropped and not
--   rewritten. recording_stopped and patient_revoked_video_mid_session
--   keep their existing behaviour (pinned canonical strings, e.g.
--   recording-escalation-service).
--
-- 2. Auto-resume stamps (REC-D16)
--   `auto_resume_at` — absolute deadline the polling job queries.
--   `auto_resume_extensions_used` — 0 or 1; schema-capped at the one
--   extension REC-D16 allows. Both nullable; no backfill.
--
--   Partial index `idx_recording_audit_auto_resume_due` — pauses whose
--   deadline has passed and which are still open. Same rationale as
--   `idx_recording_audit_attempted` (064 L122–127): partial so it stays
--   small. Predicate: completed pause, deadline set, not yet closed.
--
-- 3. Dangling-pause discriminator (REC-D16 · criterion 2.3)
--   Column `pause_closed_as`, not a new `recording_audit_action` value.
--   Migration 071 L28–49 keeps status out of the action name
--   (`metadata.status`, not `_attempted` / `_completed` / `_failed`).
--   Closing a pause is the same kind of status: the action remains
--   `recording_paused` (and a later `recording_resumed` when capture
--   actually resumes). Three closed-as tokens distinguish:
--     · manual_resume              — a human resumed
--     · auto_resume                — the timer resumed
--     · session_ended_while_paused — consult ended while still paused
--   NULL means the pause is still open (or the row is not a pause).
--
-- 4. Patient-actor attribution (REC-D15 · REC3-D4)
--   No ENUM or CHECK widening: `action_by_role` already permits
--   `'patient'` (064 L97) and `recording_paused` already exists.
--   `action_by` stays UUID NOT NULL.
--
--   Surrogate for a bot patient (JWT sub `patient:{appointmentId}`,
--   nullable `consultation_sessions.patient_id`): write
--   `action_by = consultation_sessions.id` and
--   `action_by_role = 'patient'`. Precedent: Migrations 086 and 105
--   (call-quality `user_id`). Rejected alternative: the all-zeros
--   system UUID used by `recording-track-service.resolveActor` and
--   064's `action_by` comment — that would make a patient pause
--   indistinguishable from a system row (criterion 3.2.2).
--
-- 5. Legacy free-text redaction (REC3-D3)
--   Pre-existing `recording_paused` rows: replace `reason` with the
--   sentinel `reason_not_recorded_in_preset_form` (passes the 5–200
--   CHECK), leave `pause_reason_code` NULL, stamp
--   `metadata.reason_redacted = { by_migration, at }`.
--   Actor, role, action, created_at, correlation_id, and
--   metadata.status are not in the SET list and are unchanged.
--   Idempotent: rows that already carry `metadata.reason_redacted`
--   are skipped. The UPDATE never SELECTs the old reason (no PHI in
--   logs even if this file is traced).
--
-- Safety:
--   - DO-block `pg_type` guard for the new ENUM (064 L73–89).
--   - ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
--   - Constraint DO-blocks so re-apply is a no-op (no DROP).
--   - No RLS policy. This table is service-role-only (064 §Safety).
--   - Correct against zero legacy rows and against thousands.
--
-- Reverse:
--   Documented at the bottom. Do NOT reverse once rows exist —
--   forward-supersede (071 L61–70). Postgres cannot DROP ENUM values
--   without a table rewrite.
-- ============================================================================

-- 1. ENUM — five presets only. Seeded up front.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'recording_pause_reason_code'
  ) THEN
    CREATE TYPE recording_pause_reason_code AS ENUM (
      'patient_request',
      'sensitive_disclosure',
      'third_party_present',
      'administrative',
      'technical'
    );
  END IF;
END
$$;

-- 2. Columns.
ALTER TABLE consultation_recording_audit
  ADD COLUMN IF NOT EXISTS pause_reason_code recording_pause_reason_code;

ALTER TABLE consultation_recording_audit
  ADD COLUMN IF NOT EXISTS auto_resume_at TIMESTAMPTZ;

ALTER TABLE consultation_recording_audit
  ADD COLUMN IF NOT EXISTS auto_resume_extensions_used SMALLINT;

ALTER TABLE consultation_recording_audit
  ADD COLUMN IF NOT EXISTS pause_closed_as TEXT;

-- 3. New-row code requirement — NOT VALID, never VALIDATE (see header).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'consultation_recording_audit_pause_reason_code_required'
  ) THEN
    ALTER TABLE consultation_recording_audit
      ADD CONSTRAINT consultation_recording_audit_pause_reason_code_required
      CHECK (
        action <> 'recording_paused'
        OR pause_reason_code IS NOT NULL
      ) NOT VALID;
  END IF;
END
$$;

-- 4. Extension cap — schema-level, one extension (REC-D16).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'consultation_recording_audit_auto_resume_extensions_used_check'
  ) THEN
    ALTER TABLE consultation_recording_audit
      ADD CONSTRAINT consultation_recording_audit_auto_resume_extensions_used_check
      CHECK (
        auto_resume_extensions_used IS NULL
        OR auto_resume_extensions_used IN (0, 1)
      );
  END IF;
END
$$;

-- 5. Closed-as discriminator — three tokens, NULL = still open.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'consultation_recording_audit_pause_closed_as_check'
  ) THEN
    ALTER TABLE consultation_recording_audit
      ADD CONSTRAINT consultation_recording_audit_pause_closed_as_check
      CHECK (
        pause_closed_as IS NULL
        OR pause_closed_as IN (
          'manual_resume',
          'auto_resume',
          'session_ended_while_paused'
        )
      );
  END IF;
END
$$;

-- 6. Partial index for the auto-resume sweep (REC3-D7 polling job).
CREATE INDEX IF NOT EXISTS idx_recording_audit_auto_resume_due
  ON consultation_recording_audit(auto_resume_at)
  WHERE action = 'recording_paused'
    AND auto_resume_at IS NOT NULL
    AND pause_closed_as IS NULL
    AND (metadata->>'status') = 'completed';

-- 7. Legacy free-text redaction. Idempotent. Does not touch actor,
--    role, action, created_at, correlation_id, or metadata.status.
UPDATE consultation_recording_audit
SET
  reason = 'reason_not_recorded_in_preset_form',
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'reason_redacted', jsonb_build_object(
      'by_migration', '196_recording_pause_reason_codes_and_auto_resume_stamps',
      'at', now()
    )
  )
WHERE action = 'recording_paused'
  AND pause_reason_code IS NULL
  AND (metadata->'reason_redacted') IS NULL;

-- 8. Comments — why, not just what.
COMMENT ON TYPE recording_pause_reason_code IS
  'rec-13 (REC-D14). Preset pause reasons. Exists so no clinical free text is ever written to consultation_recording_audit.reason again. Five values only: patient_request, sensitive_disclosure, third_party_present, administrative, technical.';

COMMENT ON COLUMN consultation_recording_audit.pause_reason_code IS
  'rec-13. Preset pause reason. Required on new recording_paused rows (CHECK NOT VALID — historical NULL rows are exempt and must stay exempt; do not VALIDATE). NULL means a pre-rec-13 row; never guess a code. Exists so no clinical free text is ever written here again.';

COMMENT ON COLUMN consultation_recording_audit.auto_resume_at IS
  'rec-13 (REC-D16). Absolute server deadline for auto-resume. Owned by the row so a polling job can recover the deadline after a pod restart. NULL on historical rows and on non-pause actions.';

COMMENT ON COLUMN consultation_recording_audit.auto_resume_extensions_used IS
  'rec-13 (REC-D16). How many 5-minute extensions this pause has consumed. Schema-capped at 1. NULL on historical rows.';

COMMENT ON COLUMN consultation_recording_audit.pause_closed_as IS
  'rec-13 (REC-D16). How this pause row was closed: manual_resume | auto_resume | session_ended_while_paused. NULL = still open. Column discriminator, not a new recording_audit_action value — 071 keeps status out of the action name.';

COMMENT ON COLUMN consultation_recording_audit.action_by IS
  'auth.users.id of the actor when one exists. action_by_role=''system'': all-zeros UUID (064 / consultation-message-service SYSTEM_SENDER_ID). action_by_role=''patient'' when the patient has no auth.users row (bot JWT sub patient:{appointmentId}, or null session.patient_id): consultation_sessions.id — the 086/105 surrogate. Role stays ''patient'' so the surrogate is never mistaken for a system row.';

COMMENT ON COLUMN consultation_recording_audit.reason IS
  '5..200 chars when action is recording_paused, recording_stopped, or patient_revoked_video_mid_session (consultation_recording_audit_reason_check — not dropped). From rec-13, recording_paused no longer stores clinician free text: new rows carry a non-clinical token next to pause_reason_code; legacy pause free text was redacted to reason_not_recorded_in_preset_form. recording_stopped and patient_revoked_video_mid_session still use pinned canonical strings.';

-- ============================================================================
-- Reverse (documented only; do NOT run once audit rows exist).
-- Forward-supersede. Postgres cannot DROP ENUM values without a rewrite.
--
--   DROP INDEX IF EXISTS idx_recording_audit_auto_resume_due;
--   ALTER TABLE consultation_recording_audit
--     DROP CONSTRAINT IF EXISTS consultation_recording_audit_pause_closed_as_check;
--   ALTER TABLE consultation_recording_audit
--     DROP CONSTRAINT IF EXISTS consultation_recording_audit_auto_resume_extensions_used_check;
--   ALTER TABLE consultation_recording_audit
--     DROP CONSTRAINT IF EXISTS consultation_recording_audit_pause_reason_code_required;
--   ALTER TABLE consultation_recording_audit
--     DROP COLUMN IF EXISTS pause_closed_as;
--   ALTER TABLE consultation_recording_audit
--     DROP COLUMN IF EXISTS auto_resume_extensions_used;
--   ALTER TABLE consultation_recording_audit
--     DROP COLUMN IF EXISTS auto_resume_at;
--   ALTER TABLE consultation_recording_audit
--     DROP COLUMN IF EXISTS pause_reason_code;
--   DROP TYPE IF EXISTS recording_pause_reason_code;
--   -- Redacted reason text cannot be restored.
-- ============================================================================
