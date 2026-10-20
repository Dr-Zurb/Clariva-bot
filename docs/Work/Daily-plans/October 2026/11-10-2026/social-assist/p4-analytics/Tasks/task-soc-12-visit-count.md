# Task soc-12: A booking from the card link counts one visit

## 📋 Task Overview

A booking that starts from the card’s code adds one to that card’s visit count. The card never receives the patient.

**Program / Phase:** social-assist · Phase 4 (analytics)
**Batch:** [`plan-p4-social-assist-analytics-batch.md`](../plan-p4-social-assist-analytics-batch.md)
**Execution order:** [`EXECUTION-ORDER-p4-social-assist-analytics.md`](./EXECUTION-ORDER-p4-social-assist-analytics.md)
**Estimated Time:** 6 hours
**Status:** ✅ **COMPLETED** — 2026-10-11. Run migration `251_social_card_visits.sql`. The logged-in dummy booking is still the browser check.

**Change Type:**
- [x] **Update existing** — public checkout already creates a booking from `/d/:slug`

**Current State:**
- ✅ **What exists:** `public-clinic-checkout-service` books from the public page with no card code. `findVisitPageLink` resolves a one-hour chat code to a conversation.
- ❌ **What's missing:** a booking that began at the card’s code increments that card, and only that card.
- ⚠️ **Notes:** This is the PHI boundary of the program. The count is a number. The card must not store a patient id, name, phone, age, or appointment id.

**Scope Guard:**
- Expected files touched: ≤ 6
- Do not change checkout for a visitor who has no card code
- Do not attach the booking to a conversation just because a card code was present
- Do not log the code or any patient field

**Reference Documentation:**
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)
- [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — public checkout already stores the patient on the appointment. This task adds a count on the card. The card side is not PHI.
- [x] **RLS verified?** Y — the count is on the doctor-owned card. The public write path uses the server role and must update only the count.
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N — the count is a number. Deleting the appointment does not have to rewind the count in v1. Do not store the appointment id on the card in order to rewind it.

---

## ✅ Task Breakdown

### 1. Count
- [x] ✅ 1.1 A public booking that presents the card’s code completes the same way a `/d/:slug` booking completes today, and adds one visit on that card - **Completed: 2026-10-11**
- [x] ✅ 1.2 A booking with no code, or a retired code, does not change any card - **Completed: 2026-10-11**
- [x] ✅ 1.3 A code for another doctor does not increment this doctor’s card and does not reveal the other card - **Completed: 2026-10-11**
- [x] ✅ 1.4 After the booking, the card has no patient name, phone, patient id, or appointment id - **Completed: 2026-10-11**

### 2. Verification
- [x] ✅ 2.1 Tests with a dummy patient: one visit added; a second booking without the code does not add; the card row has no patient columns filled - **Completed: 2026-10-11**
- [x] ✅ 2.2 An expired chat code still behaves as it does today - **Completed: 2026-10-11**
- [x] ✅ 2.3 Typecheck and lint the touched files - **Completed: 2026-10-11**
- [ ] 2.4 Browser: a dummy booking from the card link shows the new count on Analytics

---

## 📁 Files to Create/Update

- ⚠️ Public checkout — accept the card code and increment the count
- ⚠️ Analytics row from `soc-11` — show the number

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- The patient stays on the appointment, where checkout already puts them. They do not get copied to the card.
- Do not reuse `findVisitPageLink` for this code.
- Zod on any new public input. No PHI in logs.
- A failed count must not fail a booking that would otherwise succeed. The visit still exists. Record the gap in Notes if you hit it, and do not drop the appointment to keep the count honest.

---

## 📝 Notes

Raise the model if the checkout path is more tangled than this task assumes. The rule that does not bend: the card stores a number, not a person.

---

**Last Updated:** 2026-10-11
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
