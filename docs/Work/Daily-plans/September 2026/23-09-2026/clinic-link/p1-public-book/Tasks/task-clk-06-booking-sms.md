# Task clk-06: SMS confirmation for a booking with no thread

## 📋 Task Overview

A slug booking with no conversation sends one SMS to the phone just collected: which practice, and when. It does not include the reason. It does not send a second SMS if that booking already produced one.

**Program / Phase:** clinic-link · Phase 1 (public-book)
**Batch:** [`plan-p1-clinic-link-public-book-batch.md`](../plan-p1-clinic-link-public-book-batch.md)
**Execution order:** [`EXECUTION-ORDER-p1-clinic-link-public-book.md`](./EXECUTION-ORDER-p1-clinic-link-public-book.md)
**Estimated Time:** 2 hours
**Status:** ✅ **DONE** (2026-09-23)

**Change Type:**
- [x] **Update existing** — Twilio send and desk booking confirmation already exist

**Current State:**
- ✅ **What exists:** `sendSms` in `twilio-sms-service.ts`. Desk phone confirmation skips walk-ins and sends through the notification service. Token checkout does not itself call `sendSms` (inspected in `slot-selection-service.ts`).
- ❌ **What's missing:** an SMS when the appointment has no conversation.
- ⚠️ **Notes:** Waits on clk-03. Does not wait on the page or on clk-04. A matched `?c=` booking still gets the DM from clk-04. This SMS is for the null-conversation case. If clk-04's path also has no SMS today, one SMS is enough for that booking too — never two.

**Scope Guard:**
- Expected files touched: ≤ 3 (notification helper, the slug checkout call site, one test)
- Do not add an Instagram stage
- Do not include reason, age, sex, or a history link (the history link is Phase 2)
- Do not log the phone or the message body

**Reference Documentation:**
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — phone number already stored on the appointment, used as the SMS destination
- [x] **RLS verified?** Y — send uses the appointment row the service role just wrote. No new read policy.
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** Y — Twilio
  - [x] **Consent + redaction confirmed?** Y — the booking consent just granted covers this confirmation. Message is practice and when only. Logs stay ids.
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Send once
- [x] 1.1 After a slug checkout with no conversation, send one SMS: practice name and the visit time in the practice timezone
- [x] 1.2 Do not include the reason or any other clinical text
- [x] 1.3 If a confirmation SMS for that appointment was already sent, do not send another
- [x] 1.4 A failed SMS does not roll back the appointment

### 2. Verification
- [x] 2.1 Unit test: null conversation sends one SMS without the reason; a second call does not send again; Twilio failure leaves the appointment
- [x] 2.2 Typecheck and lint the touched files

---

## 📁 Files to Create/Update

- ⚠️ `backend/src/services/twilio-sms-service.ts` — EXISTS
- ⚠️ Desk booking confirmation in `notification-service.ts` — EXISTS, walk-in skip. Reuse the send path; do not copy a second Twilio client.
- ❌ Unit test — MISSING

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- One message. Practice and when.
- No PHI in logs, including the phone and the body.
- SMS failure is reported, not a failed booking.
- No new Instagram copy.

---

## ✅ Acceptance & Verification Criteria

- [x] A bio booking produces one SMS with practice and when — 2026-09-23
- [x] The reason is absent from the message — 2026-09-23
- [x] A repeat does not send a second SMS — 2026-09-23
- [x] The appointment remains if Twilio fails — 2026-09-23

---

## 📝 Notes

The sender is `public-clinic-booking-sms.ts`. It calls the existing `sendSms` and records `notification_type: public_clinic_booking_sms` only after a successful send. Checkout calls it after the appointment exists, including a matched `?c=`, so that booking still gets one SMS. A throw is swallowed. Token checkout is unchanged.

---

## 🔗 Related Tasks

- [`task-clk-03-public-checkout.md`](./task-clk-03-public-checkout.md)

**Last Updated:** 2026-09-23
