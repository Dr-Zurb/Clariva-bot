-- ============================================================================
-- Prescriptions extended vitals (Vitals 2.0)
-- ============================================================================
-- Migration: 151_prescriptions_vitals_2.sql
-- Date:      2026-06-19
-- Batch:     objective-tab (Phase 2 — Vitals 2.0) — task obj-05
-- Description:
--   Additive extended-vitals columns on `prescriptions`, cloning the
--   migration-103 nullable-numeric + named-CHECK-range + PHI-comment pattern.
--   NULL = "not recorded" (never an empty string). Each numeric CHECK is OR'd
--   with `IS NULL` so existing rows trivially satisfy it.
--
--   New columns (all canonical units — P2-D2; unit conversion is a display
--   concern handled in obj-07, never here):
--     vitals_rr                   INTEGER       respiratory rate (breaths/min)
--     vitals_pain_score           INTEGER       pain score 0–10
--     vitals_glucose_mg_dl        NUMERIC(5,1)  blood glucose in mg/dL
--     vitals_gcs_total            INTEGER       Glasgow Coma Scale total (3–15)
--     vitals_bp_posture           TEXT          sitting|standing|supine
--     vitals_bp_limb              TEXT          left_arm|right_arm|left_leg|right_leg
--     vitals_head_circumference_cm NUMERIC(4,1) head circumference in cm
--     vitals_muac_cm              NUMERIC(4,1)  mid-upper-arm circumference in cm
--     vitals_waist_cm             NUMERIC(5,1)  waist circumference in cm
--
--   GCS is total-only in P2 (no E/V/M sub-fields). Glucose is stored as mg/dL.
--   The 7 shipped vitals (migration 103), the BMI badge, and `vitals_text`
--   stay untouched (additive only — P2-D6).
--
-- PHI:
--   Every new column carries PHI. RLS on `prescriptions` already covers all
--   columns (doctor-only access via `auth.uid() = doctor_id`, established in
--   migration 026). This migration does NOT modify RLS policies. 7-year
--   retention applies per COMPLIANCE; account-deletion cascade already covers
--   `prescriptions`.
--
-- Idempotency:
--   - All `ADD COLUMN` statements use `IF NOT EXISTS` (Postgres 9.6+).
--   - Named CHECK constraints follow the migration-103 pattern:
--     `DROP CONSTRAINT IF EXISTS` → `ADD CONSTRAINT` (Postgres has no
--     `ADD CONSTRAINT IF NOT EXISTS`), so re-running is a no-op and the
--     allowed-value vocabulary can be revised later safely.
--
-- Rollback (NOT shipped as a separate migration — documented only):
--   ALTER TABLE prescriptions
--     DROP CONSTRAINT IF EXISTS prescriptions_vitals_rr_chk,
--     DROP CONSTRAINT IF EXISTS prescriptions_vitals_pain_score_chk,
--     DROP CONSTRAINT IF EXISTS prescriptions_vitals_glucose_mg_dl_chk,
--     DROP CONSTRAINT IF EXISTS prescriptions_vitals_gcs_total_chk,
--     DROP CONSTRAINT IF EXISTS prescriptions_vitals_bp_posture_chk,
--     DROP CONSTRAINT IF EXISTS prescriptions_vitals_bp_limb_chk,
--     DROP CONSTRAINT IF EXISTS prescriptions_vitals_head_circumference_cm_chk,
--     DROP CONSTRAINT IF EXISTS prescriptions_vitals_muac_cm_chk,
--     DROP CONSTRAINT IF EXISTS prescriptions_vitals_waist_cm_chk,
--     DROP COLUMN IF EXISTS vitals_rr,
--     DROP COLUMN IF EXISTS vitals_pain_score,
--     DROP COLUMN IF EXISTS vitals_glucose_mg_dl,
--     DROP COLUMN IF EXISTS vitals_gcs_total,
--     DROP COLUMN IF EXISTS vitals_bp_posture,
--     DROP COLUMN IF EXISTS vitals_bp_limb,
--     DROP COLUMN IF EXISTS vitals_head_circumference_cm,
--     DROP COLUMN IF EXISTS vitals_muac_cm,
--     DROP COLUMN IF EXISTS vitals_waist_cm;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extended vitals columns (Vitals 2.0). NULL = "not recorded". Range CHECKs
--    prevent typo-grade data quality issues. Posture / limb are constrained to
--    a small allowed set. Canonical units only (P2-D2).
-- ----------------------------------------------------------------------------
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS vitals_rr                    INTEGER       NULL,
  ADD COLUMN IF NOT EXISTS vitals_pain_score            INTEGER       NULL,
  ADD COLUMN IF NOT EXISTS vitals_glucose_mg_dl         NUMERIC(5,1)  NULL,
  ADD COLUMN IF NOT EXISTS vitals_gcs_total             INTEGER       NULL,
  ADD COLUMN IF NOT EXISTS vitals_bp_posture            TEXT          NULL,
  ADD COLUMN IF NOT EXISTS vitals_bp_limb               TEXT          NULL,
  ADD COLUMN IF NOT EXISTS vitals_head_circumference_cm NUMERIC(4,1)  NULL,
  ADD COLUMN IF NOT EXISTS vitals_muac_cm               NUMERIC(4,1)  NULL,
  ADD COLUMN IF NOT EXISTS vitals_waist_cm              NUMERIC(5,1)  NULL;

-- Named range constraints, idempotent via DROP CONSTRAINT IF EXISTS /
-- ADD CONSTRAINT. Pattern mirrors migration 103.
ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_vitals_rr_chk;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_vitals_rr_chk
  CHECK (vitals_rr IS NULL OR vitals_rr BETWEEN 0 AND 120);

ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_vitals_pain_score_chk;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_vitals_pain_score_chk
  CHECK (vitals_pain_score IS NULL OR vitals_pain_score BETWEEN 0 AND 10);

ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_vitals_glucose_mg_dl_chk;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_vitals_glucose_mg_dl_chk
  CHECK (vitals_glucose_mg_dl IS NULL OR vitals_glucose_mg_dl BETWEEN 10 AND 1500);

ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_vitals_gcs_total_chk;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_vitals_gcs_total_chk
  CHECK (vitals_gcs_total IS NULL OR vitals_gcs_total BETWEEN 3 AND 15);

ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_vitals_bp_posture_chk;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_vitals_bp_posture_chk
  CHECK (
    vitals_bp_posture IS NULL
    OR vitals_bp_posture IN ('sitting', 'standing', 'supine')
  );

ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_vitals_bp_limb_chk;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_vitals_bp_limb_chk
  CHECK (
    vitals_bp_limb IS NULL
    OR vitals_bp_limb IN ('left_arm', 'right_arm', 'left_leg', 'right_leg')
  );

ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_vitals_head_circumference_cm_chk;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_vitals_head_circumference_cm_chk
  CHECK (vitals_head_circumference_cm IS NULL OR vitals_head_circumference_cm BETWEEN 10 AND 80);

ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_vitals_muac_cm_chk;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_vitals_muac_cm_chk
  CHECK (vitals_muac_cm IS NULL OR vitals_muac_cm BETWEEN 5 AND 60);

ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_vitals_waist_cm_chk;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_vitals_waist_cm_chk
  CHECK (vitals_waist_cm IS NULL OR vitals_waist_cm BETWEEN 20 AND 300);

COMMENT ON COLUMN prescriptions.vitals_rr IS
  'PHI: respiratory rate in breaths/min. objective-tab Vitals 2.0 (obj-05).';
COMMENT ON COLUMN prescriptions.vitals_pain_score IS
  'PHI: pain score 0–10. objective-tab Vitals 2.0 (obj-05).';
COMMENT ON COLUMN prescriptions.vitals_glucose_mg_dl IS
  'PHI: blood glucose in mg/dL (canonical unit). objective-tab Vitals 2.0 (obj-05).';
COMMENT ON COLUMN prescriptions.vitals_gcs_total IS
  'PHI: Glasgow Coma Scale total 3–15 (total only in P2; no E/V/M sub-fields). objective-tab Vitals 2.0 (obj-05).';
COMMENT ON COLUMN prescriptions.vitals_bp_posture IS
  'PHI: BP measurement posture: sitting|standing|supine. objective-tab Vitals 2.0 (obj-05).';
COMMENT ON COLUMN prescriptions.vitals_bp_limb IS
  'PHI: BP measurement limb: left_arm|right_arm|left_leg|right_leg. objective-tab Vitals 2.0 (obj-05).';
COMMENT ON COLUMN prescriptions.vitals_head_circumference_cm IS
  'PHI: head circumference in centimetres (canonical unit). objective-tab Vitals 2.0 (obj-05).';
COMMENT ON COLUMN prescriptions.vitals_muac_cm IS
  'PHI: mid-upper-arm circumference in centimetres (canonical unit). objective-tab Vitals 2.0 (obj-05).';
COMMENT ON COLUMN prescriptions.vitals_waist_cm IS
  'PHI: waist circumference in centimetres (canonical unit). objective-tab Vitals 2.0 (obj-05).';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged: doctor-only access via `auth.uid() = doctor_id` (migration 026)
--                covers all new columns.
-- PHI: every added column carries PHI; 7-year retention applies per COMPLIANCE.
-- Additive only (P2-D6): the 7 shipped vitals (migration 103), the BMI badge,
--                and `vitals_text` are untouched.
-- No new indexes: Phase 2 has no query pattern that filters on the new columns.
-- ============================================================================
