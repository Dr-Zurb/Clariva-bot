-- ============================================================================
-- 098_doctor_patient_flow_advance.sql
-- Patient seeing flow batch · Phase 2 · Lane δ step 0 (task pf-09)
-- Date:    2026-05-08
-- ============================================================================
-- Purpose:
--   Per-doctor preference for what happens after the doctor taps "Done with
--   patient" (pf-05's wrap-up CTA), plus an opt-in auto-no-show timer that
--   the worker (pf-17) will read.
--
-- Columns introduced (additive only — existing rows safely defaulted):
--
--   patient_flow_advance  TEXT NOT NULL DEFAULT 'countdown'
--     · Decides what pf-11 (the next-patient countdown overlay) does after
--       the wrap-up dialog finalises:
--         - 'countdown' (default) : show a 5-second confirm overlay before
--           routing to the next patient. Source plan P-D2: this is the
--           friendliest UX, so every existing doctor opts into it
--           automatically via the column DEFAULT.
--         - 'instant'             : skip the overlay; route to next patient
--           the moment wrap-up resolves. For high-volume OPDs.
--         - 'manual'              : stay on the current screen until the
--           doctor explicitly moves. For slow / complex consults where the
--           doctor wants to dwell on the chart after Send-Rx.
--
--   auto_no_show_after_min  INT NULL
--     · Opt-in timer (minutes) after which the auto-no-show worker (pf-17)
--       marks an appointment 'no_show' if no consultation has started.
--       NULL = off (default per source plan P-D7). When set, must be in
--       [5, 240]: below 5 is too aggressive for any clinic, above 240 is
--       effectively "never" so the doctor should just leave it NULL.
--
-- Safety:
--   · Additive only — no column dropped or tightened.
--   · Both CHECK constraints are DROP-then-ADD so re-running the migration
--     after a vocabulary tweak is safe (older PG versions reject
--     `ADD CONSTRAINT IF NOT EXISTS`).
--   · The DEFAULT 'countdown' is intentional (P-D2): every existing doctor
--     opts into the friendly UX without an explicit Settings visit. The
--     check constraint allows the value, so the DEFAULT cannot violate it.
--   · auto_no_show_after_min stays NULL on existing rows (the additive
--     ADD COLUMN is NULL-by-default since no DEFAULT is specified) — matches
--     P-D7's "feature off until doctor opts in" contract.
--   · RLS already enforced on `doctor_settings` via ownership predicates
--     (migration 009). Additive columns inherit those policies — no new
--     policies needed.
--
-- Rollback:
--   `ALTER TABLE doctor_settings DROP COLUMN patient_flow_advance,
--                                DROP COLUMN auto_no_show_after_min;`
--   Safe — no other column or downstream object depends on these yet
--   (pf-11's countdown reader and pf-17's worker both ship after this).
-- ============================================================================

-- ── Columns ──────────────────────────────────────────────────────────────────

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS patient_flow_advance TEXT NOT NULL DEFAULT 'countdown',
  ADD COLUMN IF NOT EXISTS auto_no_show_after_min INT NULL;

-- ── Check constraints (drop-then-add → idempotent re-run) ────────────────────

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_patient_flow_advance_check;

ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_patient_flow_advance_check
  CHECK (patient_flow_advance IN ('countdown', 'instant', 'manual'));

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_auto_no_show_after_min_check;

ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_auto_no_show_after_min_check
  CHECK (
    auto_no_show_after_min IS NULL
    OR (auto_no_show_after_min BETWEEN 5 AND 240)
  );

-- ── Column comments ──────────────────────────────────────────────────────────

COMMENT ON COLUMN doctor_settings.patient_flow_advance IS
  'pf-09 · Post-wrap-up routing preference: ''countdown'' (default; pf-11 confirm overlay), ''instant'' (skip overlay), ''manual'' (stay until doctor moves).';

COMMENT ON COLUMN doctor_settings.auto_no_show_after_min IS
  'pf-09 · Opt-in minutes after which pf-17''s worker marks appointments no_show when no consultation has started. NULL = off. Range [5,240].';

-- ============================================================================
-- Reverse (documented only; kept in-file so the reverse op is one grep away).
--
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_auto_no_show_after_min_check;
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_patient_flow_advance_check;
--   ALTER TABLE doctor_settings
--     DROP COLUMN IF EXISTS auto_no_show_after_min;
--   ALTER TABLE doctor_settings
--     DROP COLUMN IF EXISTS patient_flow_advance;
-- ============================================================================
