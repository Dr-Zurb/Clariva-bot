-- ============================================================================
-- Prescriptions lab / imaging report headers (JSONB source)
-- ============================================================================
-- Migration: 159_prescriptions_lab_reports_json.sql
-- Date:      2026-07-08
-- Batch:     objective-reports-section (Wave 2) — task rpt-02
-- Description:
--   Adds `lab_reports_json` JSONB array to `prescriptions`. Each element is a
--   report header that GROUPS structured test-result rows into a verifiable
--   panel:
--   `{ id, kind: 'lab'|'imaging', title, reportDate?, labName?,
--      attachmentIds: string[], findings?, entryMethod: 'manual'|'extracted' }`.
--   Structured rows in `test_results_json` (migration 154) link to a header via
--   `reportId`; an unknown/absent reportId collapses to ungrouped ("Other
--   results"). The report headers/ranges do NOT leak into the derived
--   `test_results` TEXT column — that derivation stays byte-identical for equal
--   row content (OBJ-D2 / RPT-D8). Empty `lab_reports_json` is a full
--   passthrough (nothing changes for existing prescriptions). Mirrors migration
--   154 (`test_results_json`) / 150 (`examination_json`).
--
-- PHI:
--   New column carries PHI (lab/imaging report metadata + imaging findings). RLS
--   on `prescriptions` already covers all columns (doctor-only access via
--   `auth.uid() = doctor_id`, migration 026). This migration does NOT modify RLS
--   policies. 7-year retention applies per COMPLIANCE; account-deletion cascade
--   already covers `prescriptions`.
--
-- Idempotency:
--   `ADD COLUMN IF NOT EXISTS` (Postgres 9.6+); constraint drop+add. Re-running
--   this migration is a no-op.
--
-- Rollback (NOT shipped as a separate migration — documented only):
--   ALTER TABLE prescriptions
--     DROP CONSTRAINT IF EXISTS prescriptions_lab_reports_json_is_array,
--     DROP COLUMN IF EXISTS lab_reports_json;
-- ============================================================================

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS lab_reports_json JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_lab_reports_json_is_array;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_lab_reports_json_is_array
  CHECK (jsonb_typeof(lab_reports_json) = 'array');

COMMENT ON COLUMN prescriptions.lab_reports_json IS
  'PHI: lab/imaging report headers (id/kind/title/reportDate/labName/attachmentIds/findings/entryMethod) grouping test_results_json rows via reportId. Does NOT alter the derived test_results TEXT. objective-reports / rpt-02.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged: doctor-only access via `auth.uid() = doctor_id` (migration 026)
--                covers the new column.
-- PHI: column carries PHI; 7-year retention applies per COMPLIANCE.
-- ============================================================================
