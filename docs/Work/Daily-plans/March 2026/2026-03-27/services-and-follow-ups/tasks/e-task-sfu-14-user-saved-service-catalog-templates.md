# SFU-14: User-saved service catalog templates (named sets)

## 2026-03-29 — Doctors save, name, and re-apply their own catalogs

---

## 📋 Task Overview

**Problem:** **SFU-13** covers **system** starters by specialty. Practices also want to **reuse** their own configurations — same or multiple locations, seasonal packs, or iteration without losing a known-good catalog.

**Goal:** Allow each doctor (tenant scope as today’s `doctor_settings`) to **save** the **current** `service_offerings_json` (or equivalent editor state) as a **named template**, **list** / **rename** / **delete** templates, and **apply** a saved template into the editor with the same safety prompts as starters (**replace** confirm when catalog non-empty).

**Estimated Time:** 2–5 days (persistence + validation + UI + tests)  
**Status:** ✅ **Done** (2026-03-29)

**Change Type:**

- [x] **New** — settings payload + DB column (`service_catalog_templates_json` JSONB)
- [x] **Update** — `patchDoctorSettings` / `validation.ts` / FE types

**Dependencies:** **SFU-01**; **SFU-06**; **SFU-13** — shared apply confirm: `frontend/lib/confirm-replace-service-catalog.ts`.  
**Related:** `ServiceCatalogEditor`, `service-catalog-schema.ts`, `UserSavedTemplatesModal.tsx`.

**Reference (code anchors):**

- `backend/migrations/039_service_catalog_templates_json.sql`
- `backend/src/utils/service-catalog-schema.ts` — `userSavedServiceTemplateSchema`, `parseServiceCatalogTemplatesJson`
- `backend/src/services/doctor-settings-service.ts` — SELECT/UPDATE, normalize
- `backend/src/utils/validation.ts` — `patchDoctorSettings` Zod
- `frontend/types/doctor-settings.ts` — `DoctorSettings`, `PatchDoctorSettingsPayload`
- `frontend/app/dashboard/settings/practice-setup/services-catalog/page.tsx` — **My templates** entry + modal

---

## Design summary

| Concept | Role |
|--------|------|
| **User template** | `{ id: uuid, name: string, specialty_tag?: string | null, updated_at: iso, catalog: ServiceOffering[] }` — `catalog` same shape as `service_offerings_json`. |
| **Storage** | JSON column on `doctor_settings`: `{ "templates": [ ... ] }` — max **20** templates (`MAX_USER_SAVED_TEMPLATES`). |
| **Save** | “**Save current catalog as template**” → modal for **name** (required), optional **tag** (specialty hint for user’s own organization — **not** required to match Practice Info). |
| **Apply** | Same as SFU-13: load into drafts, confirm replace if non-empty. |
| **Delete / rename** | **My templates** modal: Apply / Rename (`prompt`) / Delete (`confirm`). |

**Privacy:** Templates are **per doctor** as rest of settings unless product later adds clinic-level sharing.

---

## ✅ Task breakdown

### 1. Backend

- [x] 1.1 Migration: `039_service_catalog_templates_json.sql` — `service_catalog_templates_json` JSONB nullable.
- [x] 1.2 Zod: `serviceCatalogTemplatesJsonSchema` + duplicate `id` refinement; catalog via shared catalog validation.
- [x] 1.3 `doctor-settings-service`: read/patch; default `{ templates: [] }` in API normalization.
- [ ] 1.4 API docs / OpenAPI if applicable (optional).

### 2. Frontend types & API

- [x] 2.1 Extend `DoctorSettings` + `PatchDoctorSettingsPayload` with `service_catalog_templates_json`.
- [x] 2.2 `patchDoctorSettings` accepts payload via existing typings (no extra `api.ts` string required).

### 3. Services catalog UI

- [x] 3.1 **Save as template** in `UserSavedTemplatesModal` (name, optional tag).
- [x] 3.2 **My templates** list: apply, rename, delete (confirm delete).
- [x] 3.3 **Apply** confirmation: `confirmReplaceServiceCatalogIfNeeded` (shared with SFU-13).

### 4. Tests

- [x] 4.1 BE: `patch-doctor-settings-validation.test.ts` — valid blob; duplicate template ids rejected; fixtures include `service_catalog_templates_json`.
- [ ] 4.2 FE unit (optional): round-trip serialize drafts → template → reload.

---

## Acceptance criteria

1. User can save at least **one** named template and see it after reload.
2. User can **apply** a saved template and **Save** to persist `service_offerings_json` independently of template storage.
3. User can **delete** a template; **rename** if product approves (or v1: delete + re-save).
4. Invalid catalog in stored template is **rejected** on PATCH or stripped with error — no corrupt settings row.

---

## Open decisions

- **Max templates** count (e.g. 20) and **total JSON size** guard.
- **Merge vs replace** on apply — **v1: replace only** after confirm; merge deferred.
- Whether `specialty_tag` is a free string or constrained to `MEDICAL_SPECIALTIES`.

---

**Last updated:** 2026-03-29
