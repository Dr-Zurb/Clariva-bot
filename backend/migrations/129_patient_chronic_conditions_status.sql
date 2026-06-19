-- ============================================================================
-- Patient Chronic Conditions — active / resolved status (Subjective Phase A)
-- ============================================================================
-- Migration: 129_patient_chronic_conditions_status.sql
-- Date:      2026-06-10
-- Description:
--   Adds a `status` column to patient_chronic_conditions mirroring
--   patient_medications.status (active | resolved). Existing rows default to
--   'active'. Drives the Active | Past toggle in the Subjective tab.
--
--   Also refreshes patient_problem_list_v so resolved conditions do not appear
--   in the Snapshot problem list.
-- ============================================================================

ALTER TABLE patient_chronic_conditions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'resolved'));

COMMENT ON COLUMN patient_chronic_conditions.status IS
  'active = current/ongoing problem; resolved = prior/past condition. Drives Active vs Past UI views.';

-- Refresh problem list view — chronic source excludes resolved conditions
CREATE OR REPLACE VIEW patient_problem_list_v AS

SELECT
  'chronic'::TEXT                               AS source,
  doctor_id,
  patient_id,
  condition                                     AS label,
  diagnosed_on                                  AS since_date,
  NULL::INTEGER                                 AS occurrence_count,
  NULL::TEXT                                    AS episode_status,
  NULL::INTEGER                                 AS followups_used,
  NULL::INTEGER                                 AS max_followups,
  created_at                                    AS sort_key
FROM patient_chronic_conditions
WHERE archived_at IS NULL
  AND status = 'active'

UNION ALL

SELECT
  'episode'::TEXT                               AS source,
  doctor_id,
  patient_id,
  catalog_service_key                           AS label,
  started_at::DATE                              AS since_date,
  NULL::INTEGER                                 AS occurrence_count,
  status                                        AS episode_status,
  followups_used,
  max_followups,
  created_at                                    AS sort_key
FROM care_episodes
WHERE status = 'active'

UNION ALL

SELECT
  'recurring'::TEXT                             AS source,
  doctor_id,
  patient_id,
  LOWER(TRIM(provisional_diagnosis))            AS label,
  NULL::DATE                                    AS since_date,
  COUNT(*)::INTEGER                             AS occurrence_count,
  NULL::TEXT                                    AS episode_status,
  NULL::INTEGER                                 AS followups_used,
  NULL::INTEGER                                 AS max_followups,
  MAX(created_at)                               AS sort_key
FROM prescriptions
WHERE provisional_diagnosis IS NOT NULL
  AND TRIM(provisional_diagnosis) <> ''
  AND created_at >= NOW() - INTERVAL '6 months'
GROUP BY doctor_id, patient_id, LOWER(TRIM(provisional_diagnosis))
HAVING COUNT(*) >= 2;

-- ============================================================================
-- Reverse migration:
--   CREATE OR REPLACE VIEW patient_problem_list_v ... (restore 096 definition)
--   ALTER TABLE patient_chronic_conditions DROP COLUMN IF EXISTS status;
-- ============================================================================
-- Migration Complete
-- ============================================================================
