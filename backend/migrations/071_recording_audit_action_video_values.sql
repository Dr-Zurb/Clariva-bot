-- ============================================================================
-- 071_recording_audit_action_video_values.sql
-- Plan 08 · Task 43 — recording_audit_action ENUM widens for video escalation
-- Date:    2026-04-19
-- ============================================================================
-- Purpose:
--   Additively widen the `recording_audit_action` ENUM (Migration 064, Plan
--   07 · Task 28) with the two new lifecycle actions Plan 08 Task 43's
--   recording-track-service writes into the ledger:
--
--     · `video_recording_started`  — the moment audio+video Recording Rules
--        were applied after a doctor-initiated escalation (Task 40/41).
--     · `video_recording_reverted` — the moment rules flipped back to
--        audio-only (doctor revert, patient revoke, or system fallback).
--
--   Each value is written three times per rule-flip via the existing
--   double-row pattern from Migration 064:
--     Row 1: action = <new_value>, metadata.status = 'attempted'
--     Row 2: action = <new_value>, metadata.status = 'completed'   (success)
--       or   action = <new_value>, metadata.status = 'failed'      (failure)
--   Both rows share a `correlation_id` so Plan 10+ analytics can join
--   attempted ↔ resolved.
--
--   This mirrors how `recording_paused` / `recording_resumed` already work —
--   Task 43 does NOT introduce a new `status` discriminator; it reuses the
--   one pinned in Migration 064's metadata JSONB shape.
--
-- Why NOT separate `_attempted` / `_completed` / `_failed` ENUM values
-- (as Task 45's sibling task file hinted at):
--   The existing Plan 07 Task 28 ledger puts status in `metadata.status`
--   (JSONB), not in the action name. Keeping Plan 08 consistent with that
--   avoids a second audit-row reader to teach ("this family of actions
--   carries status in the name; that family carries it in metadata").
--   Six new enum values would double the surface without a corresponding
--   read-side win.
--
-- Why NOT reuse `recording_started` / `recording_stopped` from Migration
-- 064:
--   `recording_started` is semantically the session-creation moment
--   (currently unwritten; reserved for a future Plan 02 Task 34 archival
--   worker to emit at session-start). `recording_stopped` is similarly
--   reserved for session-end. Conflating the `stopped` / `started` family
--   with rule-flips confuses the attempted→completed reconciliation sweep.
--   Two new enum values keep the ledger grammar tight:
--     session-level:  recording_started,   recording_stopped
--     rule-flips:     recording_paused,    recording_resumed,
--                     video_recording_started, video_recording_reverted
--     patient event:  patient_declined_pre_session,
--                     patient_revoked_video_mid_session
--
-- Safety:
--   · `ALTER TYPE … ADD VALUE IF NOT EXISTS` is idempotent. Requires
--     PostgreSQL ≥ 9.6 (the repo's baseline is 14+).
--   · `ADD VALUE` must be run outside a transaction OR before the value
--     is referenced in the same transaction; shipping each value in its
--     own statement satisfies both rules and keeps the migration tool
--     safe.
--   · No data back-fill required: pre-Plan-08 rows never used these
--     values, and no existing row-shape CHECK gates on them.
--
-- Reverse migration:
--   Postgres does NOT support `DROP VALUE` on an ENUM without a full
--   table rewrite. If a rollback is ever needed, the recommended path is:
--     1. Rename the type: `ALTER TYPE recording_audit_action RENAME TO
--        recording_audit_action__v2;`
--     2. Create a new type without the added values.
--     3. Alter the column to the new type via an explicit USING clause,
--        CASTing the two new values to a catch-all (NULL or one of the
--        legacy values).
--   In practice: do NOT reverse. Forward-supersede instead.
-- ============================================================================

ALTER TYPE recording_audit_action ADD VALUE IF NOT EXISTS 'video_recording_started';
ALTER TYPE recording_audit_action ADD VALUE IF NOT EXISTS 'video_recording_reverted';

COMMENT ON TYPE recording_audit_action IS
    'Plan 07 Migration 064 + Plan 08 Migration 071. Lifecycle actions on the recording-audit ledger. '
    'Session-level: recording_started, recording_stopped. '
    'Rule-flips: recording_paused, recording_resumed, video_recording_started, video_recording_reverted. '
    'Patient events: patient_declined_pre_session, patient_revoked_video_mid_session. '
    'Status (attempted | completed | failed) lives in metadata.status JSONB — NOT in the action name.';

-- ============================================================================
-- Reverse migration (manual; do NOT run in production once rows exist):
--   See header above. Prefer forward-superseding migrations.
-- ============================================================================
