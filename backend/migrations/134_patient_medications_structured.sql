-- ============================================================================
-- Patient Medications — structured sig + stop timing (chart med redesign)
-- ============================================================================
-- Migration: 134_patient_medications_structured.sql
-- Date:      2026-06-11
-- Description:
--   Structured columns for Medical history chart medications (distinct from
--   prescription_medicines / migration 133):
--     - strength         TEXT NULL     — drug strength ("500 mg")
--     - dose_qty         NUMERIC NULL  — per-dose quantity ("2" in "2 tab")
--     - dose_unit        TEXT NULL     — tab | cap | spoon | ...
--     - frequency_code   TEXT NULL     — OD | BID | TID | QID | QHS | PRN | STAT
--     - form             TEXT NULL
--     - drug_master_id   UUID NULL FK → drug_master(id)
--     - stopped_ago_value INTEGER NULL — relative stop / gap duration
--     - stopped_ago_unit  TEXT NULL    — days | weeks | months | years
--     - stop_reason       TEXT NULL    — resolved | side_effects | cost | patient_choice | other
--
--   Legacy free-text `dose` / `frequency` STAY — UI mirrors strength and
--   human-readable frequency for backward compatibility.
-- ============================================================================

ALTER TABLE patient_medications
  ADD COLUMN IF NOT EXISTS strength          TEXT NULL,
  ADD COLUMN IF NOT EXISTS dose_qty          NUMERIC(6,2) NULL,
  ADD COLUMN IF NOT EXISTS dose_unit           TEXT NULL,
  ADD COLUMN IF NOT EXISTS frequency_code      TEXT NULL,
  ADD COLUMN IF NOT EXISTS form                TEXT NULL,
  ADD COLUMN IF NOT EXISTS drug_master_id      UUID NULL
    REFERENCES drug_master(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stopped_ago_value   INTEGER NULL,
  ADD COLUMN IF NOT EXISTS stopped_ago_unit    TEXT NULL,
  ADD COLUMN IF NOT EXISTS stop_reason         TEXT NULL;

ALTER TABLE patient_medications
  DROP CONSTRAINT IF EXISTS patient_medications_dose_qty_check;
ALTER TABLE patient_medications
  ADD CONSTRAINT patient_medications_dose_qty_check
  CHECK (dose_qty IS NULL OR dose_qty > 0);

ALTER TABLE patient_medications
  DROP CONSTRAINT IF EXISTS patient_medications_dose_unit_check;
ALTER TABLE patient_medications
  ADD CONSTRAINT patient_medications_dose_unit_check
  CHECK (
    dose_unit IS NULL
    OR dose_unit IN ('tab','cap','ml','spoon','drops','puff','sachet','unit','application')
  );

ALTER TABLE patient_medications
  DROP CONSTRAINT IF EXISTS patient_medications_frequency_code_check;
ALTER TABLE patient_medications
  ADD CONSTRAINT patient_medications_frequency_code_check
  CHECK (
    frequency_code IS NULL
    OR frequency_code IN ('OD','BID','TID','QID','QHS','PRN','STAT','CUSTOM')
  );

ALTER TABLE patient_medications
  DROP CONSTRAINT IF EXISTS patient_medications_stopped_ago_value_check;
ALTER TABLE patient_medications
  ADD CONSTRAINT patient_medications_stopped_ago_value_check
  CHECK (stopped_ago_value IS NULL OR stopped_ago_value > 0);

ALTER TABLE patient_medications
  DROP CONSTRAINT IF EXISTS patient_medications_stopped_ago_unit_check;
ALTER TABLE patient_medications
  ADD CONSTRAINT patient_medications_stopped_ago_unit_check
  CHECK (
    stopped_ago_unit IS NULL
    OR stopped_ago_unit IN ('days','weeks','months','years')
  );

ALTER TABLE patient_medications
  DROP CONSTRAINT IF EXISTS patient_medications_stop_reason_check;
ALTER TABLE patient_medications
  ADD CONSTRAINT patient_medications_stop_reason_check
  CHECK (
    stop_reason IS NULL
    OR stop_reason IN ('resolved','side_effects','cost','patient_choice','other')
  );

CREATE INDEX IF NOT EXISTS idx_patient_medications_drug_master
  ON patient_medications (drug_master_id)
  WHERE drug_master_id IS NOT NULL;

COMMENT ON COLUMN patient_medications.strength IS
  'Drug strength (e.g. "500 mg"). Legacy `dose` may mirror this for older readers.';
COMMENT ON COLUMN patient_medications.dose_qty IS
  'Per-administration quantity (e.g. 2 in "2 tab BD").';
COMMENT ON COLUMN patient_medications.dose_unit IS
  'Unit per dose: tab | cap | ml | spoon | drops | puff | sachet | unit | application.';
COMMENT ON COLUMN patient_medications.frequency_code IS
  'Structured frequency (OD/BID/…/PRN). Legacy `frequency` carries readable label.';
COMMENT ON COLUMN patient_medications.stopped_ago_value IS
  'When status=past: how long ago the patient stopped / has been off this med.';
COMMENT ON COLUMN patient_medications.stop_reason IS
  'Why stopped: resolved | side_effects | cost | patient_choice | other.';

-- ============================================================================
-- Reverse migration:
--   ALTER TABLE patient_medications
--     DROP COLUMN IF EXISTS strength,
--     DROP COLUMN IF EXISTS dose_qty,
--     DROP COLUMN IF EXISTS dose_unit,
--     DROP COLUMN IF EXISTS frequency_code,
--     DROP COLUMN IF EXISTS form,
--     DROP COLUMN IF EXISTS drug_master_id,
--     DROP COLUMN IF EXISTS stopped_ago_value,
--     DROP COLUMN IF EXISTS stopped_ago_unit,
--     DROP COLUMN IF EXISTS stop_reason;
-- ============================================================================
