-- ============================================================================
-- Catalog Mode: single_fee vs multi_service (Plan 03 · Task 08)
-- ============================================================================
-- Migration: 048_catalog_mode.sql
-- Date: 2026-04-16
-- Description:
--   Adds a first-class `catalog_mode` enum column to `doctor_settings` so the
--   system can distinguish "I intentionally charge one fee" from "I haven't
--   set up services yet". Later Plan 03 tasks branch on this field:
--     · Task 09 — lazily materializes a single-entry ServiceCatalogV1 for
--       single_fee rows whose service_offerings_json is still NULL.
--     · Task 10 — short-circuits the matcher / staff-review / learning /
--       clarification pipelines when the doctor is in single_fee mode.
--     · Task 12 — reads NULL to prompt the mode selector in practice setup.
--
-- Back-fill classification (applied once on first run; idempotent via
-- `WHERE catalog_mode IS NULL`):
--   1. service_offerings_json has ≥ 2 services  → 'multi_service'
--   2. service_offerings_json has exactly 1 service → 'single_fee'
--   3. no catalog but appointment_fee_minor IS NOT NULL → 'single_fee'
--      (Task 09 materializes the single-service catalog on first read.)
--   4. everything else → stays NULL (fresh onboarding; Task 12 prompts).
--
-- Safety:
--   · Additive only — no column dropped or tightened.
--   · CHECK constraint ensures raw SQL cannot insert a bogus mode.
--   · Idempotent: ADD COLUMN IF NOT EXISTS, DROP+ADD CONSTRAINT guarded by
--     IF EXISTS, back-fill gated by `WHERE catalog_mode IS NULL`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Nullable column (NULL = "undecided" for fresh onboarding).
-- ----------------------------------------------------------------------------
ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS catalog_mode TEXT DEFAULT NULL;

COMMENT ON COLUMN doctor_settings.catalog_mode IS
  'Plan 03 · Task 08: ''single_fee'' = one flat consultation fee; ''multi_service'' = per-service catalog; NULL = undecided (prompt mode selector in Task 12).';

-- ----------------------------------------------------------------------------
-- 2. CHECK constraint (re-create so running the migration a second time
--    after an in-place tweak is safe).
-- ----------------------------------------------------------------------------
ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_catalog_mode_check;

ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_catalog_mode_check
  CHECK (catalog_mode IS NULL OR catalog_mode IN ('single_fee', 'multi_service'));

-- ----------------------------------------------------------------------------
-- 3. Back-fill classification (only rows still NULL — keeps the migration
--    idempotent and avoids overwriting any mode a doctor has already picked
--    if this migration runs after Plan 03 is partially deployed).
-- ----------------------------------------------------------------------------
UPDATE doctor_settings
SET catalog_mode = CASE
  -- Case 1: populated catalog with ≥ 2 services → multi_service
  WHEN service_offerings_json IS NOT NULL
    AND jsonb_typeof(service_offerings_json -> 'services') = 'array'
    AND jsonb_array_length(service_offerings_json -> 'services') >= 2
    THEN 'multi_service'

  -- Case 2: catalog with exactly 1 service → single_fee
  WHEN service_offerings_json IS NOT NULL
    AND jsonb_typeof(service_offerings_json -> 'services') = 'array'
    AND jsonb_array_length(service_offerings_json -> 'services') = 1
    THEN 'single_fee'

  -- Case 3: no catalog but a flat fee exists → single_fee
  --   (Task 09 lazily materializes the single-service catalog on first read.)
  WHEN (
    service_offerings_json IS NULL
    OR jsonb_typeof(service_offerings_json -> 'services') <> 'array'
    OR jsonb_array_length(service_offerings_json -> 'services') = 0
  )
    AND appointment_fee_minor IS NOT NULL
    THEN 'single_fee'

  -- Case 4: fresh onboarding — neither catalog nor flat fee → stay NULL
  ELSE NULL
END
WHERE catalog_mode IS NULL;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS: No changes needed; existing doctor_settings policies cover the new
-- column (row-scoped on doctor_id).
-- Rollback: `ALTER TABLE doctor_settings DROP COLUMN catalog_mode;` (safe —
-- no other column depends on it yet; Tasks 09/10/12 land after this).
-- ============================================================================
