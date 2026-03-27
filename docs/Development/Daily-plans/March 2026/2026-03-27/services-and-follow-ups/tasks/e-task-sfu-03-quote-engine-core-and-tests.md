# SFU-03: Quote engine — core logic & unit tests

## 2026-03-28 — Authoritative `index` / `followup` amounts

---

## 📋 Task Overview

Implement **`quoteConsultationVisit`** (name TBD) pure(ish) service: given **doctor settings** (`service_offerings_json` or legacy fallback), **patient**, **doctor**, **`catalog_service_key`**, **`modality`**, **booking timestamp**, and optional **active episode** row — return **`VisitQuote`**:

- `kind`: `'index' | 'followup'`
- `amount_minor`, `currency`
- `episode_id?`, `visits_remaining?`, `visit_index?`
- Metadata for payments: `visit_kind`, `service_key`, `modality`

**Uniform follow-up discount only** (per PLAN v1); **tiered = SFU-09**.

**Estimated Time:** 1–2 days  
**Status:** ✅ **DONE**

**Change Type:**
- [x] **New feature** (new module) + small **Update** to consumers in SFU-05

**Current State:**
- ✅ **`backend/src/services/consultation-quote-service.ts`** — `quoteConsultationVisit`, `VisitQuote`, snapshot parser, `applyFollowUpDiscount`, eligibility helper.
- ✅ **Errors:** `ServiceNotFoundForQuote`, `ModalityNotOfferedForQuote`, `LegacyAppointmentFeeNotConfiguredError` in `utils/errors.ts`.
- ✅ **Unit tests:** `backend/tests/unit/services/consultation-quote-service.test.ts`
- ✅ **PLAN §9** links to module path.

**Reference:** PLAN §3.3; platform fee applies **after** base quote in payment layer (see SFU-05).

---

## ✅ Task Breakdown

### 1. API design
- [x] 1.1 `VisitQuote`, `QuoteConsultationVisitInput`, `ConsultationModality`; errors above (**no** separate `EpisodeExpired` class — expired/exhausted episode **falls back to index** list price per tests/PLAN).
- [x] 1.2 **Legacy path:** no valid catalog → single `appointment_fee_minor` for all modalities; null/malformed fee → `LegacyAppointmentFeeNotConfiguredError`.

### 2. Index path
- [x] 2.1 Resolve service; modality enabled; **list price** from catalog.

### 3. Follow-up path
- [x] 3.1 Eligibility: `status === 'active'`, `followups_used < max_followups`, `at <= eligibility_ends_at`; episode **`catalog_service_key`** must match requested key (else index).
- [x] 3.2 Base from **`price_snapshot_json.modalities`** (optional top-level modality keys); `enabled: false` omits modality.
- [x] 3.3 **`followup_policy`** in snapshot, else **replay** from catalog offering `followup_policy`; uniform `discount_type` / `discount_value` via `applyFollowUpDiscount`.

### 4. Tests
- [x] 4.1 Index; follow-up 30% off; exhausted / expired → **index**; wrong modality; legacy; policy replay from catalog.

### 5. Docs
- [x] 5.1 Module JSDoc + PLAN §9 table points to `consultation-quote-service.ts`.

---

## 📁 Files (expected)

```
backend/src/services/consultation-quote-service.ts
backend/src/utils/errors.ts (quote errors)
backend/tests/unit/services/consultation-quote-service.test.ts
docs/.../PLAN-services-modalities-and-follow-ups.md (§9)
```

---

**Last Updated:** 2026-03-29
