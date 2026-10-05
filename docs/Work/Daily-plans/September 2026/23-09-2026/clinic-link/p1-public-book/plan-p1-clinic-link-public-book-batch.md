# Plan p1 — Clinic link: the public page books

## 23 Sep 2026 — Batch `clinic-link` / `p1-public-book` (`clk-01..08`)

> **Status:** **In progress** 2026-09-24. `clk-01` through `clk-08` are walked. Every acceptance box below is checked except the live SMS: Twilio is not configured in this environment, so the checkout skipped the text. The appointment still stood. The SMS unit suite covers practice, when, and no reason.
> **Product plan:** [`plan-clinic-link.md`](../../../../../Product%20plans/plan-clinic-link.md) (CLK-DL-1…12)
> **Program:** [`../README.md`](../README.md) · Prefix `clk`
> **Exec order:** [`Tasks/EXECUTION-ORDER-p1-clinic-link-public-book.md`](./Tasks/EXECUTION-ORDER-p1-clinic-link-public-book.md)

---

## Why this phase

A clinic cannot put today's booking link in a bio. `buildBookingPageUrl` mints a token bound to a DM conversation, and `processSlotSelectionAndPay` refuses to run without that conversation. Phase 1 makes `/d/:slug` book with no chat, and makes the bot send that same page when a chat exists.

Prep, photos, and the show-up lines are Phases 2–4. They are not in this batch.

---

## Decision lock

CLK-DL-1…12 are locked in the product plan. Do not re-litigate them here.

This phase uses CLK-DL-1 (one page, two ways in), CLK-DL-2 (a form), CLK-DL-3 (book first: name, age, sex, phone, reason, slot, consent), CLK-DL-4 (`patients.age`, `patients.gender`, leave `date_of_birth` null), CLK-DL-5 (no web conversation; attach the DM only when `?c=` verifies), CLK-DL-6 (generated editable slug), CLK-DL-12 only as far as "no new Instagram stage." CLK-DL-7…11 wait for later phases.

---

## What already exists (inspected 2026-09-23)

- `/book` collects name, phone, reason, consent, slot or queue, catalog modality, and pay. It does not collect age or sex. It requires `?token=`.
- `GET /api/v1/bookings/slot-page-info` and `GET /api/v1/bookings/day-slots` and `POST /api/v1/bookings/select-slot-and-pay` all verify a booking token and load a conversation.
- Checkout updates an existing conversation patient. `createPatientForBooking` exists and stamps `registered_via = 'booking_for_other'` and a book-for-other consent method. Do not use that helper unchanged for a bio visitor.
- `patients.age` (1–120) and `patients.gender` exist. Sex on read normalizes to `male` / `female` / `other`.
- `appointments.conversation_id` is nullable. `appointments.booking_origin` already includes `booked`. Desk bookings use a null conversation.
- `doctor_settings.practice_name` is edited in Practice info. Latest settings migration inspected: `240`. No public slug column.
- Twilio `sendSms` exists. Token checkout redirects to the doctor's Instagram URL. `/book/success` exists.
- The payment gate blocks unverified doctors, pending staff review, and an unfinalized multi-service catalog selection. Those last two read conversation state. A bio visitor has none.

---

## Scope Guard — DO NOT TOUCH

- History sidecar, visit documents, illness chips, camera check, share sheet.
- `platform = 'web'` or a new conversations platform.
- Reschedule (`/book` with an appointment id in the token).
- A new `booking_origin` value. Public bookings stay `booked`.
- A new Instagram previsit stage.
- Deriving `date_of_birth` from age.
- Logging name, phone, age, sex, or reason.

---

## Tasks

| ID | Title | Size | Depends on |
|----|-------|------|------------|
| [`clk-01`](./Tasks/task-clk-01-public-slug.md) | Slug on the practice + copyable URL in settings | M | — |
| [`clk-02`](./Tasks/task-clk-02-public-read.md) | Slug-scoped page info and day slots | M | clk-01 |
| [`clk-03`](./Tasks/task-clk-03-public-checkout.md) | Checkout creates the patient and appointment with no conversation | L | clk-02 |
| [`clk-04`](./Tasks/task-clk-04-optional-conversation.md) | Optional `?c=` attaches the DM thread | M | clk-03 |
| [`clk-05`](./Tasks/task-clk-05-public-page.md) | `/d/:slug` page, with age and sex | M | clk-04 |
| [`clk-06`](./Tasks/task-clk-06-booking-sms.md) | SMS confirmation for a booking with no thread | S | clk-03 |
| [`clk-07`](./Tasks/task-clk-07-bot-sends-slug-url.md) | Bot sends `/d/:slug?c=` when a slug exists | S | clk-05 |
| [`clk-08`](./Tasks/task-clk-08-phase-1-gate.md) | Phase 1 gate | M | clk-06, clk-07 |

`clk-06` does not wait on `clk-04` or `clk-05`. The execution order runs it beside the page, after checkout exists.

---

## Acceptance gate

- [x] A dummy patient with no token opens `/d/:slug`, books or joins the queue, and the doctor sees name, age, sex, phone, and reason. `date_of_birth` is null. `conversation_id` is null. `booking_origin` is `booked`. — 2026-09-24
- [x] The same page with a valid `?c=` for that doctor ties the appointment to the conversation, and the existing DM confirmation still sends. — 2026-09-24
- [x] A token for another doctor, or an expired token, does not attach a conversation and does not reveal the other practice. The booking still completes as a bio booking. — 2026-09-24
- [x] The practice can copy and edit the slug. Two practices cannot share one. — 2026-09-24
- [x] `/book?token=` for an already-sent link still books. Reschedule is unchanged. — 2026-09-24
- [x] A bio booking lands on the existing success page, not on Instagram. — 2026-09-24
- [ ] One SMS goes to the phone they typed: practice and when. No reason. No second SMS if a path already sent one. — **Open.** Twilio is not configured here. Each public checkout logged `SMS skipped (Twilio SMS not configured)` and wrote no `notification_sent` row. The visit was still created. `public-clinic-booking-sms.test.ts` covers practice, when, no reason, and no second send.
- [x] Logs: ids and counts only. — 2026-09-24
- [x] Typecheck, lint, and the new suites are green. — 2026-09-24. Lint of the phase sources passed. Backend `tsc --noEmit` still has existing errors in unrelated duplicate files; the phase suites below passed. Frontend `tsc --noEmit` has existing errors in `lib/api.ts` outside this phase; the booking page files are clean.

---

**Created:** 2026-09-23.
**Last Updated:** 2026-09-24
