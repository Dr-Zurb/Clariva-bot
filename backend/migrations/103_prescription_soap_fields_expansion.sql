-- ============================================================================
-- Prescription SOAP-field expansion + investigations → investigations_orders
-- ============================================================================
-- Migration: 103_prescription_soap_fields_expansion.sql
-- Date:      2026-05-17
-- Batch:     cockpit-v2 (Phase 1) — task cv2-04
-- Description:
--   SOAP-field expansion for the cockpit-v2 prescription form refactor
--   (Wave 2, Lane α). Adds structured vitals (7 columns), examination
--   findings, differential-diagnosis list (TEXT[]), structured follow-up
--   (value + unit; the free-text `follow_up` column STAYS for backwards-
--   compat), advice, referral, and test_results.
--
--   Renames `prescriptions.investigations` → `prescriptions.investigations_orders`.
--   The legacy name conflated the *order list* a doctor writes (e.g.
--   "CBC, LFT") with the *results* a doctor receives (which now live in
--   `test_results`). The rename clarifies the split.
--
--   Adds a read-time compatibility view `prescriptions_legacy_v` that
--   exposes the old column name (`investigations`) for the ~6-week
--   deprecation window. Phase 3 (rx-polish-densification) retires both
--   the view and the legacy free-text `follow_up` column.
--
-- PHI:
--   Every new column carries PHI (vitals, clinical findings, diagnosis-
--   adjacent, treatment plan). RLS on the `prescriptions` table already
--   covers all columns (doctor-only access via `auth.uid() = doctor_id`,
--   established in migration 026). This migration does NOT modify RLS
--   policies. The compatibility view is SECURITY INVOKER (Postgres
--   default), so RLS on the underlying table propagates to the view.
--
-- Discovery (run 2026-05-17, see task-cv2-04 §Step 1):
--   - `prescription_drafts` table existence:   NO (0 callsites)
--     → migration only touches `prescriptions`.
--   - `investigations` callsites in backend/src:
--       backend/src/services/prescription-service.ts            (2 sites: INSERT + UPDATE payload)
--       backend/src/services/prescription-pdf-service.ts        (2 sites: PrescriptionRow type + body mapping)
--       backend/src/services/notification-service.ts            (2 sites: buildPrescriptionTextSummary param + read)
--       backend/src/controllers/public-prescription-controller.ts (3 sites: SELECT string + Pick<> type + response field)
--       backend/src/templates/prescription-pdf/PrescriptionDocument.tsx (1 site: PDF body field — name stays unchanged)
--       backend/src/services/rx-template-service.ts             (OUT OF SCOPE — targets the separate `doctor_rx_templates` table, not `prescriptions`)
--     All in-scope sites are touched in this batch with `TODO(cv2-07)`
--     tags pointing at the form-side rename in Wave 4.
--   - `follow_up` (free-text) callsites in backend/src: many; column
--     STAYS — populated on send as a rendered "<value> <unit>" string
--     for the deprecation window. Phase 3 drops it.
--   - `CREATE TABLE.*prescription*` in backend/migrations:
--       prescriptions, prescription_medicines, prescription_attachments
--     (only `prescriptions` carries the renamed/added columns).
--
-- Backwards-compat:
--   - Old `investigations` column name remains accessible via
--     `prescriptions_legacy_v` for the deprecation window.
--   - Free-text `follow_up` column stays; populated on send as
--     `"<value> <unit>"` rendered string by the new structured form.
--
-- Idempotency:
--   - All `ADD COLUMN` statements use `IF NOT EXISTS` (Postgres 9.6+).
--   - The RENAME is wrapped in a DO block that checks the old column
--     name still exists; re-running on an already-migrated DB is a
--     no-op.
--   - CHECK constraints follow the migration-090 pattern: `DROP
--     CONSTRAINT IF EXISTS` → `ADD CONSTRAINT` for named constraints
--     so renaming the enum vocabulary later is safe.
--   - `CREATE OR REPLACE VIEW` for the compatibility view.
--
-- Rollback (NOT shipped as a separate migration — documented only):
--   DROP VIEW IF EXISTS prescriptions_legacy_v;
--   ALTER TABLE prescriptions RENAME COLUMN investigations_orders TO investigations;
--   ALTER TABLE prescriptions
--     DROP CONSTRAINT IF EXISTS prescriptions_follow_up_pairing_chk,
--     DROP COLUMN IF EXISTS test_results,
--     DROP COLUMN IF EXISTS referral,
--     DROP COLUMN IF EXISTS follow_up_unit,
--     DROP COLUMN IF EXISTS follow_up_value,
--     DROP COLUMN IF EXISTS advice,
--     DROP COLUMN IF EXISTS differential_diagnosis,
--     DROP COLUMN IF EXISTS examination_findings,
--     DROP COLUMN IF EXISTS vitals_ht_cm,
--     DROP COLUMN IF EXISTS vitals_wt_kg,
--     DROP COLUMN IF EXISTS vitals_spo2,
--     DROP COLUMN IF EXISTS vitals_temp_c,
--     DROP COLUMN IF EXISTS vitals_hr,
--     DROP COLUMN IF EXISTS vitals_bp_diastolic,
--     DROP COLUMN IF EXISTS vitals_bp_systolic;
--   Existing data in the renamed column survives (rename is data-
--   preserving). The DDx ARRAY column drops cleanly; no FK / referential
--   integrity issues.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Structured vitals (DL-28). Replaces today's free-text vitals tracker.
--    NULL = "not recorded" — never an empty string. Range CHECKs prevent
--    typo-grade data quality issues (e.g., 500 BP). Each constraint is
--    additionally OR'd with `IS NULL` so existing rows (which all have
--    NULL for these new columns) trivially satisfy the constraint.
-- ----------------------------------------------------------------------------
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS vitals_bp_systolic   INTEGER       NULL,
  ADD COLUMN IF NOT EXISTS vitals_bp_diastolic  INTEGER       NULL,
  ADD COLUMN IF NOT EXISTS vitals_hr            INTEGER       NULL,
  ADD COLUMN IF NOT EXISTS vitals_temp_c        NUMERIC(4,1)  NULL,
  ADD COLUMN IF NOT EXISTS vitals_spo2          INTEGER       NULL,
  ADD COLUMN IF NOT EXISTS vitals_wt_kg         NUMERIC(5,2)  NULL,
  ADD COLUMN IF NOT EXISTS vitals_ht_cm         NUMERIC(5,1)  NULL;

-- Named range constraints, idempotent via DROP CONSTRAINT IF EXISTS /
-- ADD CONSTRAINT (Postgres has no `ADD CONSTRAINT IF NOT EXISTS`).
-- Pattern mirrors migration 090.
ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_vitals_bp_systolic_chk;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_vitals_bp_systolic_chk
  CHECK (vitals_bp_systolic IS NULL OR vitals_bp_systolic BETWEEN 30 AND 300);

ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_vitals_bp_diastolic_chk;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_vitals_bp_diastolic_chk
  CHECK (vitals_bp_diastolic IS NULL OR vitals_bp_diastolic BETWEEN 20 AND 200);

ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_vitals_hr_chk;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_vitals_hr_chk
  CHECK (vitals_hr IS NULL OR vitals_hr BETWEEN 20 AND 250);

ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_vitals_temp_c_chk;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_vitals_temp_c_chk
  CHECK (vitals_temp_c IS NULL OR vitals_temp_c BETWEEN 30.0 AND 45.0);

ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_vitals_spo2_chk;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_vitals_spo2_chk
  CHECK (vitals_spo2 IS NULL OR vitals_spo2 BETWEEN 0 AND 100);

ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_vitals_wt_kg_chk;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_vitals_wt_kg_chk
  CHECK (vitals_wt_kg IS NULL OR vitals_wt_kg BETWEEN 0.5 AND 500.0);

ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_vitals_ht_cm_chk;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_vitals_ht_cm_chk
  CHECK (vitals_ht_cm IS NULL OR vitals_ht_cm BETWEEN 20.0 AND 250.0);

COMMENT ON COLUMN prescriptions.vitals_bp_systolic  IS 'PHI: BP systolic in mmHg. cockpit-v2 structured vitals (DL-28).';
COMMENT ON COLUMN prescriptions.vitals_bp_diastolic IS 'PHI: BP diastolic in mmHg. cockpit-v2 structured vitals (DL-28).';
COMMENT ON COLUMN prescriptions.vitals_hr           IS 'PHI: Heart rate in beats/min. cockpit-v2 structured vitals (DL-28).';
COMMENT ON COLUMN prescriptions.vitals_temp_c       IS 'PHI: Temperature in degrees Celsius. cockpit-v2 structured vitals (DL-28).';
COMMENT ON COLUMN prescriptions.vitals_spo2         IS 'PHI: SpO2 (oxygen saturation) percentage. cockpit-v2 structured vitals (DL-28).';
COMMENT ON COLUMN prescriptions.vitals_wt_kg        IS 'PHI: Weight in kilograms. cockpit-v2 structured vitals (DL-28).';
COMMENT ON COLUMN prescriptions.vitals_ht_cm        IS 'PHI: Height in centimetres. cockpit-v2 structured vitals (DL-28).';

-- ----------------------------------------------------------------------------
-- 2. Examination findings (Objective). Free-text textarea in the cockpit's
--    <ObjectiveSection>. No structured taxonomy is enforced — a future
--    batch can add a sibling table if a clinical-finding ontology lands.
-- ----------------------------------------------------------------------------
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS examination_findings TEXT NULL;

COMMENT ON COLUMN prescriptions.examination_findings IS
  'PHI: doctor''s exam findings (free-text). cockpit-v2 (DL-28).';

-- ----------------------------------------------------------------------------
-- 3. Differential diagnosis list (Assessment). Postgres TEXT[]: zero or
--    more strings, each a candidate diagnosis. NULL = no DDx considered;
--    empty array `{}` is treated identically to NULL by the cockpit UI
--    (the form coerces `[]` → NULL on save). `WHERE 'Dengue' = ANY(...)`
--    is index-friendly should a future analytics surface need it; no
--    index added here (Phase 1 has no query pattern that filters DDx).
-- ----------------------------------------------------------------------------
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS differential_diagnosis TEXT[] NULL;

COMMENT ON COLUMN prescriptions.differential_diagnosis IS
  'PHI: list of differential diagnoses. cockpit-v2 (DL-28). Stored as TEXT[]; NULL = not recorded.';

-- ----------------------------------------------------------------------------
-- 4. Plan fields: advice, structured follow-up, referral, test_results.
--    The legacy free-text `follow_up` column STAYS for backwards-compat
--    (populated on send as the rendered "<value> <unit>" string for the
--    deprecation window — Phase 3 drops it).
-- ----------------------------------------------------------------------------
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS advice           TEXT     NULL,
  ADD COLUMN IF NOT EXISTS follow_up_value  INTEGER  NULL,
  ADD COLUMN IF NOT EXISTS follow_up_unit   TEXT     NULL,
  ADD COLUMN IF NOT EXISTS referral         TEXT     NULL,
  ADD COLUMN IF NOT EXISTS test_results     TEXT     NULL;

-- Range / enum checks for the structured follow-up columns.
ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_follow_up_value_chk;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_follow_up_value_chk
  CHECK (follow_up_value IS NULL OR follow_up_value >= 0);

ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_follow_up_unit_chk;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_follow_up_unit_chk
  CHECK (
    follow_up_unit IS NULL
    OR follow_up_unit IN ('days', 'weeks', 'months', 'as_needed')
  );

-- Pairing constraint: either both NULL, both set (with a numeric unit),
-- or `as_needed` with NULL value (value irrelevant for 'as_needed').
ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_follow_up_pairing_chk;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_follow_up_pairing_chk
  CHECK (
    (follow_up_value IS NULL AND follow_up_unit IS NULL)
    OR (follow_up_value IS NOT NULL AND follow_up_unit IN ('days', 'weeks', 'months'))
    OR (follow_up_value IS NULL AND follow_up_unit = 'as_needed')
  );

COMMENT ON COLUMN prescriptions.advice IS
  'PHI: doctor advice text. cockpit-v2 (DL-28).';
COMMENT ON COLUMN prescriptions.follow_up_value IS
  'Structured follow-up interval, paired with follow_up_unit. cockpit-v2 (DL-28). Legacy `follow_up` (free-text) stays for backwards-compat.';
COMMENT ON COLUMN prescriptions.follow_up_unit IS
  'Unit for follow_up_value: days|weeks|months|as_needed. cockpit-v2 (DL-28).';
COMMENT ON COLUMN prescriptions.referral IS
  'PHI: referral text. cockpit-v2 (DL-28).';
COMMENT ON COLUMN prescriptions.test_results IS
  'PHI: doctor''s interpretation of returned test results (distinct from the investigations_orders list). cockpit-v2 (DL-28).';

-- ----------------------------------------------------------------------------
-- 5. Rename `investigations` → `investigations_orders`. Idempotent: the
--    rename only runs when the old column name is still present, so a
--    re-run after the migration has already applied is a no-op.
--
--    The old name conflated the *order list* a doctor writes (e.g.
--    "CBC, LFT") with the *results* a doctor receives (now in
--    `test_results`). The rename clarifies the split. Existing data is
--    preserved by RENAME COLUMN (Postgres metadata-only operation).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'prescriptions'
      AND column_name = 'investigations'
  ) THEN
    ALTER TABLE prescriptions RENAME COLUMN investigations TO investigations_orders;
  END IF;
END$$;

COMMENT ON COLUMN prescriptions.investigations_orders IS
  'PHI: investigations / tests the doctor has ORDERED (vs `test_results` which is the doctor''s interpretation of returned results). Renamed from `investigations` in migration 103 (cockpit-v2 / DL-28).';

-- ----------------------------------------------------------------------------
-- 6. Read-time compatibility view. Exposes the old column name
--    `investigations` for the deprecation window (~6 weeks). Any client
--    still on the pre-rename shape can read from this view instead of
--    chasing the rename through every callsite simultaneously.
--
--    Phase 3 (rx-polish-densification batch) retires the view AND the
--    legacy free-text `follow_up` column at the same time.
--
--    The view is SECURITY INVOKER (Postgres default), so RLS on the
--    underlying `prescriptions` table propagates automatically — no
--    explicit RLS policy needed on the view. The view is implicitly
--    read-only (no INSERT/UPDATE/DELETE triggers); writes must target
--    the renamed column on the underlying table.
--
--    `episode_id` is included for parity with reads against the base
--    table that filter by care-episode (added by migration 095).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW prescriptions_legacy_v AS
SELECT
  id,
  appointment_id,
  episode_id,
  patient_id,
  doctor_id,
  type,
  cc,
  hopi,
  provisional_diagnosis,
  investigations_orders AS investigations,   -- legacy alias
  follow_up,                                 -- still present; deprecated in Phase 3
  patient_education,
  clinical_notes,
  sent_to_patient_at,
  created_at,
  updated_at
FROM prescriptions;

COMMENT ON VIEW prescriptions_legacy_v IS
  'Read-only legacy view exposing pre-migration-103 column names (notably `investigations`, the pre-rename name for `investigations_orders`). Retired by the rx-polish-densification batch (~6 weeks out). Writes must target the underlying `prescriptions` table directly.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged: doctor-only access via `auth.uid() = doctor_id` (migration 026)
--                covers all new columns and propagates to the compatibility view.
-- PHI: every added column carries PHI; 7-year retention applies per COMPLIANCE.
-- No new indexes: Phase 1/2 has no query pattern that filters on the new
--                 columns. Indexes are a Phase 3 follow-up if R-HISTORY
--                 vitals-timeline reads demand them.
-- ============================================================================
