-- ============================================================================
-- 185_doctor_verification_changes_requested.sql
-- verification-v2 · verv2-01 — widen doctor_verification.status CHECK to
-- include `changes_requested` (soft "please re-upload" verdict).
-- Date:    2026-07-22
-- ============================================================================
-- Purpose:
--   Add a non-terminal review verdict distinct from hard `rejected`:
--
--     unverified ──submit──▶ pending_review ──review──▶ verified
--                                              ├────────▶ rejected
--                                              └────────▶ changes_requested
--                                                           └──resubmit──▶ pending_review
--
--   `changes_requested` means "fixable — re-upload / correct a field";
--   `rejected` stays the hard "we can't verify you." Both reuse the existing
--   `reject_reason` column as the reviewer note (VERV2-D2) — no new column.
--
-- Pattern:
--   Additive CHECK widening mirrors Migrations 073 / 074 / 182
--   (DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT with the **full**
--   enumerated list). Legacy statuses stay legal; no backfill.
--
-- RLS / storage:
--   Unchanged. Doctors remain SELECT-only; all writes go through the
--   service-role backend. The storage bucket (184) is untouched.
--
-- Safety:
--   · DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT is idempotent on re-run.
--   · Pre-existing rows use only the four legacy statuses, which remain
--     legal under the widened CHECK.
--
-- Reverse migration:
--   Documented at the file foot. Do NOT revert once any row is
--   `changes_requested` — the narrow CHECK would fail.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Part 1 — doctor_verification.status widening
--
-- Migration 183 introduced the four-state CHECK (inline on the column;
-- Postgres names it doctor_verification_status_check).
-- This widening adds `changes_requested` (verification-v2 · VERV2-D1).
-- ----------------------------------------------------------------------------

ALTER TABLE doctor_verification
  DROP CONSTRAINT IF EXISTS doctor_verification_status_check;
ALTER TABLE doctor_verification
  ADD CONSTRAINT doctor_verification_status_check CHECK (
    status IN (
      'unverified',
      'pending_review',
      'verified',
      'rejected',
      'changes_requested'
    )
  );

COMMENT ON TABLE doctor_verification IS
  'doctor-verification-v1 + verification-v2. One row per auth.users doctor. '
  'Status lifecycle: unverified→pending_review→verified|rejected|changes_requested '
  '(changes_requested is non-terminal; doctor re-submit → pending_review). '
  'Doctors are SELECT-only via RLS; ALL writes go through the service-role '
  'backend so a doctor cannot self-set status=verified via direct PostgREST.';

COMMENT ON COLUMN doctor_verification.reject_reason IS
  'Reviewer note. Populated when status is rejected OR changes_requested '
  '(mutually exclusive). Surfaced to the doctor as the reason to re-submit '
  'or the hard decline message. Never log the contents (may contain PII).';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Reverse migration (manual; no automated down-migration tooling). Only safe
-- if ZERO rows have status='changes_requested':
--
--   ALTER TABLE doctor_verification
--     DROP CONSTRAINT IF EXISTS doctor_verification_status_check;
--   ALTER TABLE doctor_verification
--     ADD CONSTRAINT doctor_verification_status_check CHECK (
--       status IN ('unverified', 'pending_review', 'verified', 'rejected')
--     );
-- ============================================================================
