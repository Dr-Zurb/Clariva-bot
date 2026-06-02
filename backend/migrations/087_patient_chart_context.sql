-- ============================================================================
-- Patient Chart Context (EHR Sub-batch A / Task T1.1)
-- ============================================================================
-- Migration: 087_patient_chart_context.sql
-- Date:      2026-05-03
-- Description:
--   Three patient-level, doctor-scoped tables that back the
--   <PatientChartPanel> surface introduced in EHR Sub-batch A:
--     - patient_allergies            (free-text allergen + severity + reaction)
--     - patient_chronic_conditions   (free-text condition + diagnosed_on)
--     - patient_vitals               (history; one row per recording)
--
--   All three tables:
--     - Are doctor-scoped (each row carries doctor_id; RLS keys on
--       auth.uid() = doctor_id; a patient seen by Dr. A and Dr. B has
--       SEPARATE rows per doctor in V1 — multi-doctor sharing is deferred).
--     - Are soft-deletable via archived_at (the standard list query filters
--       WHERE archived_at IS NULL; row stays in DB for audit trail).
--     - Have a partial index on (doctor_id, patient_id) WHERE archived_at IS
--       NULL — the chart-panel hot path.
--     - Mirror migration 026 §4's RLS shape exactly (four CRUD policies per
--       table, all keyed on auth.uid() = doctor_id).
--
--   PHI: allergens, chronic conditions, vitals readings. Doctor-only access.
--
--   Decisions referenced (see master batch plan):
--     T1-D1 patient-level data (NOT visit-level)
--     T1-D2 doctor-scoped (separate rows per doctor for the same patient)
--     T1-D3 soft delete via archived_at, not DELETE
--     §4 of master batch: chart-panel-entered vitals leave appointment_id NULL;
--                         in-call vitals carry the current appointment id
-- ============================================================================

-- ============================================================================
-- 1. TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- patient_allergies
-- Patient-level, doctor-scoped allergen list. Free text in V1; T2.7 may
-- canonicalize against drug_master in a later batch.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_allergies (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id   UUID NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
    patient_id  UUID NOT NULL REFERENCES patients(id)       ON DELETE CASCADE,
    allergen    TEXT NOT NULL,
    severity    TEXT NOT NULL DEFAULT 'unknown' CHECK (
                  severity IN ('mild', 'moderate', 'severe', 'unknown')
                ),
    reaction    TEXT NULL,
    note        TEXT NULL,
    archived_at TIMESTAMPTZ NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  patient_allergies                IS 'Patient allergies, doctor-scoped. PHI. Soft-deletable via archived_at.';
COMMENT ON COLUMN patient_allergies.allergen       IS 'Free-text allergen (e.g. "Penicillin", "Peanuts"). V1 — T2.7 may canonicalize.';
COMMENT ON COLUMN patient_allergies.severity       IS 'mild | moderate | severe | unknown. Drives banner color in T4.18 allergy clash.';
COMMENT ON COLUMN patient_allergies.reaction       IS 'Free-text reaction description (e.g. "rash", "anaphylaxis").';
COMMENT ON COLUMN patient_allergies.archived_at    IS 'Soft delete. Standard list query filters WHERE archived_at IS NULL.';

-- ----------------------------------------------------------------------------
-- patient_chronic_conditions
-- Patient-level, doctor-scoped chronic-condition list. Free text in V1;
-- ICD-10/SNOMED coding is explicitly deferred (Decision E4).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_chronic_conditions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id     UUID NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
    patient_id    UUID NOT NULL REFERENCES patients(id)     ON DELETE CASCADE,
    condition     TEXT NOT NULL,
    diagnosed_on  DATE NULL,
    note          TEXT NULL,
    archived_at   TIMESTAMPTZ NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  patient_chronic_conditions                IS 'Patient chronic conditions, doctor-scoped. PHI. Soft-deletable.';
COMMENT ON COLUMN patient_chronic_conditions.condition      IS 'Free-text condition (e.g. "Type 2 Diabetes", "Hypertension"). T6 may canonicalize later.';
COMMENT ON COLUMN patient_chronic_conditions.diagnosed_on   IS 'Approx date of diagnosis if known.';
COMMENT ON COLUMN patient_chronic_conditions.archived_at    IS 'Soft delete. Standard list query filters WHERE archived_at IS NULL.';

-- ----------------------------------------------------------------------------
-- patient_vitals
-- History; one row per recording. All vitals nullable — the doctor records
-- whatever is available. CHECK constraints fence physiologically plausible
-- ranges (defense-in-depth; service-layer Zod validation is the first line).
--
-- appointment_id NULLABLE per master-batch decision §4:
--   - Vitals captured during a call (in-call panel, T5.22) carry the current
--     appointment_id.
--   - Vitals captured from the chart panel directly (e.g. catch-up entry)
--     leave appointment_id NULL — patient-level entry, no visit context.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_vitals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    patient_id      UUID NOT NULL REFERENCES patients(id)   ON DELETE CASCADE,
    appointment_id  UUID NULL REFERENCES appointments(id)   ON DELETE SET NULL,
    bp_systolic     INTEGER       NULL CHECK (bp_systolic   BETWEEN 40 AND 300),
    bp_diastolic    INTEGER       NULL CHECK (bp_diastolic  BETWEEN 20 AND 200),
    heart_rate      INTEGER       NULL CHECK (heart_rate    BETWEEN 20 AND 250),
    temperature_c   NUMERIC(4,1)  NULL CHECK (temperature_c BETWEEN 30 AND 45),
    spo2            INTEGER       NULL CHECK (spo2          BETWEEN 50 AND 100),
    weight_kg       NUMERIC(5,2)  NULL CHECK (weight_kg     BETWEEN 0 AND 500),
    height_cm       NUMERIC(5,1)  NULL CHECK (height_cm     BETWEEN 0 AND 300),
    bmi             NUMERIC(4,1)  NULL,
    note            TEXT          NULL,
    recorded_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    archived_at     TIMESTAMPTZ   NULL,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE  patient_vitals                IS 'Patient vitals history (one row per recording). PHI. Soft-deletable.';
COMMENT ON COLUMN patient_vitals.appointment_id IS 'NULL for catch-up chart-panel entries; carries appointment id when recorded mid-call (decision §4).';
COMMENT ON COLUMN patient_vitals.bmi            IS 'BMI (kg/m^2). Persisted for trend convenience; auto-derived from weight_kg + height_cm by trigger when both present.';
COMMENT ON COLUMN patient_vitals.recorded_at    IS 'Recorded-at timestamp (may differ from created_at for back-dated entries).';
COMMENT ON COLUMN patient_vitals.archived_at    IS 'Soft delete. Standard list query filters WHERE archived_at IS NULL.';

-- ============================================================================
-- 2. INDEXES (chart-panel hot path — partial; only non-archived rows)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_patient_allergies_chart_lookup
  ON patient_allergies (doctor_id, patient_id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_patient_chronic_conditions_chart_lookup
  ON patient_chronic_conditions (doctor_id, patient_id)
  WHERE archived_at IS NULL;

-- patient_vitals: include recorded_at DESC so the "most recent reading"
-- query and the trend-modal time-window query both hit the index cleanly.
CREATE INDEX IF NOT EXISTS idx_patient_vitals_chart_lookup
  ON patient_vitals (doctor_id, patient_id, recorded_at DESC)
  WHERE archived_at IS NULL;

-- ============================================================================
-- 3. TRIGGERS
-- ============================================================================
-- DROP ... IF EXISTS before each CREATE makes this migration safe to re-run
-- on a partial dev DB (true idempotency; PostgreSQL lacks CREATE TRIGGER /
-- CREATE POLICY IF NOT EXISTS).

-- updated_at maintenance (function update_updated_at_column lives in 001)
DROP TRIGGER IF EXISTS update_patient_allergies_updated_at ON patient_allergies;
CREATE TRIGGER update_patient_allergies_updated_at
    BEFORE UPDATE ON patient_allergies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_patient_chronic_conditions_updated_at ON patient_chronic_conditions;
CREATE TRIGGER update_patient_chronic_conditions_updated_at
    BEFORE UPDATE ON patient_chronic_conditions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- BMI auto-compute on patient_vitals (Decision §26: persist over compute-on-read)
-- Only fires when both weight_kg + height_cm are present AND bmi was not
-- explicitly supplied by the caller (NEW.bmi IS NULL — manual override wins).
CREATE OR REPLACE FUNCTION patient_vitals_autocompute_bmi()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.bmi IS NULL
       AND NEW.weight_kg IS NOT NULL
       AND NEW.height_cm IS NOT NULL
       AND NEW.height_cm > 0 THEN
        NEW.bmi := ROUND(
            NEW.weight_kg / POWER(NEW.height_cm / 100.0, 2),
            1
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION patient_vitals_autocompute_bmi() IS
  'Auto-derive BMI (kg/m^2) from weight_kg + height_cm when caller leaves bmi NULL. Manual override (caller passes bmi) wins.';

DROP TRIGGER IF EXISTS patient_vitals_bmi_autocompute ON patient_vitals;
CREATE TRIGGER patient_vitals_bmi_autocompute
    BEFORE INSERT OR UPDATE OF weight_kg, height_cm, bmi ON patient_vitals
    FOR EACH ROW
    EXECUTE FUNCTION patient_vitals_autocompute_bmi();

-- ============================================================================
-- 4. ROW LEVEL SECURITY (mirrors migration 026 §4 shape exactly)
-- ============================================================================

ALTER TABLE patient_allergies            ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_chronic_conditions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_vitals               ENABLE ROW LEVEL SECURITY;

-- DROP ... IF EXISTS guards make the policy block re-runnable on a partial DB.

-- ----------------------------------------------------------------------------
-- patient_allergies policies: doctor owns via doctor_id
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can read own patient allergies"   ON patient_allergies;
DROP POLICY IF EXISTS "Users can insert own patient allergies" ON patient_allergies;
DROP POLICY IF EXISTS "Users can update own patient allergies" ON patient_allergies;
DROP POLICY IF EXISTS "Users can delete own patient allergies" ON patient_allergies;

CREATE POLICY "Users can read own patient allergies"
ON patient_allergies FOR SELECT
USING (auth.uid() = doctor_id);

CREATE POLICY "Users can insert own patient allergies"
ON patient_allergies FOR INSERT
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Users can update own patient allergies"
ON patient_allergies FOR UPDATE
USING (auth.uid() = doctor_id)
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Users can delete own patient allergies"
ON patient_allergies FOR DELETE
USING (auth.uid() = doctor_id);

-- ----------------------------------------------------------------------------
-- patient_chronic_conditions policies: doctor owns via doctor_id
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can read own patient chronic conditions"   ON patient_chronic_conditions;
DROP POLICY IF EXISTS "Users can insert own patient chronic conditions" ON patient_chronic_conditions;
DROP POLICY IF EXISTS "Users can update own patient chronic conditions" ON patient_chronic_conditions;
DROP POLICY IF EXISTS "Users can delete own patient chronic conditions" ON patient_chronic_conditions;

CREATE POLICY "Users can read own patient chronic conditions"
ON patient_chronic_conditions FOR SELECT
USING (auth.uid() = doctor_id);

CREATE POLICY "Users can insert own patient chronic conditions"
ON patient_chronic_conditions FOR INSERT
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Users can update own patient chronic conditions"
ON patient_chronic_conditions FOR UPDATE
USING (auth.uid() = doctor_id)
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Users can delete own patient chronic conditions"
ON patient_chronic_conditions FOR DELETE
USING (auth.uid() = doctor_id);

-- ----------------------------------------------------------------------------
-- patient_vitals policies: doctor owns via doctor_id
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can read own patient vitals"   ON patient_vitals;
DROP POLICY IF EXISTS "Users can insert own patient vitals" ON patient_vitals;
DROP POLICY IF EXISTS "Users can update own patient vitals" ON patient_vitals;
DROP POLICY IF EXISTS "Users can delete own patient vitals" ON patient_vitals;

CREATE POLICY "Users can read own patient vitals"
ON patient_vitals FOR SELECT
USING (auth.uid() = doctor_id);

CREATE POLICY "Users can insert own patient vitals"
ON patient_vitals FOR INSERT
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Users can update own patient vitals"
ON patient_vitals FOR UPDATE
USING (auth.uid() = doctor_id)
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Users can delete own patient vitals"
ON patient_vitals FOR DELETE
USING (auth.uid() = doctor_id);

-- ============================================================================
-- 5. VERIFICATION (post-deploy sanity checks; run as needed in psql)
-- ============================================================================
-- After applying, run as a doctor's auth.uid() to confirm RLS:
--
--   -- as doctor_a:
--   INSERT INTO patient_allergies (doctor_id, patient_id, allergen, severity)
--     VALUES (auth.uid(), '<shared-patient-uuid>', 'Penicillin', 'severe');
--
--   -- as doctor_b (different JWT):
--   SELECT * FROM patient_allergies
--     WHERE patient_id = '<shared-patient-uuid>';
--   -- Expected: 0 rows (doctor_b cannot see doctor_a's allergy row).
--
--   -- soft-delete sanity:
--   UPDATE patient_allergies SET archived_at = now() WHERE id = '<id>';
--   SELECT * FROM patient_allergies
--     WHERE patient_id = '<shared-patient-uuid>' AND archived_at IS NULL;
--   -- Expected: row absent (still in DB; query excludes archived).
--
--   -- BMI auto-compute sanity:
--   INSERT INTO patient_vitals (doctor_id, patient_id, weight_kg, height_cm)
--     VALUES (auth.uid(), '<patient-uuid>', 70, 170)
--     RETURNING bmi;
--   -- Expected: 24.2 (70 / 1.7^2 = 24.221..., rounded to 24.2)
--
-- ============================================================================
-- Reverse migration (drop in reverse dependency order):
--
--   DROP TRIGGER IF EXISTS patient_vitals_bmi_autocompute              ON patient_vitals;
--   DROP FUNCTION IF EXISTS patient_vitals_autocompute_bmi();
--   DROP TRIGGER IF EXISTS update_patient_chronic_conditions_updated_at ON patient_chronic_conditions;
--   DROP TRIGGER IF EXISTS update_patient_allergies_updated_at         ON patient_allergies;
--   DROP TABLE IF EXISTS patient_vitals;
--   DROP TABLE IF EXISTS patient_chronic_conditions;
--   DROP TABLE IF EXISTS patient_allergies;
--
-- (Indexes + policies drop with the tables.)
-- ============================================================================
-- Migration Complete
-- ============================================================================
