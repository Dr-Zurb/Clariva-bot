-- ============================================================================
-- 236_visit_document_extracted_results.sql
-- Date: 2026-09-13
-- ============================================================================
-- Purpose:
--   Persist staff-confirmed lab rows on the visit document so the doctor
--   opens Objective with Reports already filled. Desk does not create a
--   prescription (DVP-DL-1). Reopens DVP-DL-5: staff extract + confirm.
--
--   Apply after 235.
--
-- Hard-rules:
--   - Additive JSONB column + CHECK. No RLS rewrite (R6).
--   - extracted_results is PHI (lab names and values).
--
-- Rollback (document only):
--   ALTER TABLE visit_documents DROP CONSTRAINT IF EXISTS
--     visit_documents_extracted_results_array_check;
--   ALTER TABLE visit_documents DROP COLUMN IF EXISTS extracted_results;
-- ============================================================================

ALTER TABLE visit_documents
  ADD COLUMN IF NOT EXISTS extracted_results JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE visit_documents
  DROP CONSTRAINT IF EXISTS visit_documents_extracted_results_array_check;

ALTER TABLE visit_documents
  ADD CONSTRAINT visit_documents_extracted_results_array_check
  CHECK (jsonb_typeof(extracted_results) = 'array');

COMMENT ON COLUMN visit_documents.extracted_results IS
  'Staff-confirmed lab panels keyed by page_id. PHI. Doctor hydrates into lab_reports_json.';
