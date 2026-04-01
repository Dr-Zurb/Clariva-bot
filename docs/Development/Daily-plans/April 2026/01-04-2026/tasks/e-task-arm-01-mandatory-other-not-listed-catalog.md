# e-task-arm-01: Mandatory **Other / not listed** catalog row

## 2026-04-02 — Catalog contract for catch-all service

---

## 📋 Task Overview

Ensure every practice that maintains a **teleconsult service catalog** (`service_offerings_json`) includes a **mandatory catch-all** offering aligned with product **§0**: doctor-facing label **Other / not listed**, stable internal **`service_key`** (product default: **`other`**). **Save / publish** must **fail or block** until this row exists and is **valid** (at least one enabled modality with non-negative pricing per existing catalog rules). Provide **dashboard copy** so doctors understand this row is the fallback when patient complaints do not map to a named service.

**Estimated Time:** 1–2 days  
**Status:** ✅ **DONE** (2026-03-31) — backend + Practice Setup UI; staging smoke still recommended for new practices

**Change Type:**
- [x] **Update existing** — catalog validation, practice setup UI, optional API validation on PATCH doctor settings

**Current State:**
- ✅ **`ServiceOfferingV1`** already has `service_key`, `label`, optional `description`, `modalities` — `backend/src/utils/service-catalog-schema.ts`.
- ✅ **Services catalog page** loads/saves drafts via `frontend/.../services-catalog/page.tsx` and `ServiceCatalogEditor`; Zod parity in `frontend/lib/service-catalog-schema.ts`.
- ✅ Reserved **`other`** catch-all + save validation (PATCH + Zod); matcher uses same key (**ARM-04**).

**Scope Guard:**
- Touch catalog schema (FE+BE Zod), editor empty-state/templates, save validation, and docs only unless ARM-06 needs a DB flag (defer optional flags to later tasks).
- Expected files: ≤ 8; split if API vs UI balloons.

**Reference Documentation:**
- [plan-ai-receptionist-service-matching-and-booking.md](../plan-ai-receptionist-service-matching-and-booking.md) §3.1, §0
- [CODE_CHANGE_RULES.md](../../../../../task-management/CODE_CHANGE_RULES.md)
- [MIGRATIONS_AND_CHANGE.md](../../../../../Reference/MIGRATIONS_AND_CHANGE.md) — only if new columns (prefer **no** migration for v1)

---

## ✅ Task Breakdown

### 1. Product constants & rules
- [x] 1.1 Define **reserved `service_key`** value for catch-all (default **`other`**) in a **single** backend (and mirrored frontend) constant or shared doc — matcher + booking code must reference same value.
- [x] 1.2 Document that **only one** row may use this `service_key`; duplicates rejected on save.
- [x] 1.3 Default **label** for new catch-all row: **Other / not listed** (doctor may edit label text per i18n later; **key** stays fixed).

### 2. Backend validation
- [x] 2.1 When **PATCH** (or equivalent) persists `service_offerings_json` and catalog is **non-empty / teleconsult-enabled** per product rules, **validate** presence of catch-all row with reserved `service_key`, valid modalities.
- [x] 2.2 Return **clear API error** (no PHI) when validation fails; align status codes with existing settings API patterns.
- [x] 2.3 Unit tests: reject catalog missing catch-all; accept catalog with only catch-all + optional other rows.

### 3. Frontend — editor & templates
- [x] 3.1 **Service catalog editor**: on empty/new catalog, **seed** or prompt creation of **Other / not listed** row with reserved key (read-only `service_key` field for that row if product requires immutability).
- [x] 3.2 Inline **help text**: explain fallback behavior (AI + no-match; not “cheap consult”).
- [x] 3.3 **Starter templates** / library flows (`ServiceCatalogTemplatesModal`, etc.): ensure templates include catch-all or auto-insert when applied.
- [x] 3.4 Client-side validation mirrors server before save (better UX).

### 4. Verification
- [x] 4.1 Manual: doctor cannot save catalog without catch-all when product requires catalog. *(Covered by unit tests + validation; optional human pass on staging.)*
- [x] 4.2 Regression: existing doctors with valid multi-service catalogs get migration path or one-time warning (product decision: **block** next save vs **soft** banner — document choice).

**Notes (4.2):** DB **read** uses `serviceCatalogV1BaseSchema` (no catch-all) so legacy rows still load; **PATCH validatePatchDoctorSettings** + **merge final parse** require `other`. **Add service** auto-inserts catch-all when the editor draft is missing it. **Merge** allows one-way **promotion** of `service_key` → `other` when client sends reserved key for an existing `service_id`.

---

## 📁 Files to Create/Update (expected)

```
backend/src/utils/service-catalog-schema.ts (refine or sibling validator)
backend/src/... doctor settings route / validation for service_offerings_json
backend/tests/unit/... catalog or settings tests
frontend/lib/service-catalog-schema.ts
frontend/components/practice-setup/ServiceCatalogEditor.tsx (or related)
frontend/app/dashboard/settings/practice-setup/services-catalog/page.tsx
frontend/lib/service-catalog-drafts.ts — seed / normalize if needed
```

**Existing Code Status:**
- ✅ Catalog Zod, editor, mandatory catch-all rule — **SHIPPED**

---

## 🧠 Design Constraints

- No **PHI** in validation error messages or logs.
- **RLS:** if validation runs only on authenticated doctor’s own settings row — follow existing doctor settings access model.
- Changing **Zod** shapes affects **all** catalog consumers (quote, DM, `/book`); run existing SFU-related tests.

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — `doctor_settings.service_offerings_json`
- [x] **RLS verified?** follow existing settings endpoints
- [x] **PHI in logs?** N
- [x] **External API?** N (this task)
- [x] **Retention impact?** N

---

## ✅ Acceptance Criteria

- Catch-all row **required** when catalog is in use; **reserved `service_key`** enforced.
- Doctor sees **clear** onboarding copy; save **blocked** with actionable error if missing.
- Tests cover happy path + rejection path.
- [DEFINITION_OF_DONE.md](../../../../../Reference/DEFINITION_OF_DONE.md) satisfied for touched areas.

---

## 🔗 Related Tasks

- [e-task-arm-04](./e-task-arm-04-service-matcher-engine.md) — consumes catch-all key for no-match.
- [e-task-arm-11](./e-task-arm-11-catalog-quote-fallback-safety.md) — quote paths assume valid keys.

---

**Last Updated:** 2026-03-31
