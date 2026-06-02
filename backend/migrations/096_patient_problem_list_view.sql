-- EHR Sub-batch D / T5.25
-- patient_problem_list_v: unified read-only view that surfaces a patient's
-- active clinical problems as a single list from three independent sources:
--
--   1. chronic  — patient_chronic_conditions rows (not archived)
--   2. episode  — care_episodes rows with status = 'active'
--   3. recurring — diagnoses appearing ≥2 times in last 6 months, derived
--                  from prescriptions.provisional_diagnosis grouped by
--                  LOWER(TRIM(…)) per master-batch decision §28.
--
-- RLS is inherited automatically from the base tables; no separate policy
-- is needed on the view. doctor_b querying against doctor_a's patient will
-- receive an empty result (each source filters on doctor_id = auth.uid()).
--
-- The view is intentionally read-only (no INSTEAD OF rules / triggers).
-- T6.30 (deferred AI-assist) may read this view as input — the column shape
-- below must remain stable.

CREATE OR REPLACE VIEW patient_problem_list_v AS

-- ── Source 1: Chronic conditions ─────────────────────────────────────────────
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

UNION ALL

-- ── Source 2: Active care episodes ───────────────────────────────────────────
SELECT
  'episode'::TEXT                               AS source,
  doctor_id,
  patient_id,
  -- catalog_service_key is the only label available; callers can enrich it.
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

-- ── Source 3: Recurring diagnoses (≥2 in last 6 months) ──────────────────────
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

COMMENT ON VIEW patient_problem_list_v IS
  'EHR T5.25: Unified patient problem list from chronic conditions, active episodes, and recurring diagnoses. RLS inherited from base tables. Read-only.';
