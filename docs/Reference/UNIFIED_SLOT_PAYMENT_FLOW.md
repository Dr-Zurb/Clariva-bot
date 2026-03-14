# Unified Slot + Payment Flow

**Purpose:** Canonical reference for the streamlined booking flow where slot selection and payment happen on one external page. Reduces chat round-trips.

**Status:** Design reference. Implements flow from [unified-slot-payment-flow-and-appointment-status.md](../Development/Daily-plans/March%202026/2026-03-14/unified-slot-payment-flow-and-appointment-status.md).

**Related:** [APPOINTMENT_BOOKING_FLOW_V2.md](./APPOINTMENT_BOOKING_FLOW_V2.md), [e-task-1 through e-task-4](../Development/Daily-plans/March%202026/2026-03-14/)

---

## Flow Overview

| Phase | Step | Bot Action | User Response |
|-------|------|------------|---------------|
| 1 | Collect | "To book, share: Full name, Age, Mobile, Reason for visit. Email (optional), Gender (optional)." | Partial or full details |
| 2 | Confirm details | "Let me confirm: **Name**, **Age**, **Gender**, … Is this correct? Reply Yes or tell me what to change." | "Yes" or correction |
| 3 | Consent | "Thanks, [Name]. We'll use your phone to confirm. Ready to pick a time?" | "Yes" |
| 4 | Slot link | "Pick your slot and complete payment here: [link]. You'll be redirected back to this chat when done." | User opens link |
| 5 | External page | User selects date + slot → clicks "Continue to payment" | — |
| 5 | API | Frontend calls `POST /bookings/select-slot-and-pay` → creates appointment + payment link | — |
| 5 | Payment | User redirected to Razorpay → pays | — |
| 5 | Success | Razorpay redirects to `/book/success?token=X` → page redirects to Instagram chat | — |
| 6 | Done | Confirmation email sent after payment webhook | — |

**No** "Reply Yes to confirm" in chat. Slot + payment happen entirely on the external page.

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/bookings/select-slot-and-pay` | POST | Create appointment + payment link; return paymentUrl |
| `/api/v1/bookings/redirect-url` | GET | Return Instagram DM URL for success page redirect |
| `/api/v1/bookings/day-slots` | GET | Existing; fetch slots for date |
| `/api/v1/bookings/slot-page-info` | GET | Existing; fetch practice name |

---

## State Machine (Simplified)

| State | Description |
|-------|-------------|
| `collecting_all` | Asking for details |
| `confirm_details` | Read back summary; waiting for Yes or correction |
| `consent` | Combined consent; waiting for Yes |
| `awaiting_slot_selection` | Sent slot link; user completes on external page or says "change" |
| `responded` | Flow complete |

**Removed:** `confirming_slot` — no chat confirmation after slot selection.

---

## Appointment Status

When user asks "check status" / "appointment status" / "when is my visit":

- Bot calls `listAppointmentsForPatient(patientId, doctorId)`
- Returns upcoming appointments (date, time, status)
- If none: "You don't have any upcoming appointments. Say 'book appointment' to schedule one."

---

## Edge Cases

| Case | Behavior |
|------|----------|
| Doctor has no fee | API creates appointment, returns redirectUrl only; no payment step |
| Slot taken | 409 Conflict; frontend shows "This slot was just taken. Please pick another." |
| Payment abandoned | Appointment remains pending; can add cleanup job later |
| Token expired on success page | Still redirect to chat; show message if redirect fails |

---

## Task Files

- [e-task-1: Appointment status lookup](../Development/Daily-plans/March%202026/2026-03-14/e-task-1-appointment-status-lookup.md)
- [e-task-2: Select slot and pay API](../Development/Daily-plans/March%202026/2026-03-14/e-task-2-select-slot-and-pay-api.md)
- [e-task-3: Booking page + success page](../Development/Daily-plans/March%202026/2026-03-14/e-task-3-booking-page-success-page.md)
- [e-task-4: Worker migration](../Development/Daily-plans/March%202026/2026-03-14/e-task-4-worker-migration-unified-flow.md)

---

**Last Updated:** 2026-03-14
