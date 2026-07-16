-- ============================================================================
-- 164_diagnosis_catalog_search_fn.sql
-- assessment-tab · Wave 6 · task asmt-06 (ICD-coded diagnosis entry)
-- Date: 2026-07-11
-- ============================================================================
-- Server-side candidate search for `diagnosis_catalog`.
--
-- WHY: migration 163 grows the catalog to ~18k rows. The autocomplete service
-- used to `SELECT *` and rank in TypeScript — fine at 63 rows, broken at 18k
-- (PostgREST caps a table read at 1000 rows, and shipping the whole table on
-- every keystroke is wasteful). This function narrows the table to a small
-- ranked CANDIDATE set using the pg_trgm / prefix / synonym indexes; the
-- service still does the final fine-grained scoring in TS over that candidate
-- set (so its ranking unit tests stay meaningful).
--
-- Matching: ICD code prefix, title substring (ILIKE), title trigram similarity,
--   and per-synonym substring / trigram. Ordered code-exact → code-prefix →
--   title-exact → title-prefix → best trigram similarity → shortest title.
--
-- SECURITY: SECURITY INVOKER — the caller's RLS applies. diagnosis_catalog is a
--   NON-PHI public code list with a read-all policy (migration 162), so this is
--   safe to expose to authenticated/anon. `search_path` is pinned.
--
-- PHI: NONE. Reads only the public code list; takes a search string (the doctor
--   never types PHI here — it's a diagnosis lookup) and returns catalog rows.
--
-- Idempotency: CREATE INDEX IF NOT EXISTS + CREATE OR REPLACE FUNCTION + GRANT.
-- Rollback (documented only — not shipped):
--   DROP FUNCTION IF EXISTS search_diagnosis_catalog(text, integer);
--   DROP INDEX IF EXISTS idx_diagnosis_catalog_code_lower_pattern;
-- ============================================================================

-- Supports `lower(code) LIKE 'ba%'` prefix probes regardless of DB collation.
CREATE INDEX IF NOT EXISTS idx_diagnosis_catalog_code_lower_pattern
  ON diagnosis_catalog (lower(code) text_pattern_ops);

CREATE OR REPLACE FUNCTION search_diagnosis_catalog(
  search_query   text,
  candidate_limit integer DEFAULT 200
)
RETURNS SETOF diagnosis_catalog
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH p AS (
    SELECT
      btrim(coalesce(search_query, ''))         AS raw,
      lower(btrim(coalesce(search_query, '')))  AS q
  )
  SELECT d.*
  FROM diagnosis_catalog d, p
  WHERE length(p.q) >= 2
    AND (
      lower(d.code) LIKE p.q || '%'
      OR d.title ILIKE '%' || p.raw || '%'
      OR d.title % p.raw
      OR EXISTS (
        SELECT 1 FROM unnest(d.synonyms) syn
        WHERE syn ILIKE '%' || p.raw || '%' OR syn % p.raw
      )
    )
  ORDER BY
    (lower(d.code) = p.q) DESC,
    (lower(d.code) LIKE p.q || '%') DESC,
    (lower(d.title) = p.q) DESC,
    (lower(d.title) LIKE p.q || '%') DESC,
    GREATEST(
      similarity(d.title, p.raw),
      COALESCE((SELECT max(similarity(syn, p.raw)) FROM unnest(d.synonyms) syn), 0)
    ) DESC,
    length(d.title) ASC,
    d.title ASC
  LIMIT LEAST(GREATEST(coalesce(candidate_limit, 200), 1), 500);
$$;

COMMENT ON FUNCTION search_diagnosis_catalog(text, integer) IS
  'assessment-tab / asmt-06 — ranked candidate search over diagnosis_catalog (NON-PHI ICD-11 lookup). Final scoring is refined in the service layer.';

-- Public non-PHI lookup: callable by any session (mirrors the read-all policy).
GRANT EXECUTE ON FUNCTION search_diagnosis_catalog(text, integer)
  TO anon, authenticated, service_role;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Adds a candidate-search function + code-prefix index for diagnosis_catalog.
-- NON-PHI; no prescriptions table or RLS touched.
-- ============================================================================
