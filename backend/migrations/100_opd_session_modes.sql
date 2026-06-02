-- ============================================================================
-- OPD per-day mode: session-day fact + audit (pdm-01)
-- ============================================================================
-- Migration: 100_opd_session_modes.sql
-- Date: 2026-05-17
-- Description:
--   Replace doctor-global doctor_settings.opd_mode as the operational authority
--   with a per-(doctor, session_date) fact table. Add an immutable audit log
--   for every flip. Backfill every historically-touched (doctor, session_date)
--   using "any opd_queue_entries row exists for the day" as the queue heuristic
--   (PD-Q6).
--
-- After this migration:
--   * doctor_opd_session_modes IS the authority for "what mode is this date in?"
--   * doctor_settings.opd_mode survives as the lowest-priority resolver fallback
--     (only consulted when no fact row AND no mode_schedule policy exists).
--   * Every historically-touched (doctor, session_date) has a fact row with
--     source='backfill' and change_count=0.
--
-- RLS: doctor owns rows (read + insert + update); backend uses service role.
-- Audit rows are insert-only for doctors; no update / delete RLS policy.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. doctor_opd_session_modes (fact table, mutable)
-- ----------------------------------------------------------------------------
-- Per-(doctor, session_date) mode fact. PK = (doctor_id, session_date).
-- Written on first booking (policy_default) OR first manual flip (doctor).
-- Per-doctor lookups dominate (the resolver reads (doctor, date) ⇒ PK is enough).
-- The query "what dates has Dr. X materialised?" is the only other shape, and
-- the PK suffices. No additional indexes needed at this scale. Downstream
-- agents reviewing the migration should NOT add speculative indexes here.
CREATE TABLE IF NOT EXISTS doctor_opd_session_modes (
  doctor_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_date  DATE NOT NULL,
  mode          TEXT NOT NULL
    CONSTRAINT doctor_opd_session_modes_mode_check CHECK (mode IN ('slot', 'queue')),
  source        TEXT NOT NULL DEFAULT 'doctor'
    CONSTRAINT doctor_opd_session_modes_source_check CHECK (
      source IN ('doctor', 'policy_default', 'backfill', 'system_overrun_fallback')
    ),
  change_count  INTEGER NOT NULL DEFAULT 0,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (doctor_id, session_date)
);

COMMENT ON TABLE doctor_opd_session_modes IS
  'Per-(doctor, session_date) mode fact. Authoritative read for "what mode is this date?" '
  'Replaces doctor_settings.opd_mode as the operational authority (pdm-01).';
COMMENT ON COLUMN doctor_opd_session_modes.source IS
  'doctor | policy_default | backfill | system_overrun_fallback (pdm-01)';
COMMENT ON COLUMN doctor_opd_session_modes.change_count IS
  'Number of mode flips since materialisation. Drives DL-14 soft nudge.';
COMMENT ON COLUMN doctor_opd_session_modes.changed_at IS
  'Last time mode actually changed (distinct from updated_at, which bumps on any update).';

-- ----------------------------------------------------------------------------
-- 2. doctor_opd_session_mode_changes (audit table, immutable)
-- ----------------------------------------------------------------------------
-- One row per flip; append-only. Powers DL-14 nudge + support diagnostics.
-- No UNIQUE on (doctor_id, session_date) because the same (doctor, date) can
-- be flipped many times; the surrogate `id` is the PK. The composite index
-- (doctor_id, session_date, created_at DESC) covers the support-query shape
-- "show me the flip history for Dr. X on Tuesday".
CREATE TABLE IF NOT EXISTS doctor_opd_session_mode_changes (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_date             DATE NOT NULL,
  from_mode                TEXT NULL
    CONSTRAINT doctor_opd_session_mode_changes_from_mode_check
      CHECK (from_mode IN ('slot', 'queue') OR from_mode IS NULL),
  to_mode                  TEXT NOT NULL
    CONSTRAINT doctor_opd_session_mode_changes_to_mode_check
      CHECK (to_mode IN ('slot', 'queue')),
  affected_apt_count       INTEGER NOT NULL DEFAULT 0,
  overflow_count           INTEGER NOT NULL DEFAULT 0,
  notification_dispatched  BOOLEAN NOT NULL DEFAULT false,
  triggered_by             TEXT NOT NULL
    CONSTRAINT doctor_opd_session_mode_changes_triggered_by_check CHECK (
      triggered_by IN ('doctor', 'system_policy', 'system_overrun_fallback', 'backfill')
    ),
  correlation_id           UUID NULL,
  notes                    TEXT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doctor_opd_session_mode_changes_doctor_session
  ON doctor_opd_session_mode_changes (doctor_id, session_date, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_doctor_opd_session_mode_changes_correlation
  ON doctor_opd_session_mode_changes (correlation_id) WHERE correlation_id IS NOT NULL;

COMMENT ON TABLE doctor_opd_session_mode_changes IS
  'Immutable audit log of every mode flip. One row per flip. Powers DL-14 nudge + support diagnostics (pdm-01).';

-- ----------------------------------------------------------------------------
-- 3. RLS — fact table (doctor full read+insert+update on own rows; no delete)
-- ----------------------------------------------------------------------------
-- DELETE policy intentionally omitted: doctors cannot drop a materialised day.
-- Service role bypasses RLS for backend admin client (conversion service, etc.).
ALTER TABLE doctor_opd_session_modes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors can read own session modes" ON doctor_opd_session_modes;
DROP POLICY IF EXISTS "Doctors can insert own session modes" ON doctor_opd_session_modes;
DROP POLICY IF EXISTS "Doctors can update own session modes" ON doctor_opd_session_modes;

CREATE POLICY "Doctors can read own session modes"
  ON doctor_opd_session_modes FOR SELECT
  USING (doctor_id = auth.uid());

CREATE POLICY "Doctors can insert own session modes"
  ON doctor_opd_session_modes FOR INSERT
  WITH CHECK (doctor_id = auth.uid());

CREATE POLICY "Doctors can update own session modes"
  ON doctor_opd_session_modes FOR UPDATE
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 4. RLS — audit table (doctor read + insert on own rows; immutable)
-- ----------------------------------------------------------------------------
-- No UPDATE policy: audit rows are immutable.
-- No DELETE policy: audit rows are immutable.
ALTER TABLE doctor_opd_session_mode_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors can read own session mode changes" ON doctor_opd_session_mode_changes;
DROP POLICY IF EXISTS "Doctors can insert own session mode changes" ON doctor_opd_session_mode_changes;

CREATE POLICY "Doctors can read own session mode changes"
  ON doctor_opd_session_mode_changes FOR SELECT
  USING (doctor_id = auth.uid());

CREATE POLICY "Doctors can insert own session mode changes"
  ON doctor_opd_session_mode_changes FOR INSERT
  WITH CHECK (doctor_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 5. updated_at trigger on fact table
-- ----------------------------------------------------------------------------
-- Reuses update_updated_at_column() introduced in migration 001.
-- No trigger on audit table (immutable, no UPDATE path).
DROP TRIGGER IF EXISTS doctor_opd_session_modes_updated_at ON doctor_opd_session_modes;
CREATE TRIGGER doctor_opd_session_modes_updated_at
  BEFORE UPDATE ON doctor_opd_session_modes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 6. PD-Q6 backfill — materialise every historically-touched (doctor, date)
-- ----------------------------------------------------------------------------
-- Heuristic: a (doctor, date) is 'queue' iff any opd_queue_entries row exists
-- for that pair. Sound by construction: queue entries are only created in
-- queue mode (see appointment-service.ts createQueueEntryAfterBooking, only
-- invoked when opdMode === 'queue').
--
-- We materialise distinct (doctor_id, session_date) pairs in a subquery first,
-- then EXISTS-probe opd_queue_entries against the already-cast date. Doing the
-- DISTINCT pass before the CASE avoids Postgres' "ungrouped column in correlated
-- subquery" error (42803) that arises when GROUP BY is used with the same cast
-- expression nested inside an EXISTS clause.
--
-- ON CONFLICT DO NOTHING: idempotent re-run (matches CREATE TABLE IF NOT EXISTS).
-- WHERE status NOT IN ('cancelled'): PD-Q6 says "at least one non-cancelled
-- appointment". Past dates with only cancellations are dead history; no need
-- to materialise. Forward-dated pending/confirmed are live and need a row.

INSERT INTO doctor_opd_session_modes (
  doctor_id,
  session_date,
  mode,
  source,
  change_count,
  changed_at,
  created_at,
  updated_at
)
SELECT
  s.doctor_id,
  s.session_date,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM opd_queue_entries q
      WHERE q.doctor_id = s.doctor_id
        AND q.session_date = s.session_date
    ) THEN 'queue'
    ELSE 'slot'
  END AS mode,
  'backfill' AS source,
  0 AS change_count,
  now() AS changed_at,
  now() AS created_at,
  now() AS updated_at
FROM (
  SELECT DISTINCT
    a.doctor_id,
    a.appointment_date::date AS session_date
  FROM appointments a
  WHERE a.status NOT IN ('cancelled')
) s
ON CONFLICT (doctor_id, session_date) DO NOTHING;

-- Audit row per backfilled day: from_mode = NULL (first materialisation),
-- triggered_by = 'backfill'. Run as a second pass for readability — the
-- affected_apt_count subquery would balloon a combined CTE. ~100ms total on
-- a 100k-appointment DB.
--
-- Idempotency: the audit table has no UNIQUE on (doctor_id, session_date)
-- (intentional — the same day can be flipped many times). On migration re-run
-- the first INSERT is a no-op (PK conflict), but without the NOT EXISTS guard
-- below the audit INSERT would duplicate every backfill row. The guard makes
-- this pass a no-op on re-run, matching the migration's idempotency promise.
INSERT INTO doctor_opd_session_mode_changes (
  doctor_id,
  session_date,
  from_mode,
  to_mode,
  affected_apt_count,
  overflow_count,
  notification_dispatched,
  triggered_by,
  correlation_id,
  notes,
  created_at
)
SELECT
  m.doctor_id,
  m.session_date,
  NULL AS from_mode,
  m.mode AS to_mode,
  (
    SELECT COUNT(*)
    FROM appointments a
    WHERE a.doctor_id = m.doctor_id
      AND a.appointment_date::date = m.session_date
      AND a.status NOT IN ('cancelled')
  ) AS affected_apt_count,
  0 AS overflow_count,
  false AS notification_dispatched,
  'backfill' AS triggered_by,
  NULL AS correlation_id,
  'Initial backfill from migration 100 (PD-Q6 heuristic).' AS notes,
  now() AS created_at
FROM doctor_opd_session_modes m
WHERE m.source = 'backfill'
  AND NOT EXISTS (
    SELECT 1
    FROM doctor_opd_session_mode_changes c
    WHERE c.doctor_id = m.doctor_id
      AND c.session_date = m.session_date
      AND c.triggered_by = 'backfill'
  );

-- ============================================================================
-- Migration Complete
-- ============================================================================
