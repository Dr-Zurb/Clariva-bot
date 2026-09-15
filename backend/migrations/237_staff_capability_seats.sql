-- ============================================================================
-- 237_staff_capability_seats.sql
-- Date: 2026-09-13
-- ============================================================================
-- Purpose:
--   Split the previsit seat so a doctor can assign vitals, history, internal
--   labs, and papers to different people. Registration & payments stay
--   front_desk. Apply after 236.
--
--   Existing `previsit` values fold into vitals + history + internal_labs +
--   papers. Leftover `billing` still folds into front_desk in the app.
--
-- Hard-rules:
--   - CHECK widen + rewrite + seat indexes. No RLS rewrite (R6).
--   - clinic_staff is NOT PHI.
--
-- Rollback (document only):
--   Map the four prep caps back to previsit, restore
--   idx_clinic_staff_one_active_previsit, drop the four new indexes.
-- ============================================================================

ALTER TABLE clinic_staff
  DROP CONSTRAINT IF EXISTS clinic_staff_capabilities_check;

ALTER TABLE clinic_staff
  ADD CONSTRAINT clinic_staff_capabilities_check
  CHECK (
    capabilities <@ ARRAY[
      'front_desk',
      'billing',
      'previsit',
      'vitals',
      'history',
      'internal_labs',
      'papers'
    ]::TEXT[]
    AND CARDINALITY(capabilities) >= 1
  );

UPDATE clinic_staff
SET capabilities = ARRAY(
  SELECT DISTINCT cap
  FROM (
    SELECT CASE
      WHEN c = 'billing' THEN 'front_desk'
      WHEN c = 'previsit' THEN NULL
      ELSE c
    END AS cap
    FROM unnest(capabilities) AS c
    UNION ALL
    SELECT 'vitals'
    FROM unnest(capabilities) AS c
    WHERE c = 'previsit'
    UNION ALL
    SELECT 'history'
    FROM unnest(capabilities) AS c
    WHERE c = 'previsit'
    UNION ALL
    SELECT 'internal_labs'
    FROM unnest(capabilities) AS c
    WHERE c = 'previsit'
    UNION ALL
    SELECT 'papers'
    FROM unnest(capabilities) AS c
    WHERE c = 'previsit'
  ) folded
  WHERE cap IS NOT NULL
    AND cap IN (
      'front_desk',
      'vitals',
      'history',
      'internal_labs',
      'papers'
    )
);

ALTER TABLE clinic_staff
  DROP CONSTRAINT IF EXISTS clinic_staff_capabilities_check;

ALTER TABLE clinic_staff
  ADD CONSTRAINT clinic_staff_capabilities_check
  CHECK (
    capabilities <@ ARRAY[
      'front_desk',
      'vitals',
      'history',
      'internal_labs',
      'papers'
    ]::TEXT[]
    AND CARDINALITY(capabilities) >= 1
  );

COMMENT ON COLUMN clinic_staff.capabilities IS
  'Staff seats: front_desk | vitals | history | internal_labs | papers. Row is authoritative (RQ2).';

DROP INDEX IF EXISTS idx_clinic_staff_one_active_previsit;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_staff_one_active_vitals
  ON clinic_staff (doctor_id)
  WHERE status = 'active' AND 'vitals' = ANY (capabilities);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_staff_one_active_history
  ON clinic_staff (doctor_id)
  WHERE status = 'active' AND 'history' = ANY (capabilities);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_staff_one_active_internal_labs
  ON clinic_staff (doctor_id)
  WHERE status = 'active' AND 'internal_labs' = ANY (capabilities);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_staff_one_active_papers
  ON clinic_staff (doctor_id)
  WHERE status = 'active' AND 'papers' = ANY (capabilities);

COMMENT ON INDEX idx_clinic_staff_one_active_vitals IS
  'At most one active vitals seat per doctor.';
COMMENT ON INDEX idx_clinic_staff_one_active_history IS
  'At most one active history seat per doctor.';
COMMENT ON INDEX idx_clinic_staff_one_active_internal_labs IS
  'At most one active internal_labs seat per doctor.';
COMMENT ON INDEX idx_clinic_staff_one_active_papers IS
  'At most one active papers seat per doctor.';
