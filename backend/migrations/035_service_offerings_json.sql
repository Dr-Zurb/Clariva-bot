-- ============================================================================
-- Service offerings catalog JSON (SFU-01)
-- ============================================================================
-- Migration: 035_service_offerings_json.sql
-- Date: 2026-03-28
-- Description:
--   Optional structured catalog per doctor: services × modalities (text /
--   voice / video) × price_minor + optional follow-up policy. See
--   utils/service-catalog-schema.ts (version 1). Legacy consultation_types
--   remains until DM/booking consume this field.
-- ============================================================================

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS service_offerings_json JSONB NULL;

COMMENT ON COLUMN doctor_settings.service_offerings_json IS
  'SFU-01: Optional ServiceCatalogV1 JSON { version: 1, services: [...] }; valid shapes enforced in API Zod.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
