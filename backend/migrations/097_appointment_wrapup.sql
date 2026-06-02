-- ============================================================================
-- 097_appointment_wrapup.sql
-- Patient seeing flow batch · Phase 1 · Lane α step 0 (task pf-01)
-- Date:    2026-05-07
-- ============================================================================
-- Purpose:
--   The doctor-side wrap-up dialog (task pf-04) finalises an appointment with
--   a free-text diagnosis line, a small set of structured diagnosis tags (used
--   by the `/v1/diagnoses/recent` autocomplete in pf-02), and a follow-up
--   declaration (date + kind). This migration introduces the four columns the
--   wrap-up endpoint (pf-02) writes into, plus the two indices that power the
--   read path:
--
--     · GIN on `diagnosis_tags` — array containment / element scans for the
--       per-doctor recent-tag autocomplete.
--     · Partial BTREE on `(doctor_id, status) WHERE status = 'completed'` —
--       cheap (only completed rows are indexed) and powers the per-doctor
--       "what did I diagnose recently" read.
--
-- Columns introduced (all nullable / safely defaulted — existing rows are
-- unaffected):
--   diagnosis_text  TEXT NULL
--     · Free-text diagnosis line entered in the wrap-up dialog. NULL until
--       wrap-up runs (or if the doctor leaves it blank).
--   diagnosis_tags  TEXT[] NOT NULL DEFAULT '{}'
--     · Structured diagnosis tags. Empty array — never NULL — so reads can
--       use `array_length(diagnosis_tags, 1) > 0` and `@>` containment
--       without per-row NULL guards.
--   followup_date   DATE NULL
--     · Calendar date the doctor wants the patient back on. NULL means
--       either "no follow-up needed" (paired with `followup_kind = 'none'`)
--       or "decision deferred" (`followup_kind IS NULL`).
--   followup_kind   TEXT NULL
--     · One of {'none','in_person','tele'}, or NULL when not yet decided.
--       The check constraint allows NULL because the column is also written
--       via mid-call partial saves before the wrap-up dialog runs.
--
-- Safety:
--   · Additive only — no drop, no tightening on existing columns.
--   · Every DDL is idempotent (`IF NOT EXISTS` / `IF EXISTS`); re-running
--     the migration is a no-op.
--   · RLS already enforced on `appointments` via ownership predicates
--     (`auth.uid() = doctor_id`, migration 002). Additive columns inherit
--     these policies — no new policies needed.
--   · The partial-index predicate `status = 'completed'` is IMMUTABLE
--     (text equality with a literal) and `'completed'` is a valid value of
--     the existing `appointments.status` CHECK (migration 001).
--
-- Rollback:
--   Reverse operations drop the indices, drop the constraint, then drop
--   the four columns. If reverted after any wrap-up writes happened, those
--   diagnoses / follow-ups are permanently lost. Prefer superseding with a
--   forward migration over reverting.
-- ============================================================================

-- ── Columns ──────────────────────────────────────────────────────────────────

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS diagnosis_text TEXT NULL;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS diagnosis_tags TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS followup_date DATE NULL;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS followup_kind TEXT NULL;

-- ── Check constraint on followup_kind ────────────────────────────────────────
-- Drop-then-add so the migration is idempotent without relying on
-- ADD CONSTRAINT IF NOT EXISTS (which older PG versions reject).

ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_followup_kind_check;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_followup_kind_check
  CHECK (followup_kind IS NULL OR followup_kind IN ('none', 'in_person', 'tele'));

-- ── Indices ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_appointments_diagnosis_tags_gin
  ON appointments USING gin (diagnosis_tags);

CREATE INDEX IF NOT EXISTS idx_appointments_doctor_completed_recent
  ON appointments (doctor_id, status)
  WHERE status = 'completed';

-- ── Column comments ──────────────────────────────────────────────────────────

COMMENT ON COLUMN appointments.diagnosis_text IS
  'pf-01 · Free-text diagnosis line captured by the wrap-up dialog. NULL until wrap-up runs (or if doctor leaves it blank).';

COMMENT ON COLUMN appointments.diagnosis_tags IS
  'pf-01 · Structured diagnosis tags powering the /v1/diagnoses/recent autocomplete (GIN-indexed). Empty array, never NULL.';

COMMENT ON COLUMN appointments.followup_date IS
  'pf-01 · Calendar date the doctor wants the patient back on. NULL when "no follow-up needed" or decision deferred.';

COMMENT ON COLUMN appointments.followup_kind IS
  'pf-01 · One of {none,in_person,tele}, or NULL when not yet decided. ''none'' is a meaningful explicit "no follow-up needed".';

-- ============================================================================
-- Reverse (documented only; kept in-file so the reverse op is one grep away).
--
--   DROP INDEX IF EXISTS idx_appointments_doctor_completed_recent;
--   DROP INDEX IF EXISTS idx_appointments_diagnosis_tags_gin;
--   ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_followup_kind_check;
--   ALTER TABLE appointments DROP COLUMN IF EXISTS followup_kind;
--   ALTER TABLE appointments DROP COLUMN IF EXISTS followup_date;
--   ALTER TABLE appointments DROP COLUMN IF EXISTS diagnosis_tags;
--   ALTER TABLE appointments DROP COLUMN IF EXISTS diagnosis_text;
-- ============================================================================
