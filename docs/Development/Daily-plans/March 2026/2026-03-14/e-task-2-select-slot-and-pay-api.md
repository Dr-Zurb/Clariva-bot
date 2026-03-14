# Task 2: Select Slot and Pay API — Create Appointment + Payment Link in One Call
## 2026-03-14

---

## 📋 Task Overview

Add `POST /api/v1/bookings/select-slot-and-pay` that creates an appointment and payment link in one call. The frontend will call this instead of `select-slot` when the doctor has a fee configured. User selects slot → API creates appointment + payment link → returns paymentUrl → user pays on Razorpay → redirects to success page. Also add `GET /api/v1/bookings/redirect-url?token=X` for the success page to redirect back to chat.

**Estimated Time:** 4–5 hours  
**Status:** ✅ **DONE**  
**Completed:** 2026-03-14

**Change Type:**
- [x] **New feature** — New API endpoints; new service function; extends payment-service callback support

**Current State:**
- ✅ **What exists:** `POST /bookings/select-slot`; `bookAppointment`; `createPaymentLink`; Razorpay adapter; `getRedirectUrlForDoctor`; `verifyBookingToken`; `validateSelectSlotBody`
- ✅ **Implemented:** `POST /bookings/select-slot-and-pay`; `GET /bookings/redirect-url`; `processSlotSelectionAndPay`; `CreatePaymentLinkInput.callbackUrl`; `verifyBookingTokenAllowExpired`

**Scope Guard:**
- Expected files touched: booking-controller, bookings routes, slot-selection-service (or new), payment-service, validation

**Reference Documentation:**
- [unified-slot-payment-flow-and-appointment-status.md](./unified-slot-payment-flow-and-appointment-status.md)
- [e-task-3: Slot selection API](../2026-03-13/e-task-3-slot-selection-api.md)
- [EXTERNAL_SERVICES.md](../../../Reference/EXTERNAL_SERVICES.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Slot Selection Service: processSlotSelectionAndPay

- [x] 1.1 Add `processSlotSelectionAndPay(token, slotStart, correlationId)` to slot-selection-service
  - [x] 1.1.1 Verify token → conversationId, doctorId
  - [x] 1.1.2 Validate slot (not past, check availability/conflict)
  - [x] 1.1.3 Load conversation → patient_id
  - [x] 1.1.4 Load patient (findPatientByIdWithAdmin) → name, phone
  - [x] 1.1.5 Load doctor settings (fee, currency, country)
  - [x] 1.1.6 If fee <= 0: create appointment, skip payment, return { redirectUrl, paymentUrl: null }
  - [x] 1.1.7 Else: bookAppointment, createPaymentLink with callback_url = `${BOOKING_PAGE_URL}/success?token=${token}`
  - [x] 1.1.8 Save slot selection; update conversation state to `responded` (no confirming_slot)
  - [x] 1.1.9 Return { paymentUrl, redirectUrl, appointmentId }
- [x] 1.2 Handle ConflictError (slot taken) → return 409

### 2. Payment Service: Callback URL Support

- [x] 2.1 Ensure CreatePaymentLinkInput includes `callbackUrl?: string`
- [x] 2.2 Pass callbackUrl to Razorpay adapter (already supports callback_url)
- [x] 2.3 Razorpay redirects to callbackUrl after payment

### 3. POST select-slot-and-pay Endpoint

- [x] 3.1 Add `POST /api/v1/bookings/select-slot-and-pay`
  - [x] 3.1.1 Body: { token, slotStart } — reuse validateSelectSlotBody
  - [x] 3.1.2 Call processSlotSelectionAndPay
  - [x] 3.1.3 Return { paymentUrl, redirectUrl, appointmentId }
  - [x] 3.1.4 409 on ConflictError
- [x] 3.2 Add route in bookings router

### 4. GET redirect-url Endpoint

- [x] 4.1 Add `GET /api/v1/bookings/redirect-url?token=X`
  - [x] 4.1.1 Verify token (allow expired for redirect UX)
  - [x] 4.1.2 Call getRedirectUrlForDoctor(doctorId)
  - [x] 4.1.3 Return { redirectUrl }
- [x] 4.2 Add validation for token query param
- [x] 4.3 Add route

### 5. Verification & Testing

- [x] 5.1 Run type-check
- [ ] 5.2 Unit test: processSlotSelectionAndPay creates appointment + payment link
- [ ] 5.3 Manual: select slot → get paymentUrl → pay → redirect

---

## 📁 Files to Create/Update

```
backend/src/
├── controllers/
│   └── booking-controller.ts     (UPDATED - selectSlotAndPayHandler, getRedirectUrlHandler)
├── routes/api/v1/
│   └── bookings.ts               (UPDATED - new routes)
├── services/
│   ├── slot-selection-service.ts (UPDATED - processSlotSelectionAndPay)
│   └── payment-service.ts        (REVIEW - callbackUrl in CreatePaymentLinkInput)
└── utils/
    └── validation.ts             (REVIEW - reuse or extend)
```

**Existing Code Status:**
- ✅ processSlotSelection: save, update state, send message, return redirectUrl
- ✅ bookAppointment: doctorId, patientId, patientName, patientPhone, appointmentDate, notes
- ✅ createPaymentLink: appointmentId, amountMinor, currency, doctorCountry, etc.
- ✅ Razorpay adapter: callback_url, callback_method

---

## 🧠 Design Constraints

- No PHI in logs (COMPLIANCE.md)
- Token-based auth (no user session)
- callback_url must include token for success page redirect
- Doctor with no fee: create appointment, return redirectUrl only (no paymentUrl)

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y – appointments, payments, slot_selections, conversations)
  - [x] **RLS verified?** (Admin client; token validates conversation ownership)
- [x] **Any PHI in logs?** (MUST be No)
- [x] **External API or AI call?** (Y – Razorpay Payment Links)
  - [x] **Consent + redaction confirmed?** (Y – payment link creation)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] POST /bookings/select-slot-and-pay creates appointment and returns paymentUrl when fee > 0
- [x] When fee = 0: returns redirectUrl only, no paymentUrl
- [x] Payment link callback_url includes token for success page
- [x] GET /bookings/redirect-url returns Instagram DM URL
- [x] ConflictError when slot taken → 409

---

## 🔗 Related Tasks

- [e-task-1: Appointment status lookup](./e-task-1-appointment-status-lookup.md)
- [e-task-3: Booking page + success page](./e-task-3-booking-page-success-page.md)
- [e-task-4: Worker migration](./e-task-4-worker-migration-unified-flow.md)
- [e-task-3: Slot selection API](../2026-03-13/e-task-3-slot-selection-api.md)

---

**Last Updated:** 2026-03-14
