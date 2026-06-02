-- ============================================================================
-- SFU-11: catalog_service_id on care_episodes + appointments
-- ============================================================================
-- Primary join for follow-up episodes uses stable UUID from service_offerings_json;
-- catalog_service_key remains for legacy rows and human-readable logs.
-- ============================================================================

ALTER TABLE care_episodes
    ADD COLUMN IF NOT EXISTS catalog_service_id UUID NULL;

COMMENT ON COLUMN care_episodes.catalog_service_id IS
  'SFU-11: service_id from doctor_settings.service_offerings_json; preferred for episode lookup.';

CREATE INDEX IF NOT EXISTS idx_care_episodes_active_service_id
    ON care_episodes(doctor_id, patient_id, catalog_service_id)
    WHERE status = 'active' AND catalog_service_id IS NOT NULL;

ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS catalog_service_id UUID NULL;

COMMENT ON COLUMN appointments.catalog_service_id IS
  'SFU-11: catalog service_id at booking; pairs with catalog_service_key.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
