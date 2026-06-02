# SFU-07: Public `/book` flow — service + modality selection

## 2026-03-28 — Pass `catalog_service_key` into booking & appointment

---

## 📋 Task Overview

Extend **public booking** (`frontend/app/book/page.tsx` and related token API) so patients **choose service** (when doctor has catalog) and **modality** (only enabled options). Persist selection in:

- **Slot selection API** / token payload so **`bookAppointment`** receives **`consultation_type`** or structured fields (align with `appointments.consultation_type` — today free-text e.g. `video`; may need `video|service_key` convention **or** new column — **prefer** keeping `consultation_type` for modality only + **`catalog_service_key`** on appointment from SFU-02).

Conversation worker: when patient books via DM link only, **default** first service or require doctor single-service until UI collects.

**Estimated Time:** 1–2 days  
**Status:** ✅ **DONE** (2026-03-28)

**Change Type:**
- [x] **Update existing** — book page, booking controller, slot token, `bookAppointment` params

**Current State:**
- ✅ **`/book`**:** `slot-page-info` returns token-scoped `serviceCatalog` (book only); **`select-slot-and-pay`** accepts optional `catalogServiceKey` + `consultationModality` (validated + merged via `applyPublicBookingSelectionsToState`).
- ✅ **`consultationType`** on **`bookAppointment`** extended to **`text` | `voice` | `video` | `in_clinic`**; appointments row stores modality; **`catalog_service_key`** from quote when catalog pricing applies.
- ✅ **In-clinic** conversations: no catalog on `/book`; DM multi-service without key still falls back per SFU-05 until bot sets state.

**Reference:** PLAN §2; `APPOINTMENT_BOOKING_FLOW_V2.md` if relevant

---

## ✅ Task Breakdown

### 1. API contract
- [x] 1.1 Extend slot-selection token / state to carry `catalogServiceKey` + `modality`. *(Request body on `select-slot-and-pay`; merged into effective conversation state server-side.)*
- [x] 1.2 **Validation server-side**: service exists in doctor catalog; modality allowed.

### 2. Frontend
- [x] 2.1 Fetch doctor catalog (public endpoint or embedded in token response — **avoid** leaking other doctors). *`GET .../slot-page-info` includes `serviceCatalog` for the token’s doctor only.*
- [x] 2.2 UI: service dropdown/cards → modality chips → existing slot picker.

### 3. Persist
- [x] 3.1 On `bookAppointment`, set `consultation_type` = modality + `catalog_service_key` when from catalog quote.

### 4. Single-service shortcut
- [x] 4.1 If catalog has exactly one service, pre-select; still show modality if >1 enabled.

### 5. Tests
- [x] 5.1 API tests: reject disabled modality; happy path merge (`backend/tests/unit/services/public-booking-catalog.test.ts`).

---

## 📁 Files (expected)

```
frontend/app/book/page.tsx
frontend/lib/api.ts
backend/src/controllers/booking-controller.ts
backend/src/services/slot-selection-service.ts
backend/src/utils/validation.ts (selectSlotBody + bookAppointment consultationType)
backend/tests/unit/services/public-booking-catalog.test.ts
```

---

**Last Updated:** 2026-03-28
