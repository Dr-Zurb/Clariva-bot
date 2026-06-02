-- ============================================================================
-- Drug Master lookup (EHR Sub-batch B1 / Task T2.7)
-- ============================================================================
-- Migration: 088_drug_master.sql
-- Date:      2026-05-03
-- Description:
--   Read-only lookup table backing the <DrugAutocomplete> doctor-side
--   surface introduced in EHR Sub-batch B1. Powers fast prefix + fuzzy
--   search over a curated list of Indian-market drugs (generic + brand
--   names + canonical strength / form / route).
--
--   Seed lives in 089_drug_master_seed.sql (separate migration so the
--   schema and the data ship in independent reviewable diffs).
--
--   Auth model:
--     - SELECT is open to *all* authenticated callers (RLS policy
--       drug_master_read_all USING (true)). It's a lookup, not PHI.
--     - INSERT / UPDATE / DELETE have NO policy → only the service-role
--       key can write (Supabase admin client). Doctors never write here.
--
--   Why pg_trgm:
--     ILIKE 'para%' covers the prefix case (priority 1 + 2). pg_trgm
--     covers typo tolerance ("paracetomol" → "Paracetamol") via
--     similarity ordering. Both surfaces hit the same indexes; the
--     service layer composes them with `or` + ordering.
--
--   Decisions referenced (see plan-t2-ehr-speed.md):
--     T2-D1   hand-curated seed (NOT RxNorm import, at least in V1)
--     T2-D4   structured frequency / route / duration use enums (T2.9
--             adds those columns to prescription_medicines, but the
--             canonical drug record + its FK target lives here)
-- ============================================================================

-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================
-- Enable pg_trgm globally. Required for the GIN trigram index below; safe
-- to run multiple times. First time the codebase needs this extension.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- 2. TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS drug_master (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    generic_name    TEXT NOT NULL,
    brand_names     TEXT[] NOT NULL DEFAULT '{}',
    strength        TEXT NULL,
    form            TEXT NULL,
    route_default   TEXT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  drug_master                IS 'Curated drug lookup; powers <DrugAutocomplete>. Lookup data, not PHI.';
COMMENT ON COLUMN drug_master.generic_name   IS 'Canonical generic name (e.g. "Paracetamol"). Display priority 1 in autocomplete.';
COMMENT ON COLUMN drug_master.brand_names    IS 'Indian-market brand names (e.g. ["Crocin","Calpol","Dolo"]). Searched via ANY() / GIN.';
COMMENT ON COLUMN drug_master.strength       IS 'Default strength (e.g. "500mg"). Pre-fills MedicineRow.dosage when row picked.';
COMMENT ON COLUMN drug_master.form           IS 'Dosage form: tablet | syrup | capsule | injection | drops | ointment | …';
COMMENT ON COLUMN drug_master.route_default  IS 'Default route: oral | IV | IM | SC | topical | inhaled | rectal | nasal | sublingual | other.';

-- ============================================================================
-- 3. INDEXES
-- ============================================================================

-- Trigram index on generic_name — backs both prefix-ILIKE and similarity().
CREATE INDEX IF NOT EXISTS idx_drug_master_generic_trgm
  ON drug_master USING gin (generic_name gin_trgm_ops);

-- Plain ILIKE index on lower(generic_name) for fast prefix lookup. The
-- trigram index above ALSO accelerates ILIKE; keeping both is cheap on a
-- small lookup table and makes EXPLAIN clearer for prefix-only queries.
CREATE INDEX IF NOT EXISTS idx_drug_master_generic_lower
  ON drug_master (lower(generic_name) text_pattern_ops);

-- GIN over the brand_names text[] for the ANY(brand_names ILIKE …) path.
-- We index the array directly (so `&&` / containment works) and rely on
-- service-layer expansion for prefix matches (per-element ILIKE via
-- `EXISTS (SELECT 1 FROM unnest(brand_names) b WHERE b ILIKE …)`).
CREATE INDEX IF NOT EXISTS idx_drug_master_brands_gin
  ON drug_master USING gin (brand_names);

-- ============================================================================
-- 4. TRIGGERS
-- ============================================================================
-- updated_at maintenance — keep parity with other tables in the schema.
-- (Function update_updated_at_column lives in migration 001.)

DROP TRIGGER IF EXISTS update_drug_master_updated_at ON drug_master;
CREATE TRIGGER update_drug_master_updated_at
    BEFORE UPDATE ON drug_master
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================================
-- SELECT: open to all authenticated callers (drug_master is a lookup, not PHI).
-- INSERT/UPDATE/DELETE: no policy → only the service role can write.

ALTER TABLE drug_master ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drug_master_read_all ON drug_master;
CREATE POLICY drug_master_read_all
ON drug_master FOR SELECT
USING (true);
