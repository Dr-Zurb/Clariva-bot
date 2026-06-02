# Reference — System service catalog starter templates (SFU-13)

**Purpose:** List of **bundled** starter templates (India-first specialties). Each template is a valid **`ServiceCatalogV1`** validated at app load via `safeParseServiceCatalogV1` in `frontend/lib/service-catalog-starter-templates/registry.ts`.

**Source of truth (code):**

- Data: `frontend/lib/service-catalog-starter-templates/data.ts` (`RAW_STARTER_TEMPLATE_ROWS`)
- Export: `frontend/lib/service-catalog-starter-templates/index.ts` (`STARTER_SERVICE_TEMPLATES`, `STARTER_SPECIALTY_LABELS`, `getStarterTemplateById`)
- UI: `frontend/components/practice-setup/StarterTemplatesModal.tsx` · Services catalog page

**Rules:**

- `specialtyLabel` must match a string from **`MEDICAL_SPECIALTIES`** (India region) where we want Practice Info alignment.
- Prices are **placeholders** (round main-currency amounts × 100 as `price_minor`). Practices must edit before relying on them.
- Each offering uses **text, voice, and video** enabled with **per-modality** list prices; **video** often carries a **percent** follow-up discount sample; text/voice follow-up policy `null` in v1 packs.

## Shipped templates (v1)

| `id` | Specialty label (Practice Info) | Title |
|------|----------------------------------|--------|
| `in-general-medicine-basic` | General Medicine | General medicine — common consults |
| `in-general-physician-basic` | General Physician | General physician — OP-style teleconsults |
| `in-general-practice-basic` | General Practice | General practice — starter pack |
| `in-family-medicine-basic` | Family Medicine | Family medicine — teleconsult starter |
| `in-pediatrics-basic` | Pediatrics | Pediatrics — child teleconsult starter |
| `in-dermatology-basic` | Dermatology | Dermatology — skin consult starter |
| `in-obgyn-basic` | Obstetrics and Gynaecology | Obstetrics & gynaecology — teleconsult starter |
| `in-cardiology-basic` | Cardiology | Cardiology — teleconsult starter |

**Count:** 8 templates · 3 services each · **24 offerings** total.

## Adding / changing a template

1. Edit `data.ts` (unique `service_id` UUIDs and `service_key` slugs; no duplicates in one catalog).
2. Run `npx tsc --noEmit` in `frontend/` — invalid catalogs throw when loading `registry.ts` during build.
3. Update this table and **SFU-13** task if scope changes.

---

**Last updated:** 2026-03-29 (SFU-13 v1 implementation)
