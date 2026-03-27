# SFU-06: Dashboard — Practice Setup service matrix UI

## 2026-03-28 — Doctor edits catalog + follow-up policy

---

## 📋 Task Overview

Build **Practice Setup** UI for the **service offerings catalog**: add/remove service rows; per row label + **`service_key`** (slug, validated); **modalities** checkboxes; **price** inputs per enabled modality (INR → minor units); **follow-up** section (uniform v1: max visits after index, window days, discount type/value).

Load/save via existing **doctor settings** API extended in **SFU-01**.

**Estimated Time:** 2–4 days  
**Status:** ✅ **DONE** (2026-03-28)

**Change Type:**
- Mostly **New feature** (new page section or tab); may **Update** existing practice-setup routes

**Current State:**
- ✅ Practice setup: **Services catalog** at `practice-setup/services-catalog` with `ServiceCatalogEditor`.
- ✅ Settings PATCH: `service_offerings_json` (+ Zod client validation aligned with SFU-01).
- ✅ Legacy: read-only **consultation_types** banner when set and catalog empty.

**Reference:** `docs/Reference/PRACTICE_SETUP_UI.md`, PLAN §2.2

---

## ✅ Task Breakdown

### 1. UX
- [x] 1.1 List + **Add service**; inline edit; delete with confirm.
- [x] 1.2 **service_key**: auto from label slug; validate uniqueness in array.
- [x] 1.3 Modality toggles: at least one required; prices required when enabled.
- [x] 1.4 Follow-up collapsible; tooltips matching PLAN copy (“Up to N follow-up visits after your first **completed** consultation”).

### 2. API client
- [x] 2.1 Types shared or mirrored from backend response; handle null catalog.

### 3. Legacy coexistence
- [x] 3.1 Optional: show “Legacy consultation types (read-only)” if `consultation_types` set but catalog empty — migration CTA.

### 4. Accessibility & validation
- [x] 4.1 Client-side Zod (**`frontend/lib/service-catalog-schema.ts`**) aligned with SFU-01.

### 5. Verification
- [x] 5.1 Manual: save → reload → values match (`npm run build` clean).

---

## 📁 Files (expected)

```
frontend/app/dashboard/settings/practice-setup/services-catalog/page.tsx
frontend/components/practice-setup/ServiceCatalogEditor.tsx
frontend/lib/service-catalog-schema.ts
frontend/lib/service-catalog-drafts.ts
frontend/types/doctor-settings.ts (service_offerings_json, PATCH)
frontend/package.json (zod)
```

---

**Last Updated:** 2026-03-28
