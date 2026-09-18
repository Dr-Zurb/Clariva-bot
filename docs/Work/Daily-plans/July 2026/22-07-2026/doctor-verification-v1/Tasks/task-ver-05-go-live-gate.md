# Task ver-05: Go-live gate enforcement

> **⚠️ OPUS.** Touches the patient-facing activation path.
> **Links:** batch [`../plan-doctor-verification-v1-batch.md`](../plan-doctor-verification-v1-batch.md) · exec [`./EXECUTION-ORDER-doctor-verification-v1.md`](./EXECUTION-ORDER-doctor-verification-v1.md)

---

## 📋 Task Overview

Enforce **VER-D5**: an unverified doctor cannot go patient-facing. Chokepoint = Instagram connect / receptionist activation + patient booking.

**Status:** ✅ DONE (2026-07-22). **Change Type:** Update existing IG-connect + booking paths with a verification check.

**Current State:**
- ✅ `doctor_settings.instagram_receptionist_paused` exists — natural lever.
- ✅ IG connect flow (`InstagramConnect` + backend connect/status).
- ✅ Patient booking path (`booking-controller.ts`).
- ✅ `isDoctorVerified()` helper + `DoctorNotVerifiedError`.

**Scope Guard:** add a verification check at the two chokepoints only; clear messaging to the doctor. Do not wall the whole dashboard.

---

## ✅ Task Breakdown

### 1. IG connect / receptionist
- [x] 1.1 `connectHandler` + `callbackHandler` block until `status='verified'`; doctor message + frontend soft-block link to `/dashboard/get-verified`. Unpause (`instagram_receptionist_paused=false`) also blocked until verified.

### 2. Patient booking
- [x] 2.1 `evaluatePublicBookingPaymentGate` reason `doctor_not_verified` → `processSlotSelectionAndPay` throws `DoctorNotVerifiedError`; slot-page soft-blocks with patient-facing copy.

### 3. UX
- [x] 3.1 Getting-started Instagram step → “Get verified first”; Integrations page shows `VerificationBanner` + Connect replaced by Get verified CTA when unverified.

### 4. Verification
- [x] 4.1 Unverified: connect/receptionist/booking blocked. Verified: normal.
- [x] 4.2 Tests: payment-gate + connectHandler ver-05; no PII in logs.

---

## 🌍 Global Safety Gate

- **Data touched?** Y (reads verification status; rejects unpause) → RLS unchanged.
- **PHI in logs?** No.
- **External API/AI?** IG connect only; no message content.
- **Retention/deletion?** No new data.

## ✅ Acceptance Criteria

- [x] Unverified cannot activate receptionist or take patient bookings.
- [x] Verified doctors unaffected; clear messaging throughout.

**Created:** 2026-07-22.
