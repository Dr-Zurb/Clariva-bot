# Unified Slot + Payment Flow & Appointment Status

**Date:** 2026-03-14  
**Status:** Planning  
**Goal:** Reduce chat round-trips by combining slot selection and payment in one external page; add real appointment status lookup for the bot.

---

## Current Flow (Problems)

1. Patient says "book appointment"
2. Bot collects details (name, age, gender, phone, reason, email)
3. Bot asks consent
4. Bot shares link → user opens **slot selection page**
5. User selects slot → **redirected back to chat**
6. Bot: "You selected X. Reply Yes to confirm"
7. User says "yes" in chat
8. Bot creates appointment, sends **payment link in chat**
9. User clicks payment link → pays on Razorpay
10. Confirmation email sent

**Pain points:**
- Multiple round-trips between chat and external links
- User must return to chat to confirm slot, then receive payment link
- Bot deflects appointment status: "check your message or contact clinic"

---

## Proposed Flow

1. Patient says "book appointment"
2. Bot collects details
3. Bot asks consent
4. Bot shares **one link** for slot selection + payment
5. User opens link:
   - **Step 1:** See available slots, select one
   - **Step 2:** Payment page (Razorpay) shown or redirect
   - **Step 3:** After payment, slot is booked
   - **Step 4:** Redirect back to chat with success
6. Confirmation email sent (after payment webhook)
7. Bot can **look up and report** appointment status when asked

---

## Implementation Plan

### Part A: Unified Slot + Payment on Booking Page

#### A.1 Backend: New API `select-slot-and-pay`

**Endpoint:** `POST /api/v1/bookings/select-slot-and-pay`  
**Body:** `{ token, slotStart }`  
**Auth:** Token-based (same as select-slot)

**Logic:**
1. Verify token → get `conversationId`, `doctorId`
2. Validate slot (not past, available)
3. Load conversation → get `patient_id`
4. Load patient (name, phone) via `findPatientByIdWithAdmin`
5. Load doctor settings (fee, currency, country)
6. **Create appointment** (status: pending) via `bookAppointment`
7. **Create payment link** via `createPaymentLink` with `callback_url` = our success page
8. Save slot selection, update conversation state to `responded` (no confirming_slot)
9. Return: `{ paymentUrl, redirectUrl, appointmentId }`

**Callback URL for Razorpay:**  
`https://clariva-bot.vercel.app/book/success?token={bookingToken}`  
Razorpay redirects here after payment. Our success page then redirects to chat.

**Files:**
- `backend/src/controllers/booking-controller.ts` – add handler
- `backend/src/routes/api/v1/bookings.ts` – add route
- `backend/src/utils/validation.ts` – reuse `validateSelectSlotBody`
- `backend/src/services/payment-service.ts` – ensure `createPaymentLink` accepts `callbackUrl` (Razorpay adapter already supports it)

#### A.2 Backend: Payment Link Callback URL

When creating payment link for this flow, pass:
```ts
callbackUrl: `${env.BOOKING_PAGE_URL}/success?token=${token}`
```
Razorpay redirects user here after payment. The `/book/success` page will:
- Show "Payment successful! Redirecting to chat…"
- Redirect to `getRedirectUrlForDoctor(doctorId)` (Instagram DM)

#### A.3 Frontend: Booking Page – Add Payment Step

**Current:** Select slot → `selectSlot` → redirect to chat  
**New:** Select slot → `selectSlotAndPay` → get `paymentUrl` → redirect to paymentUrl (Razorpay)

**Flow:**
1. User selects slot, clicks "Continue to payment"
2. Call `POST /bookings/select-slot-and-pay` with `{ token, slotStart }`
3. Receive `{ paymentUrl }`
4. `window.location.href = paymentUrl` (Razorpay hosted page)
5. User pays on Razorpay
6. Razorpay redirects to `/book/success?token=...` (we need to pass token in callback; Razorpay may not support dynamic callback with token—check)
7. Success page: show message, redirect to chat

**Razorpay callback:** Razorpay Payment Links use `callback_url` and `callback_method`. The callback receives query params from Razorpay (e.g. `razorpay_payment_link_id`, `razorpay_payment_link_reference_id`). Our `reference_id` is `appointmentId`. So we can look up the appointment from the payment. But we need the booking token to redirect to chat. Options:
- Store `conversationId` in payment `notes`; on callback, look up conversation → get doctorId → get redirect URL
- Or: pass token in callback_url: `callback_url: ${base}/book/success?token=${token}` — the token is in the URL

So we can include the token in the callback URL when creating the payment link. Good.

#### A.4 Frontend: Success Page

**New page:** `frontend/app/book/success/page.tsx`

- Read `token` from query
- Verify token (optional; page is public)
- Show: "Payment successful! Your appointment is confirmed. Redirecting you to the chat…"
- Redirect to `getRedirectUrlForDoctor(doctorId)` — we need an API to get redirect URL from token: `GET /bookings/redirect-url?token=X` → `{ redirectUrl }`

#### A.5 Backend: Redirect URL API

**Endpoint:** `GET /api/v1/bookings/redirect-url?token=X`  
**Returns:** `{ redirectUrl }` (Instagram DM URL for the doctor)

Used by success page to redirect user back to chat.

#### A.6 Webhook Worker: Remove Chat Confirmation Step

When we use the new flow:
- Bot sends link
- User completes slot + payment on external page
- No "Reply Yes to confirm" in chat

So we need to **keep the old flow as fallback** OR **fully migrate** to the new flow.

**Recommendation:** Fully migrate. When bot sends the link, the link now does slot + payment. We remove the `confirming_slot` step from the worker. The `processSlotSelection` is replaced by `processSlotSelectionAndPay` for the new API. The old `select-slot` can remain for backwards compatibility but the frontend will call the new endpoint.

**Worker changes:**
- When we send the slot link, we no longer expect "yes" in chat
- The slot-selection-service `processSlotSelection` is used by the OLD flow (select → redirect → confirm in chat)
- The NEW flow uses a different API that creates appointment + payment in one go
- So we need a new service function and the frontend uses it

**Simpler approach:** Modify the existing `select-slot` API to optionally create appointment + payment. Add a query param `?withPayment=true` or a new endpoint. The frontend always uses the new endpoint when the doctor has a fee configured.

---

### Part B: Appointment Status Lookup

#### B.1 Backend: List Appointments for Patient

**New function:** `listAppointmentsForPatient(patientId: string, doctorId: string, correlationId: string): Promise<Appointment[]>`

- Uses admin client (webhook worker context)
- Query: `appointments` where `patient_id = X` and `doctor_id = Y`
- Order by `appointment_date` desc
- Return upcoming (date >= today) first, then past

**File:** `backend/src/services/appointment-service.ts`

#### B.2 Webhook Worker: Handle `check_appointment_status`

**Current:** Hardcoded "check your message or contact clinic"

**New:**
1. Get `conversation.patient_id`, `conversation.doctor_id`
2. Call `listAppointmentsForPatient(patientId, doctorId, correlationId)`
3. Filter: upcoming (status in [pending, confirmed], date >= now)
4. If found: format reply, e.g. "Your next appointment is on [date] at [time]. Status: [pending/confirmed]. [Payment: pending/paid if relevant]."
5. If none: "You don't have any upcoming appointments. Say 'book appointment' to schedule one."

**File:** `backend/src/workers/webhook-worker.ts`

---

## Task Breakdown

| # | Task | Effort | Deps |
|---|------|--------|------|
| 1 | [e-task-1: Appointment status lookup](./e-task-1-appointment-status-lookup.md) | M | — |
| 2 | [e-task-2: Select slot and pay API](./e-task-2-select-slot-and-pay-api.md) | M | — |
| 3 | [e-task-3: Booking page + success page](./e-task-3-booking-page-success-page.md) | M | e-task-2 |
| 4 | [e-task-4: Worker migration](./e-task-4-worker-migration-unified-flow.md) | M | e-task-2, e-task-3 |

---

## Edge Cases

1. **Doctor has no fee:** New flow creates appointment but no payment. Redirect to success without payment step. (Or keep old flow for no-fee case.)
2. **Payment fails:** User is on Razorpay page. They can retry or abandon. No appointment created until payment? No—we create appointment first (pending), then payment confirms it. If they abandon, we have a pending appointment. We could add a job to cancel unpaid pending appointments after 24h.
3. **Slot taken between selection and payment:** Race condition. We create appointment in select-slot-and-pay, so we hold the slot. ConflictError if slot was just taken—return error to frontend.
4. **Token expiry:** Booking token has exp. If expired on success page, still redirect to chat (degraded UX but safe).

---

## Migration

- Deploy backend with new API
- Deploy frontend with new flow
- Old links (if any) that use `select-slot` would still work but redirect to chat for confirmation—we could deprecate that and have the frontend always use select-slot-and-pay when fee > 0

---

## Summary

| Area | Change |
|------|--------|
| **Booking page** | Slot select → payment (same page flow) → redirect to chat |
| **Bot** | Sends one link; no "Reply Yes to confirm" |
| **Appointment status** | Bot looks up and reports real status |
| **Confirmation email** | Already sent after payment (recent fix) |
