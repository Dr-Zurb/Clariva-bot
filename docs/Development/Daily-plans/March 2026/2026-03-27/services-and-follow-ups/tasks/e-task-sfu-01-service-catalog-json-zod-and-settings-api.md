# SFU-01: Service catalog JSON — Zod schema & doctor settings API

## 2026-03-28 — P0 foundation for modalities + per-service fees

---

## 📋 Task Overview

Introduce a **versioned, validated JSON** shape for doctor **service offerings**: each service with **text/voice/video** toggles, **prices per modality**, and optional **follow-up policy** (for P1). Store on `doctor_settings` (new column **or** namespaced JSON envelope), validate on **GET/PUT** settings, and keep **backward compatibility** with existing **`consultation_types`** plain string / compact fee JSON (`RBH-13`).

**Estimated Time:** 1–2 days  
**Status:** ✅ **DONE** (implementation landed)

**Change Type:**
- [x] **Update existing** — doctor settings, validation, types; follow [CODE_CHANGE_RULES.md](../../../../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **`DoctorSettingsRow`** — `consultation_types: string | null`, `service_offerings_json: ServiceCatalogV1 | null`, fees columns (`backend/src/types/doctor-settings.ts`).
- ✅ **Fee formatters** — `consultation-fees.ts` parses plain text + optional compact JSON rows; `dm-reply-composer` / webhook use `feeQuoteSettingsFromDoctorRow`.
- ✅ **Settings update** — `updateDoctorSettings` includes `service_offerings_json`; PATCH body validated via `validation.ts` (`serviceCatalogV1Schema`) and normalized with `parseServiceCatalogV1` before persist.
- ✅ **Structured catalog** — `service_key`, per-modality `enabled` + `price_minor`, optional `followup_policy` (v1) in `backend/src/utils/service-catalog-schema.ts`.
- ✅ **Read path** — `getActiveServiceCatalog` / `safeParseServiceCatalogV1FromDb`: null or invalid JSON does not throw; callers can fall back to `consultation_types`.
- ⚠️ **Max length** — `consultation_types` still capped in validation; catalog lives in **`service_offerings_json` JSONB** (migration **035**).

**Scope Guard:**
- Do **not** remove `consultation_types` in this task; support **read fallbacks** until SFU-08 switches DM copy.

**Reference:**
- [PLAN-services-modalities-and-follow-ups.md](../PLAN-services-modalities-and-follow-ups.md) §2, §8.1
- [MIGRATIONS_AND_CHANGE.md](../../../../../../Reference/MIGRATIONS_AND_CHANGE.md)

---

## ✅ Task Breakdown

### 1. Schema & types
- [x] 1.1 Define Zod schemas: modalities as **`text` / `voice` / `video`** object slots (each optional `{ enabled, price_minor }`), `FollowUpPolicyV1`, `ServiceOfferingV1` (`service_key` slug, `label`, optional `description`, `modalities`, optional `followup_policy`). *(No separate `ConsultationModality` enum — shape matches plan.)*
- [x] 1.2 Wrapper: `ServiceCatalogV1` = `{ version: 1, services: ServiceOfferingV1[] }` (+ duplicate `service_key` refinement).
- [x] 1.3 TypeScript types exported from **`backend/src/utils/service-catalog-schema.ts`** *(plan listed `types/service-catalog.ts`; consolidated into schema module).*

### 2. Migration
- [x] 2.1 Add nullable column **`service_offerings_json JSONB`** on `doctor_settings`; comment documents v1 shape — `backend/migrations/035_service_offerings_json.sql`.
- [x] 2.2 RLS unchanged (additive nullable column on existing RLS-protected table); verify in Supabase when applying migration.

### 3. API / service layer
- [x] 3.1 On **read**: `getActiveServiceCatalog` / safe parse — if null or invalid, **do not** fail; downstream uses legacy `consultation_types`.
- [x] 3.2 On **update**: PATCH validates with Zod; `updateDoctorSettings` runs `parseServiceCatalogV1` before write; invalid combos rejected.
- [x] 3.3 **Replace** entire catalog when `service_offerings_json` is sent (v1); document via PATCH partial-update semantics (field replaces JSON blob).

### 4. Helpers
- [x] 4.1 `getActiveServiceCatalog(settings)` in `backend/src/utils/service-catalog-helpers.ts`.
- [x] 4.2 `findServiceOfferingByKey(catalog, key)` (case-normalized lookup).

### 5. Verification
- [x] 5.1 Unit tests: `backend/tests/unit/utils/service-catalog-schema.test.ts`; PATCH tests in `patch-doctor-settings-validation.test.ts`.
- [ ] 5.2 Round-trip PUT via **`updateDoctorSettings` mocked Supabase** test or controller integration test — *optional follow-up; validation + parse path covered.*
- [x] 5.3 **`docs/Reference/DB_SCHEMA.md`** updated (`service_offerings_json`, SFU-01).

---

## 📁 Files to Create/Update

```
backend/migrations/035_service_offerings_json.sql
backend/src/utils/service-catalog-schema.ts
backend/src/utils/service-catalog-helpers.ts
backend/src/types/doctor-settings.ts
backend/src/services/doctor-settings-service.ts
backend/src/utils/validation.ts
backend/tests/unit/utils/service-catalog-schema.test.ts
backend/tests/unit/utils/patch-doctor-settings-validation.test.ts (SFU-01 cases)
docs/Reference/DB_SCHEMA.md
```

---

## 🌍 Global Safety Gate

- [x] **PHI?** N (catalog is doctor pricing metadata)
- [x] **Breaking API?** Only if clients send unknown fields — prefer additive

---

**Last Updated:** 2026-03-29
