-- ============================================================================
-- 108_doctor_drug_usage.sql
-- rx-polish-favorites batch · Phase 3 · rxf-01
-- Date: 2026-05-24
-- ============================================================================
-- Purpose:
--   Per-doctor drug-prescribing frequency. Powers R-RX-POLISH/2.2 personal
--   ranking in DrugAutocomplete. Incremented on Send Rx & finish (rxf-03);
--   never on draft save. Free-text drugs (no drug_master_id) NOT counted.
--
-- Table:
--   doctor_drug_usage (
--     doctor_id        uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
--     drug_master_id   uuid    NOT NULL REFERENCES drug_master(id) ON DELETE CASCADE
--     usage_count      int     NOT NULL DEFAULT 0 CHECK (usage_count >= 0)
--     last_used_at     timestamptz NOT NULL DEFAULT now()
--     PRIMARY KEY (doctor_id, drug_master_id)
--   )
--
-- Index:
--   doctor_drug_usage_top_n_idx ON (doctor_id, usage_count DESC)
--     — supports fast top-N reads in /api/v1/doctors/me/drug-usage.
--
-- RLS:
--   Standard doctor-ownership predicate (matches doctor_settings / 009 and
--   doctor_rx_templates / 091): doctor_id = auth.uid(). Doctor B can never
--   read or write doctor A's rows.
--
-- Safety:
--   · CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS → idempotent
--     re-run on dev without errors (project convention from 098+).
--   · No per-row trigger — rxf-03 increments in app code (cheaper, explicit).
--   · No pre-seed; cold-start = empty.
--
-- Rollback:
--   DROP TABLE IF EXISTS doctor_drug_usage CASCADE;
-- ============================================================================

-- ── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS doctor_drug_usage (
  doctor_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  drug_master_id UUID NOT NULL REFERENCES drug_master(id) ON DELETE CASCADE,
  usage_count    INT  NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  last_used_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (doctor_id, drug_master_id)
);

CREATE INDEX IF NOT EXISTS doctor_drug_usage_top_n_idx
  ON doctor_drug_usage (doctor_id, usage_count DESC);

COMMENT ON TABLE doctor_drug_usage IS
  'rxf-01: per-doctor drug prescribing frequency. Powers R-RX-POLISH/2.2 personal autocomplete ranking. Incremented on Send Rx (not draft save). Free-text drugs not counted.';

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE doctor_drug_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doctor_drug_usage_owner_select ON doctor_drug_usage;
CREATE POLICY doctor_drug_usage_owner_select
  ON doctor_drug_usage
  FOR SELECT
  USING (doctor_id = auth.uid());

DROP POLICY IF EXISTS doctor_drug_usage_owner_modify ON doctor_drug_usage;
CREATE POLICY doctor_drug_usage_owner_modify
  ON doctor_drug_usage
  FOR ALL
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

-- ── Batch increment (rxf-03) ─────────────────────────────────────────────────
-- Called from the Send Rx path via service-role `.rpc()`. Single statement
-- so concurrent sends for the same doctor+drug accumulate correctly via
-- ON CONFLICT DO UPDATE. `p_doctor_id` is passed explicitly because the
-- admin client has no auth.uid() (see rx-template-service recordRxTemplateUse).

CREATE OR REPLACE FUNCTION increment_doctor_drug_usage_batch(
  p_doctor_id UUID,
  p_drug_master_ids UUID[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_drug_master_ids IS NULL OR cardinality(p_drug_master_ids) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO doctor_drug_usage (doctor_id, drug_master_id, usage_count, last_used_at)
  SELECT p_doctor_id, drug_id, 1, now()
  FROM unnest(p_drug_master_ids) AS drug_id
  ON CONFLICT (doctor_id, drug_master_id)
  DO UPDATE SET
    usage_count = doctor_drug_usage.usage_count + 1,
    last_used_at = EXCLUDED.last_used_at;
END;
$$;

COMMENT ON FUNCTION increment_doctor_drug_usage_batch(UUID, UUID[]) IS
  'rxf-03: batched usage_count++ on Send Rx. Free-text drugs excluded upstream. Not called on draft save.';
