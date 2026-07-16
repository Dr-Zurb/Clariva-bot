-- ============================================================================
-- Doctor-saved custom investigation orders (per-doctor vocabulary)
-- ============================================================================
-- Migration: 169_doctor_settings_investigations_custom_orders.sql
-- Date:      2026-07-13
-- Batch:     plan-investigations-library — custom orders in combobox
-- Description:
--   One additive, reversible JSONB column that stores doctor-authored custom
--   investigation order vocabulary (named baskets reused in the Plan
--   investigations combobox):
--     1. doctor_settings.investigations_custom_orders — array of
--        { id, label, members?, useCount, pinned, updatedAt } objects.
--        Empty = none. Explicit "Save to my orders" pins immediately; repeat
--        use (useCount >= 2) auto-promotes. Per-field shape is enforced in Zod,
--        NOT SQL CHECK — SQL only guards `jsonb_typeof = 'array'`.
--        Doctor-authored labels/structure only (NOT PHI). Distinct from
--        doctor_rx_templates scope `investigations_orders` (full-list presets).
--
--   No backfill (default covers existing rows). No RLS change.
--
-- PHI:
--   doctor_settings.investigations_custom_orders holds config (doctor-authored
--   labels / member labels), never patient data; RLS on `doctor_settings`
--   (migration 009) already covers all columns. This migration does NOT
--   modify RLS policies.
--
-- Idempotency:
--   `ADD COLUMN IF NOT EXISTS` (Postgres 9.6+); constraint drop+add.
--
-- Rollback (NOT shipped as a separate migration — documented only):
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_investigations_custom_orders_is_array,
--     DROP COLUMN IF EXISTS investigations_custom_orders;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. doctor_settings.investigations_custom_orders
-- ----------------------------------------------------------------------------
ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS investigations_custom_orders JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_investigations_custom_orders_is_array;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_investigations_custom_orders_is_array
  CHECK (jsonb_typeof(investigations_custom_orders) = 'array');

COMMENT ON COLUMN doctor_settings.investigations_custom_orders IS
  'plan-investigations-library: per-doctor custom investigation order vocabulary (array of { id, label, members?, useCount, pinned, updatedAt }). Doctor-authored config, not PHI; pins via explicit save or auto-promote on repeat use. Distinct from rx templates investigations_orders scope. Per-field shape enforced in Zod, not SQL CHECK.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged: doctor_settings doctor-only access (migration 009) already
--                covers the new column; no new policies.
-- PHI: doctor_settings.investigations_custom_orders is config (labels), not PHI.
-- ============================================================================
