-- SFU-14: User-saved service catalog templates (named sets per doctor)
-- JSON shape: { "templates": [ { "id", "name", "specialty_tag?", "updated_at", "catalog" } ] }

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS service_catalog_templates_json JSONB NULL;

COMMENT ON COLUMN doctor_settings.service_catalog_templates_json IS
  'SFU-14: User-named template catalogs; validated as ServiceCatalogTemplatesJsonV1';
