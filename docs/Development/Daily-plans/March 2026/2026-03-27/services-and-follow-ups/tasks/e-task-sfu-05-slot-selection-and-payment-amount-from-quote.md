# SFU-05: Slot selection & payment — amount from quote engine

## 2026-03-28 — Replace flat `appointment_fee_minor` when catalog exists

---

## 📋 Task Overview

Update **`selectSlotAndCreatePayment`** flow in **`slot-selection-service.ts`** (~L301 today: `amountMinor = doctorSettings?.appointment_fee_minor ?? env...`) to:

1. Resolve **`catalog_service_key`** + **`modality`** from **conversation state** (SFU-07) or defaults (single-service doctors).
2. Call **`quoteConsultationVisit`** (SFU-03); use **`quote.amount_minor`** for Razorpay/PayPal / payment link creation.
3. Attach metadata: `episode_id`, `visit_kind`, `service_key`, `modality` for reconciliation and payouts.
4. **Platform fee** (`payment-service`, MONETIZATION): apply to **quoted** doctor portion per existing rules — verify no double-count.

**Estimated Time:** 1–2 days  
**Status:** ✅ **DONE** (2026-03-28)

**Change Type:**
- [x] **Update existing** — `slot-selection-service.ts`, possibly `payment-service.ts`, conversation state type

**Current State:**
- ✅ **`bookAppointment`** creates row with `consultationType` from `state.consultationType`.
- ✅ **Payment link** built in slot-selection after booking.
- ✅ Amount uses **catalog quote** when applicable; **legacy** for in-clinic, no catalog, or multi-service without `catalogServiceKey`.

**Reference:** `docs/Reference/UNIFIED_SLOT_PAYMENT_FLOW.md` (if exists); PLAN §3.5

---

## ✅ Task Breakdown

### 1. Conversation state
- [x] 1.1 Extend `ConversationState` (`backend/src/types/conversation.ts`) with optional `catalogServiceKey`, `consultationModality` (`text|voice|video`) — or reuse `consultationType` string with documented mapping (prefer explicit modality enum for quotes).

### 2. Slot flow
- [x] 2.1 Before payment: build quote input; on legacy doctors (no catalog), **fallback** to `appointment_fee_minor`.
- [x] 2.2 Pass quoted amount into payment link builder; persist quote summary on `slot_selections` or `appointments` if needed for support. *(Notes/metadata on payment link; optional DB summary deferred.)*

### 3. Free / zero amount
- [x] 3.1 Preserve existing branch when quote = 0 (skip payment, save slot).

### 4. Tests
- [x] 4.1 Unit/integration: catalog doctor → payment amount matches quote; legacy → unchanged. (`backend/tests/unit/services/slot-selection-quote.test.ts`)

### 5. Docs
- [x] 5.1 Note in `DOCTOR_SETTINGS_PHASES.md` or payment doc.

---

## 📁 Files (expected)

```
backend/src/services/slot-selection-service.ts
backend/src/types/conversation.ts
backend/src/services/payment-service.ts (metadata only?)
backend/tests/unit/services/slot-selection-quote.test.ts
```

---

**Last Updated:** 2026-03-28
