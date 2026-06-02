-- ============================================================================
-- Doctor Rx Templates (EHR Sub-batch B1 / Task T2.11)
-- ============================================================================
-- Migration: 091_doctor_rx_templates.sql
-- Date:      2026-05-03
-- Description:
--   Per-doctor saved Rx blueprints. A template is a name + the same
--   payload shape as a prescription, minus patient-specific fields.
--   Powers the <TemplatePicker> UI shipping in T2.12 and the "save
--   current Rx as template" CTA. Per Decision T2-D2 templates are NOT
--   shared clinic-wide in v1 — strictly per-doctor (RLS enforced).
--
--   Storage:
--     - Free-text Rx fields (cc/hopi/etc.) live as their own columns,
--       mirroring the `prescriptions` table.
--     - Medicines live in `medicines_json` (JSONB) — variable-length
--       array of { drug_master_id?, name, dosage, route_code?,
--       frequency_code?, duration_value?, duration_unit?, instructions? }.
--       JSONB (not a side table) because: (a) templates are read-mostly,
--       (b) we never query *into* the medicines (the picker scans them
--       client-side after fetch), (c) wholesale rewrite on edit is fine
--       and avoids dance with a side-table delta.
--
--   Hot-path query: list templates for a doctor sorted by `last_used_at
--   DESC NULLS LAST, name ASC`. The partial index below covers it.
--
--   Auth: RLS — doctors only see / write their own rows.
-- ============================================================================

-- ============================================================================
-- 1. TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS doctor_rx_templates (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id                   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name                        TEXT NOT NULL,
    description                 TEXT NULL,
    -- Pre-fillable Rx fields (mirror `prescriptions`; all nullable so a
    -- template can be as light as a single medicine + a name).
    cc                          TEXT NULL,
    hopi                        TEXT NULL,
    provisional_diagnosis       TEXT NULL,
    investigations              TEXT NULL,
    follow_up                   TEXT NULL,
    patient_education           TEXT NULL,
    clinical_notes              TEXT NULL,
    -- Medicines payload (see docblock for shape).
    medicines_json              JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Usage telemetry — bumped atomically by `recordTemplateUse`.
    use_count                   INTEGER NOT NULL DEFAULT 0,
    last_used_at                TIMESTAMPTZ NULL,
    -- Soft delete; archived templates are hidden from the picker but
    -- preserved for history (Decision: archive, never delete).
    archived_at                 TIMESTAMPTZ NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Defensive constraint: medicines_json must be an array (the service
    -- enforces shape, but a quick DB-level guard catches accidental
    -- object-shaped inserts that would break the FE renderer).
    CONSTRAINT doctor_rx_templates_medicines_json_is_array
      CHECK (jsonb_typeof(medicines_json) = 'array'),
    CONSTRAINT doctor_rx_templates_use_count_nonneg
      CHECK (use_count >= 0),
    CONSTRAINT doctor_rx_templates_name_nonempty
      CHECK (length(trim(name)) > 0)
);

COMMENT ON TABLE  doctor_rx_templates IS
  'Per-doctor saved Rx blueprints. Picker source for T2.12. PHI-free in the sense that no patient identifiers are stored, but the medicine list IS clinical content — handled with the same care.';
COMMENT ON COLUMN doctor_rx_templates.medicines_json IS
  'JSONB array of medicine entries. Each entry mirrors the structured fields on prescription_medicines (T2.9): { drug_master_id?, name, dosage?, route_code?, frequency_code?, duration_value?, duration_unit?, instructions?, sort_order? }';
COMMENT ON COLUMN doctor_rx_templates.use_count IS
  'Bumped atomically by recordTemplateUse() each time the template is applied. Powers most-used sort in the picker.';
COMMENT ON COLUMN doctor_rx_templates.last_used_at IS
  'Set atomically alongside use_count. Picker sorts DESC on this column.';
COMMENT ON COLUMN doctor_rx_templates.archived_at IS
  'NULL = active. Non-NULL hides from picker. Deletion is soft to preserve audit / "what did I prescribe last week" recall.';

-- ============================================================================
-- 2. INDEXES
-- ============================================================================
-- The picker query is `WHERE doctor_id = $1 AND archived_at IS NULL
-- ORDER BY last_used_at DESC NULLS LAST, name ASC`. The partial index
-- below covers it (only active rows indexed; archive cleanup keeps the
-- index slim) and the trailing `name` column lets PG use a single
-- index scan for the secondary sort tiebreaker.

CREATE INDEX IF NOT EXISTS idx_doctor_rx_templates_lookup
  ON doctor_rx_templates (doctor_id, last_used_at DESC NULLS LAST, name ASC)
  WHERE archived_at IS NULL;

-- ============================================================================
-- 3. UPDATED_AT TRIGGER
-- ============================================================================

DROP TRIGGER IF EXISTS update_doctor_rx_templates_updated_at ON doctor_rx_templates;
CREATE TRIGGER update_doctor_rx_templates_updated_at
    BEFORE UPDATE ON doctor_rx_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 4. ATOMIC USAGE-COUNTER FUNCTION
-- ============================================================================
-- The picker calls this on Apply. Single round-trip, single statement,
-- so two concurrent Applies can never lose a count. Runs as
-- SECURITY DEFINER so it can update any row that matches the WHERE
-- clause; the WHERE narrows by `auth.uid() = doctor_id` so callers
-- can only bump THEIR OWN templates' counters even though the function
-- bypasses RLS.

CREATE OR REPLACE FUNCTION record_doctor_rx_template_use(template_id UUID)
RETURNS doctor_rx_templates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    updated_row doctor_rx_templates;
BEGIN
    UPDATE doctor_rx_templates
       SET use_count   = use_count + 1,
           last_used_at = now()
     WHERE id = template_id
       AND doctor_id = auth.uid()
       AND archived_at IS NULL
    RETURNING * INTO updated_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Template not found or not owned by caller'
          USING ERRCODE = 'no_data_found';
    END IF;

    RETURN updated_row;
END;
$$;

COMMENT ON FUNCTION record_doctor_rx_template_use(UUID) IS
  'Atomic use_count++ + last_used_at = now(). Owner-only via auth.uid() check inside SECURITY DEFINER body. Returns the post-update row so the picker can refresh its sort cheaply.';

-- ============================================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE doctor_rx_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doctor_rx_templates_select_own ON doctor_rx_templates;
CREATE POLICY doctor_rx_templates_select_own
ON doctor_rx_templates FOR SELECT
USING (auth.uid() = doctor_id);

DROP POLICY IF EXISTS doctor_rx_templates_insert_own ON doctor_rx_templates;
CREATE POLICY doctor_rx_templates_insert_own
ON doctor_rx_templates FOR INSERT
WITH CHECK (auth.uid() = doctor_id);

DROP POLICY IF EXISTS doctor_rx_templates_update_own ON doctor_rx_templates;
CREATE POLICY doctor_rx_templates_update_own
ON doctor_rx_templates FOR UPDATE
USING (auth.uid() = doctor_id)
WITH CHECK (auth.uid() = doctor_id);

DROP POLICY IF EXISTS doctor_rx_templates_delete_own ON doctor_rx_templates;
CREATE POLICY doctor_rx_templates_delete_own
ON doctor_rx_templates FOR DELETE
USING (auth.uid() = doctor_id);
