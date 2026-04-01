# e-task-arm-10: Payment gating — pay after staff confirm (v1)

## 2026-04-02 — No capture on low-confidence path until final quote

---

## 📋 Task Overview

Align **`select-slot-and-pay`** / **Razorpay** integration with plan **§6**:

- **High-confidence** path: preserve **current** behavior — **single capture** when patient commits to slot for **final** quoted amount (catalog quote or legacy rules).
- **Staff-resolved** path: **no payment intent / capture** until **ARM-07** resolution + conversation state marks **serviceSelectionFinalized**; patient then completes **one** checkout for **final** `catalogServiceKey` + modality quote.
- **No v1 incremental charges**, **no holding / deposit fee** — if quote changes after staff edits service, **replace** checkout with **one** new amount (implementation detail in payment service).

**Booking token** issuance: coordinate so **invalid** or **premature** `/book` access cannot pay **before** staff gate clears (may require **token** claims or **conversation flags** checked in `verifyBookingToken` path).

**Estimated Time:** 2–4 days  
**Status:** ✅ **DONE** (gate in `processSlotSelectionAndPay` + `slot-page-info` flags)

**Change Type:**
- [x] **Update existing** — slot selection service, booking controller, errors, docs

**Current State:**
- ✅ `processSlotSelectionAndPay` / `computeSlotBookingQuote` / Razorpay flows exist.
- ✅ **`evaluatePublicBookingPaymentGate`** blocks pay when staff review pending or multi-service selection not finalized.
- ✅ **`GET slot-page-info`** returns **`bookingAllowed`** / **`bookingBlockedReason`** for `/book`.

**Dependencies:** **ARM-05**, **ARM-06**, **ARM-07**, **ARM-09** coordinated.

**Reference:**
- Plan §6, §0
- [MONETIZATION_INITIATIVE.md](../../../../../task-management/MONETIZATION_INITIATIVE.md) if platform fee logic must apply consistently
- [RECIPES.md](../../../../../Reference/RECIPES.md) §20 payment gate matrix

---

## ✅ Task Breakdown

### 1. Policy matrix
- [x] 1.1 Document **decision table** in `RECIPES.md` or payment doc: which **conversation states** allow **paymentIntent** creation. *RECIPES §20.*
- [x] 1.2 **Razorpay** specifics: confirm with provider docs for **single** capture after delay (no auth-hold v1). *Documented: no hold in v1; single checkout per attempt.*

### 2. Backend guards
- [x] 2.1 **`select-slot-and-pay`**: reject with **clear error code** if **staff review** pending or service not finalized (client shows “return to chat”). *403 + `StaffServiceReviewPendingPaymentError` / `ServiceSelectionNotFinalizedPaymentError`.*
- [x] 2.2 **`slot-page-info`**: optionally returns **`bookingAllowed: false`** with reason enum for frontend. *`bookingBlockedReason`.*

### 3. Quote recomputation
- [x] 2.3 After staff **reassign**, **recompute** quote server-side from **`consultation-quote-service`**; patient sees **one** amount at pay time. *Existing `computeSlotBookingQuote` + `applyPublicBookingSelectionsToState` on finalized state.*

### 4. Tests
- [x] 2.4 Unit tests: attempt pay while pending review → **403/409**; after resolve → success fixture. *Unit tests on `evaluatePublicBookingPaymentGate` (403 exercised via error class in integration).*

### 5. Observability
- [x] 2.5 Log **payment gate** denials (metric counters, no PHI). *`booking_payment_gate_denied` log with reason + conversationId.*

---

## 🧠 Design Constraints

- **PCI**: never log card data; follow existing payment logging.
- **COMPLIANCE**: receipts / patient messages must match **final** charged service.

---

## 🌍 Global Safety Gate

- [x] **External API?** Y — Razorpay
- [x] **Money path?** **High risk** — require **peer review** or checklist before prod enable

---

## ✅ Acceptance Criteria

- **Cannot** capture payment on **low-confidence** branch **before** staff action (verified by tests).
- **Single** charge per booking attempt for v1 scope.
- Docs updated for **support** team.

---

## 🔗 Related

- [e-task-arm-06](./e-task-arm-06-pending-review-persistence-and-apis.md)
- [e-task-arm-07](./e-task-arm-07-doctor-review-inbox-ui.md)
- [e-task-arm-09](./e-task-arm-09-slot-page-info-and-book-prefill.md)
- [e-task-arm-11](./e-task-arm-11-catalog-quote-fallback-safety.md)

---

**Last Updated:** 2026-03-31
