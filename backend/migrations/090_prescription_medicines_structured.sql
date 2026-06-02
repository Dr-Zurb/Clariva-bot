-- ============================================================================
-- Prescription Medicines: structured columns (EHR Sub-batch B1 / Task T2.9)
-- ============================================================================
-- Migration: 090_prescription_medicines_structured.sql
-- Date:      2026-05-03
-- Description:
--   Additive columns on `prescription_medicines` so the form can store
--   structured frequency / route / duration values alongside the
--   existing free-text columns. Per Decision T2-D4 the legacy free-text
--   columns (`frequency`, `route`, `duration`) STAY — the UI continues
--   to populate both for backwards compatibility (legacy rows + the
--   patient PDF + downstream views all keep working without changes).
--
--   New columns:
--     - drug_master_id   UUID NULL FK → drug_master(id)  (canonical drug pin)
--     - frequency_code   TEXT NULL  CHECK enum            (OD/BID/.../CUSTOM)
--     - duration_value   INTEGER NULL CHECK > 0
--     - duration_unit    TEXT NULL  CHECK enum            (days/.../continue)
--     - route_code       TEXT NULL  CHECK enum            (oral/.../other)
--
--   Idempotency: Postgres' ALTER TABLE ADD COLUMN gained `IF NOT EXISTS`
--   in 9.6, so we use it. The CHECK constraints are tied to the column
--   creation; re-running the migration on a partial DB (e.g. column
--   already exists from a prior partial run) is a no-op.
--
--   Hard prerequisite: migration 088 (`drug_master`) must be applied
--   first — the FK reference will fail without it. The migration runner
--   processes files in lexicographic order, so 088 → 089 → 090 is the
--   correct sequence.
-- ============================================================================

-- ============================================================================
-- 1. NEW COLUMNS (additive, all NULLABLE)
-- ============================================================================

ALTER TABLE prescription_medicines
  ADD COLUMN IF NOT EXISTS drug_master_id  UUID NULL
    REFERENCES drug_master(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS frequency_code  TEXT NULL,
  ADD COLUMN IF NOT EXISTS duration_value  INTEGER NULL,
  ADD COLUMN IF NOT EXISTS duration_unit   TEXT NULL,
  ADD COLUMN IF NOT EXISTS route_code      TEXT NULL;

-- ============================================================================
-- 2. CHECK CONSTRAINTS (kept in a second statement so re-runs after the
--    columns already exist still succeed; named so we can drop+add them
--    idempotently if the enum vocabulary changes in a follow-up).
-- ============================================================================
-- The DROP IF EXISTS / ADD pattern is the canonical idempotent approach
-- for CHECK constraints (Postgres has no `ADD CONSTRAINT IF NOT EXISTS`
-- yet). Each constraint allows NULL to keep the columns truly optional.

ALTER TABLE prescription_medicines
  DROP CONSTRAINT IF EXISTS prescription_medicines_frequency_code_check;
ALTER TABLE prescription_medicines
  ADD CONSTRAINT prescription_medicines_frequency_code_check
  CHECK (
    frequency_code IS NULL
    OR frequency_code IN ('OD','BID','TID','QID','QHS','PRN','STAT','CUSTOM')
  );

ALTER TABLE prescription_medicines
  DROP CONSTRAINT IF EXISTS prescription_medicines_duration_value_check;
ALTER TABLE prescription_medicines
  ADD CONSTRAINT prescription_medicines_duration_value_check
  CHECK (duration_value IS NULL OR duration_value > 0);

ALTER TABLE prescription_medicines
  DROP CONSTRAINT IF EXISTS prescription_medicines_duration_unit_check;
ALTER TABLE prescription_medicines
  ADD CONSTRAINT prescription_medicines_duration_unit_check
  CHECK (
    duration_unit IS NULL
    OR duration_unit IN ('days','weeks','months','until-finished','continue')
  );

ALTER TABLE prescription_medicines
  DROP CONSTRAINT IF EXISTS prescription_medicines_route_code_check;
ALTER TABLE prescription_medicines
  ADD CONSTRAINT prescription_medicines_route_code_check
  CHECK (
    route_code IS NULL
    OR route_code IN ('oral','IV','IM','SC','topical','inhaled','rectal','nasal','sublingual','other')
  );

-- ============================================================================
-- 3. INDEX on drug_master_id (FK lookup; supports T4.18 allergy-clash
--    + future analytics that group by canonical drug).
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_prescription_medicines_drug_master
  ON prescription_medicines (drug_master_id)
  WHERE drug_master_id IS NOT NULL;

-- ============================================================================
-- 4. COLUMN COMMENTS (documentation; cheap; helps anyone reading the
--    schema dump know the structured-vs-legacy split).
-- ============================================================================

COMMENT ON COLUMN prescription_medicines.drug_master_id IS
  'FK to drug_master.id when the doctor picked from the autocomplete. NULL = free-text entry (e.g. compounded preparations). Populated by T2.8 onward.';
COMMENT ON COLUMN prescription_medicines.frequency_code IS
  'Structured frequency enum (T2-D4). When set, the legacy `frequency` column carries the human-readable label for backwards compatibility.';
COMMENT ON COLUMN prescription_medicines.duration_value IS
  'Numeric component of structured duration. Pairs with `duration_unit`. Legacy `duration` column retains the human-readable string.';
COMMENT ON COLUMN prescription_medicines.duration_unit IS
  'Unit component of structured duration. ''until-finished'' / ''continue'' carry no numeric value.';
COMMENT ON COLUMN prescription_medicines.route_code IS
  'Structured route enum (T2-D4). When set, the legacy `route` column carries the human-readable label.';
