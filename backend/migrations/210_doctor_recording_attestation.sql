-- ============================================================================
-- 210_doctor_recording_attestation.sql
-- recording-governance-v2 · rec-07 — versioned doctor recording attestation.
-- Date:    2026-08-23
-- ============================================================================
-- Purpose:
--   REC-D4 makes the audio mandate two-sided: a doctor accepts a versioned
--   six-clause attestation before their first consult. This file lands the
--   durable record the gate reads. Service, endpoint and UI are rec-11.
--
--   A "doctor" IS the `auth.users` row (there is no `doctors` table — see
--   doctor-funnel DF-D2), so this table keys on `auth.users(id)` exactly
--   like `doctor_verification` (183), `doctor_settings` (009) and
--   `doctor_instagram` (011).
--
--   Append-only per (doctor_id, policy_version) — REC2-D2. The gate asks
--   "does a row exist for the currently-active policy version?". An
--   attestation is a legal artifact; overwriting a v1 acceptance would
--   destroy the evidence that the doctor accepted v1 while running
--   consults under v1.
--
--   policy_version is an owner-approved snapshot (REC-D2). This migration
--   stores a version; it does not decide what the version is. No DEFAULT,
--   no CHECK pinning a specific value, no seed row.
--
-- ────────────────────────────────────────────────────────────────────────
-- RLS — enabled, ZERO policies (REC2-D4). Contrast with 183:
--
--   183 added a SELECT-own policy as defence-in-depth because a later
--   user-scoped client read was anticipated. This table has no user-scoped
--   reader. rec-11's endpoint is the only reader and it runs service-role,
--   which bypasses RLS. A doctor holding an `authenticated` JWT therefore
--   gets nothing from PostgREST — the correct posture, and it needs no
--   auth.uid expression.
--
--   Doctors get NO INSERT / UPDATE policy. 183's privilege-escalation
--   reasoning applies with more force: a doctor who could PATCH their own
--   attestation row could self-attest past the entire gate.
--
--   If a SELECT-own or auth.jwt admin policy ever looks required, that
--   is a STOP-and-surface, not a judgement call (REC2-D4 / agent contract).
-- ────────────────────────────────────────────────────────────────────────
--
-- Retention / deletion:
--   `doctor_id` FK ON DELETE CASCADE → the row is removed automatically
--   when the `auth.users` account is deleted, matching 183.
--
-- Safety:
--   · Additive only — new table, no existing object touched.
--   · CREATE TABLE IF NOT EXISTS + DROP TRIGGER IF EXISTS / CREATE TRIGGER
--     make re-runs a no-op.
--   · Reuses `update_updated_at_column()` from migration 001.
--   · No IP, user-agent or free-text column (REC2-D3).
--   · Unique (doctor_id, policy_version) already covers the gate's
--     lookup (one doctor + the active version). No redundant index.
--   · Reverse migration documented at the file foot.
--
-- Numbering:
--   Charter budgeted 196 when the head was 195. Live head at write time
--   is 209_patients_archived_at.sql, so this file is 210. Flagged in
--   rec-07 Notes for rec-12's doc-drift step.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS doctor_recording_attestation (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Snapshot of the attestation version the doctor actually saw. Never
  -- rewritten. Owner-approved (REC-D2); no default, no pinned CHECK.
  policy_version  TEXT NOT NULL,
  -- Database clock is the audit timestamp, not the caller's.
  accepted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Append-only per version: re-acceptance of the same version is a no-op
  -- at the service layer; this constraint is what makes it so.
  CONSTRAINT doctor_recording_attestation_doctor_version_uniq
    UNIQUE (doctor_id, policy_version)
);

-- Unique (doctor_id, policy_version) already serves the gate's
-- "this doctor + this active version" lookup. No extra index.

COMMENT ON TABLE doctor_recording_attestation IS
  'recording-governance-v2 rec-07 (REC-D4). Append-only per '
  '(doctor_id, policy_version): one immutable acceptance row per version '
  'the doctor ever accepted. The gate reads existence for the currently-'
  'active owner-approved policy version (REC-D2). Service-role only.';

COMMENT ON COLUMN doctor_recording_attestation.policy_version IS
  'Owner-approved attestation version the doctor accepted (REC-D2). '
  'Snapshot; never rewritten. Not agent-authored. No default.';

-- ----------------------------------------------------------------------------
-- 2. RLS — enable, add no policy (REC2-D4)
-- ----------------------------------------------------------------------------
ALTER TABLE doctor_recording_attestation ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 3. updated_at trigger (reuse update_updated_at_column from migration 001)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS doctor_recording_attestation_updated_at
  ON doctor_recording_attestation;
CREATE TRIGGER doctor_recording_attestation_updated_at
  BEFORE UPDATE ON doctor_recording_attestation
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Reverse migration (manual; no automated down-migration tooling).
-- Do NOT revert once attestation rows exist in production — the first-consult
-- gate and the doctor's attestation record would regress.
--
--   DROP TRIGGER IF EXISTS doctor_recording_attestation_updated_at
--     ON doctor_recording_attestation;
--   DROP TABLE   IF EXISTS doctor_recording_attestation;
-- ============================================================================
