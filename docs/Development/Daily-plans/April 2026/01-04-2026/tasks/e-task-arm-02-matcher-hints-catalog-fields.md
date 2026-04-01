# e-task-arm-02: Matcher hint fields on catalog offerings (optional extension)

## 2026-04-02 — Rich metadata for high-confidence matching

---

## 📋 Task Overview

Extend the **service catalog** offering model (frontend + backend Zod + persistence) with **optional, doctor-editable fields** used only for **AI / matcher** context — e.g. **keywords / synonyms**, **inclusion bullets**, **exclusion / “book a different service if…”** hints. Today **`description`** exists (`max` length in schema) but may be insufficient for structured retrieval. Goal: **higher high-confidence rate** without patients picking service rows manually.

**Estimated Time:** 1–2 days  
**Status:** ✅ **DONE** (2026-03-31)

**Change Type:**
- [x] **Update existing** — extend `ServiceOfferingV1` / drafts / editor; backward-compatible JSON (old rows omit new fields)

**Current State:**
- ✅ `description` optional on `serviceOfferingCoreSchema` (`backend/src/utils/service-catalog-schema.ts`).
- ✅ `formatServiceCatalogForAiContext` feeds **label + modality prices** (+ follow-up hints from prior work) — may need to include new fields once added.
- ✅ **`matcher_hints`** optional on offerings; editor + AI context (**`formatServiceCatalogForAiContext`**).

**Scope Guard:**
- Keep fields **optional** so existing catalogs deserialize unchanged.
- Do **not** store PHI in these fields (doctor-entered, operational text only).

**Reference:**
- Plan §3.2
- [CODE_CHANGE_RULES.md](../../../../../task-management/CODE_CHANGE_RULES.md)

---

## ✅ Task Breakdown

### 1. Schema & types
- [x] 1.1 Add **optional** fields: `matcher_hints: { keywords?, include_when?, exclude_when? }` (max 400 / 800 / 800 chars) on `ServiceOfferingV1` / incoming.
- [x] 1.2 Mirror in **frontend** Zod + `ServiceOfferingDraft` / `draftsToCatalogOrNull` / `offeringToDraft`.
- [x] 1.3 **Hydration / migration**: none — optional keys omitted in legacy JSON.

### 2. Editor UX
- [x] 2.1 **ServiceCatalogEditor**: per-row “AI matching hints” panel (violet callout) + limits + placeholders.
- [x] 2.2 Copy explains **bot-only**, **no PHI**, richer hints → better routing.

### 3. AI / context consumers (minimal in this task)
- [x] 3.1 **`formatServiceCatalogForAiContext`**: appends `[matcher: …]` per service with **per-offering cap** (~420 chars); sub-field truncation; exported **`formatMatcherHintsForAiContext`** for reuse.
- [x] 3.2 **`formatServiceCatalogForDm`** unchanged — hints **not** in patient fee DMs.

### 4. Tests
- [x] 4.1 Parse: existing catalogs without `matcher_hints` unchanged (`minimalCatalog` etc.).
- [x] 4.2 E2E / manual: PATCH + reload editor *(schema + draft round-trip in code; full browser E2E optional).*

---

## 📁 Files (expected)

```
backend/src/utils/service-catalog-schema.ts
backend/src/utils/consultation-fees.ts — formatServiceCatalogForAiContext (or shared builder)
frontend/lib/service-catalog-schema.ts
frontend/lib/service-catalog-drafts.ts
frontend/components/practice-setup/ServiceCatalogEditor.tsx
backend/tests/unit/utils/service-catalog-schema.test.ts (or equivalent)
```

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — `service_offerings_json`
- [x] **PHI in hints?** MUST be **discouraged** in copy; no patient data in catalog fields
- [x] **External AI?** N in this task (only data plumbing; ARM-04 consumes)

---

## ✅ Acceptance Criteria

- Backward compatible catalog JSON.
- Editor exposes fields; AI context can surface them within agreed limits.
- Tests cover parse + persistence.

---

## 🔗 Related

- [e-task-arm-01](./e-task-arm-01-mandatory-other-not-listed-catalog.md)
- [e-task-arm-04](./e-task-arm-04-service-matcher-engine.md)

---

**Last Updated:** 2026-03-31
