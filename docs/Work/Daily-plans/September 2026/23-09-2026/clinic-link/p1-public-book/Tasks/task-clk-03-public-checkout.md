# Task clk-03: Checkout with no conversation

## 📋 Task Overview

A slug booking creates the patient and the appointment without a DM conversation. Age and sex are stored on the columns that already exist. Payment follows the same prepaid rules as `/book`.

**Program / Phase:** clinic-link · Phase 1 (public-book)
**Batch:** [`plan-p1-clinic-link-public-book-batch.md`](../plan-p1-clinic-link-public-book-batch.md)
**Execution order:** [`EXECUTION-ORDER-p1-clinic-link-public-book.md`](./EXECUTION-ORDER-p1-clinic-link-public-book.md)
**Estimated Time:** 6 hours
**Status:** ✅ **DONE** (2026-09-23)

**Change Type:**
- [x] **New feature** — unauthenticated create
- [x] **Update existing** — checkout today requires a conversation

**Current State:**
- ✅ **What exists:** `processSlotSelectionAndPay` verifies a token, loads the conversation, updates that patient, and calls `bookAppointment` with `conversationId`. `createPatientForBooking` can insert name, phone, age, and gender, but it stamps `registered_via = 'booking_for_other'` and a book-for-other consent method. `evaluatePublicBookingPaymentGate` blocks unverified doctors and also blocks on conversation staff-review and an unfinalized catalog selection. `appointments.conversation_id` is nullable. `booking_origin` already includes `booked`. Consent method `owned_booking_page` already exists for `/book`.
- ❌ **What's missing:** a checkout that does not load a conversation, writes age and sex, and still pays or queues.
- ⚠️ **Notes:** This is the PHI write. Read `COMPLIANCE.md` first. Do not call `createPatientForBooking` unchanged.

**Scope Guard:**
- Expected files touched: ≤ 6 (validation, booking controller, checkout service, patient create path, `CONTRACTS.md`, one test)
- Do not attach a conversation (`clk-04`)
- Do not add `platform = 'web'`
- Do not add a new `booking_origin`. Use `booked`.
- Do not set `date_of_birth` from age
- Do not label the patient `booking_for_other` or `front_desk`. If no current `registered_via` value means a public clinic link, widen that existing check with one operational value in this task.
- Reschedule path unchanged
- No name, phone, age, sex, or reason in logs

**Reference Documentation:**
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)
- [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) — only if `registered_via` must widen
- [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — new patient row and new appointment. PHI: name, phone, age, sex, reason for visit.
- [x] **RLS verified?** Y — write through the service role, scoped to the doctor the slug resolved. Do not add a patient JWT policy that can insert.
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** Y — Razorpay only when prepaid is already on for that doctor, same as token checkout
  - [x] **Consent + redaction confirmed?** Y — booking consent is collected on the request. Do not send the reason to the gateway description if the token path's description would echo it; match the token path's current description behavior and do not add clinical text.
- [x] **Retention / deletion impact?** N — same patient and appointment retention as a token booking

---

## ✅ Task Breakdown

### 1. Accept the bio intake
- [x] 1.1 Validate name, phone, age (1–120), sex (`male` / `female` / `other`), reason, consent, slot, and the catalog picks the token checkout already accepts — 2026-09-23
- [x] 1.2 Refuse the request when consent is not granted, or when age or sex is missing — 2026-09-23
- [x] 1.3 Resolve the doctor from the slug. Unknown slug does not create a row. — 2026-09-23

### 2. Write the visit
- [x] 2.1 Create the patient with `patients.age` and `patients.gender`. Leave `date_of_birth` null. Consent method is the existing `owned_booking_page`. — 2026-09-23
- [x] 2.2 Create the appointment with `conversation_id` null, `booking_origin` `booked`, and the reason on `appointments.reason_for_visit` — 2026-09-23
- [x] 2.3 Apply the same duplicate-on-that-date rule the token checkout uses — 2026-09-23
- [x] 2.4 Block when the doctor is not verified. Do not block on staff-review or on a conversation catalog-finalized flag. The catalog choice on this request is the selection. — 2026-09-23
- [x] 2.5 Prepaid and zero-fee behavior match the token checkout. Success redirect is the existing booking success page, not Instagram. — 2026-09-23

### 3. Verification
- [x] 3.1 Unit test: complete body creates patient + appointment; missing consent fails; unverified doctor fails; `date_of_birth` stays null; token checkout still books — 2026-09-23
- [x] 3.2 Typecheck and lint the touched files — 2026-09-23
- [x] 3.3 Contract note for the slug checkout — 2026-09-23

---

## 📁 Files to Create/Update

- ⚠️ `selectSlotAndPayBodySchema` / booking controller — EXISTS, token required
- ⚠️ `processSlotSelectionAndPay` — EXISTS, loads a conversation
- ⚠️ `createPatientForBooking` — EXISTS, wrong provenance if called as-is
- ⚠️ `CONTRACTS.md` — EXISTS
- ❌ Unit test for the slug checkout — MISSING
- ⚠️ `patients.registered_via` check — EXISTS (`bot`, `front_desk`, `booking_for_other`, `import`). Widen only if none of those is an honest label.

**When updating existing code:**
- [ ] Audit callers of token checkout before changing shared helpers
- [ ] Remove no token-path behavior

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Zod in the controller. Service owns the write. Typed `AppError` only.
- Service-role write. No patient-scoped insert policy.
- No PHI in logs. Audit logs get ids only.
- Same payment rules as `/book`. No new gateway.
- `/book?token=` behavior stays.

---

## ✅ Acceptance & Verification Criteria

- [x] No-token checkout creates one patient and one appointment for that slug's doctor — 2026-09-23
- [x] Age and sex are stored. Date of birth is null. Conversation id is null. Origin is `booked`. — 2026-09-23
- [x] Unverified doctor cannot book — 2026-09-23
- [x] Token checkout and reschedule are unchanged — 2026-09-23
- [x] Logs have no name, phone, age, sex, or reason — 2026-09-23

---

## 📝 Notes

CLK-DL-3, CLK-DL-4, CLK-DL-5. Optional `?c=` is clk-04. SMS is clk-06.

`registered_via` gained `public_clinic` in `242_patients_registered_via_public_clinic.sql`. Migrations 241 and 242 are written and unit-tested. They are not applied to a database from this task.

The API `redirectUrl` is `{BOOKING_PAGE_URL}/success`. The success page still expects a token and sends the visitor toward Instagram; that page change is clk-05.

---

## 🔗 Related Tasks

- [`task-clk-02-public-read.md`](./task-clk-02-public-read.md)
- [`task-clk-04-optional-conversation.md`](./task-clk-04-optional-conversation.md)

**Last Updated:** 2026-09-23
