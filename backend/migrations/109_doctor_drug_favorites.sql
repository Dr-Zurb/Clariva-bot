-- ============================================================================
-- 109_doctor_drug_favorites.sql
-- rx-polish-favorites batch · Phase 3 · rxf-02
-- Date: 2026-05-24
-- ============================================================================
-- Purpose:
--   Per-doctor saved medicine row templates ("favorites"). Tapping a favorite
--   chip in <PlanSection> appends a pre-filled medicine row. R-RX-POLISH/2.3.
--
-- Table:
--   doctor_drug_favorites (
--     id          uuid    PRIMARY KEY DEFAULT gen_random_uuid()
--     doctor_id   uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
--     name        text    NOT NULL CHECK (length(name) BETWEEN 1 AND 60)
--     template    jsonb   NOT NULL  -- matches MedicineRowValue shape
--     created_at  timestamptz NOT NULL DEFAULT now()
--     updated_at  timestamptz NOT NULL DEFAULT now()
--   )
--
-- Index:
--   doctor_drug_favorites_doctor_idx ON (doctor_id, created_at DESC)
--
-- 30-max-per-doctor:
--   Postgres forbids subqueries in CHECK constraints. The backend service
--   (rxf-04) returns 400 before insert if the doctor already has 30. The
--   client side hides the [+ Save] button when at cap.
--
-- RLS: standard doctor-ownership (doctor_id = auth.uid()).
--
-- Rollback:
--   DROP TABLE IF EXISTS doctor_drug_favorites CASCADE;
-- ============================================================================

CREATE TABLE IF NOT EXISTS doctor_drug_favorites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  template    jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS doctor_drug_favorites_doctor_idx
  ON doctor_drug_favorites (doctor_id, created_at DESC);

ALTER TABLE doctor_drug_favorites
  DROP CONSTRAINT IF EXISTS doctor_drug_favorites_template_shape_check;
ALTER TABLE doctor_drug_favorites
  ADD CONSTRAINT doctor_drug_favorites_template_shape_check CHECK (
    jsonb_typeof(template) = 'object'
    AND template ? 'medicineName'
    AND template ? 'dosage'
  );

COMMENT ON TABLE doctor_drug_favorites IS
  'rxf-02: per-doctor saved medicine row templates. Max 30 enforced in app layer (rxf-04). template JSONB matches MedicineRowValue.';

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE doctor_drug_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doctor_drug_favorites_owner_select ON doctor_drug_favorites;
CREATE POLICY doctor_drug_favorites_owner_select
  ON doctor_drug_favorites
  FOR SELECT
  USING (doctor_id = auth.uid());

DROP POLICY IF EXISTS doctor_drug_favorites_owner_modify ON doctor_drug_favorites;
CREATE POLICY doctor_drug_favorites_owner_modify
  ON doctor_drug_favorites
  FOR ALL
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());
