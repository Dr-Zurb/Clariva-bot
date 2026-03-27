# SFU-08: DM / bot & AI context — fees from service catalog

## 2026-03-28 — Authoritative fee blocks per service × modality

---

## 📋 Task Overview

Evolve **fee quoting** for Instagram DM (and optional **DoctorContext** for `generateResponse`) so **₹ amounts** come from **`service_offerings_json`** when present:

- **`formatConsultationFeesForDm`** / **`composeIdleFeeQuoteDm`** (`dm-reply-composer.ts`, `consultation-fees.ts`): render human-readable table **per service** with modality columns or bullet list; **fallback** to legacy `consultation_types` string.
- **No LLM-invented prices** (RBH-13 / RBH-19).
- Optional: when user asks for a **specific** service in chat, narrow formatter to one row.

**Estimated Time:** 1–2 days  
**Status:** ✅ **DONE** (2026-03-28)

**Change Type:**
- [x] **Update existing** — `consultation-fees.ts`, `dm-reply-composer.ts`, `getDoctorContextFromSettings`, tests in `dm-reply-composer.test.ts`

**Current State:**
- ✅ Valid **`service_offerings_json`** → **`formatServiceCatalogForDm`** (per service × text/voice/video, ₹ from `price_minor`); optional **single-service narrow** via **`pickCatalogServicesMatchingUserText`**; in-clinic line from **`appointment_fee_minor`** when INR.
- ✅ **`DoctorContext.service_catalog_summary_for_ai`** + system prompt fee facts (catalog before legacy consultation_types).
- ✅ **DM length**: trim at **`CONSULTATION_FEE_DM_MAX_CHARS`** (3200) with localized ellipsis note.

**Reference:** `RECEPTIONIST_BOT_CONVERSATION_RULES.md`; PLAN §4.1

---

## ✅ Task Breakdown

### 1. Formatter
- [x] 1.1 `formatServiceCatalogForDm` / `formatServiceCatalogForAiContext` — reuse `detectSafetyMessageLocale`.
- [x] 1.2 Integrate into `composeIdleFeeQuoteDm` / mid-collection composer when catalog non-null (`feeQuoteSettingsFromDoctorRow` passes `service_offerings_json`).

### 2. AI context
- [x] 2.1 Extend `DoctorContext` with **`service_catalog_summary_for_ai`** (compact catalog summary for LLM).

### 3. Intent / routing
- [x] 3.1 **Deferred:** `check_availability` + DB slots (separate initiative); this task is **pricing display** only.

### 4. Tests
- [x] 4.1 Unit: catalog with 2 services, 3 modalities — output contains expected ₹ strings; legacy path unchanged.

### 5. Character limits
- [x] 5.1 If DM exceeds limit, truncate with ellipsis + short note (`CONSULTATION_FEE_DM_MAX_CHARS`).

---

## 📁 Files (expected)

```
backend/src/utils/consultation-fees.ts
backend/src/utils/dm-reply-composer.ts
backend/src/workers/instagram-dm-webhook-handler.ts (getDoctorContextFromSettings)
backend/src/services/ai-service.ts (DoctorContext, buildResponseSystemPrompt)
backend/tests/unit/utils/dm-reply-composer.test.ts
backend/tests/unit/utils/consultation-fees.test.ts
```

---

**Last Updated:** 2026-03-28
