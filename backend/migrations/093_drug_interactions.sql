-- ============================================================================
-- Drug Interactions schema (EHR Sub-batch C / Task C.2 / T4.19)
-- ============================================================================
-- Migration: 093_drug_interactions.sql
-- Date:      2026-05-04
-- Depends on: 088_drug_master.sql  (drug_master table referenced by FKs)
-- ============================================================================
-- Creates `drug_interactions` — a lookup table of clinically significant
-- drug-drug interaction (DDI) pairs. Consumed by:
--   GET /api/v1/drug-interactions/check?ids=<uuid,…>  (C.2 endpoint)
--   <InteractionChips>   (C.3 / T4.20)
--   <PrescriptionPreSendCheck>  (C.4 / T4.21)
--
-- Design highlights
-- -----------------
-- 1. Canonical pair ordering enforced at the DB level:
--      CHECK (drug_a_id < drug_b_id) + UNIQUE (drug_a_id, drug_b_id).
--    Inserts must use LEAST/GREATEST; the service normalises query pairs.
--    This prevents a pair appearing twice in opposite order.
--
-- 2. Severity scale (Decision §20 LOCKED):
--      minor | moderate | major | contraindicated
--    Matches BNF / FDA convention; displayed with colour coding by the UI.
--
-- 3. RLS: SELECT open (USING true) — no PHI in this table.
--    Writes are service-role only (no INSERT policy for auth'd role).
--    The check endpoint gates access by doctor JWT at the API layer.
--
-- 4. Indexes:
--    - Covering (drug_a_id, drug_b_id): primary lookup for the check query.
--    - drug_a_id, drug_b_id individually: future "all interactions for
--      drug X" queries (drug profile page, V2).
--
-- Rollback (run manually if reverting this migration):
--   DROP TABLE IF EXISTS drug_interactions CASCADE;
-- ============================================================================

-- § 1 — Table

CREATE TABLE IF NOT EXISTS drug_interactions (
  id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  drug_a_id      uuid        NOT NULL REFERENCES drug_master(id) ON DELETE CASCADE,
  drug_b_id      uuid        NOT NULL REFERENCES drug_master(id) ON DELETE CASCADE,

  -- Severity (4-value scale, Decision §20).  Values intentionally kept as
  -- checked TEXT (not a PG enum) so Supabase clients and migrations can
  -- compare without type casting.
  severity       text        NOT NULL,

  -- Clinical text (not PHI — generic drug interaction data from BNF/Beers).
  description    text        NOT NULL,   -- mechanism / interaction summary
  recommendation text        NOT NULL,   -- clinical action guidance
  source         text        NOT NULL DEFAULT '',  -- source note / reference
  source_url     text,                  -- URL to primary source (nullable)

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT drug_interactions_pkey
    PRIMARY KEY (id),

  -- Canonical pair ordering: the smaller UUID is always drug_a_id.
  -- Enforced here so even a careless seed script can't violate ordering.
  CONSTRAINT drug_interactions_ordered_pair
    CHECK (drug_a_id < drug_b_id),

  -- One row per ordered pair; duplicate pairs (same drugs, same order) are
  -- rejected. ON CONFLICT DO NOTHING in the seed handles idempotency.
  CONSTRAINT drug_interactions_unique_pair
    UNIQUE (drug_a_id, drug_b_id),

  CONSTRAINT drug_interactions_severity_check
    CHECK (severity IN ('minor', 'moderate', 'major', 'contraindicated'))
);

COMMENT ON TABLE drug_interactions IS
  'Clinically significant DDI pairs (BNF/Beers). '
  'Severity: minor|moderate|major|contraindicated. '
  'Read open; writes service-role only.';

-- § 2 — Indexes

-- Primary check-endpoint lookup: (drug_a_id, drug_b_id) pairs.
CREATE INDEX IF NOT EXISTS drug_interactions_pair_idx
  ON drug_interactions (drug_a_id, drug_b_id);

-- Individual column indexes for future single-drug profile queries.
CREATE INDEX IF NOT EXISTS drug_interactions_a_idx
  ON drug_interactions (drug_a_id);

CREATE INDEX IF NOT EXISTS drug_interactions_b_idx
  ON drug_interactions (drug_b_id);

-- § 3 — Row Level Security

ALTER TABLE drug_interactions ENABLE ROW LEVEL SECURITY;

-- Read is open — no PHI in this table.  The API endpoint applies its own
-- doctor-JWT gate (authenticateToken middleware) before reaching the DB.
CREATE POLICY drug_interactions_read_all
  ON drug_interactions
  FOR SELECT
  USING (true);

-- No INSERT / UPDATE / DELETE policy for the authenticated / anon role.
-- All writes go through service-role (seed migrations, admin tooling).
