# Task clk-04: Optional conversation on the slug checkout

## 📋 Task Overview

When the slug page is opened with a booking token for that same doctor, the appointment attaches to that conversation and the existing DM confirmation still sends. A bad token does not block the booking and does not reveal another practice.

**Program / Phase:** clinic-link · Phase 1 (public-book)
**Batch:** [`plan-p1-clinic-link-public-book-batch.md`](../plan-p1-clinic-link-public-book-batch.md)
**Execution order:** [`EXECUTION-ORDER-p1-clinic-link-public-book.md`](./EXECUTION-ORDER-p1-clinic-link-public-book.md)
**Estimated Time:** 3 hours
**Status:** ✅ **DONE** (2026-09-23)

**Change Type:**
- [x] **Update existing** — slug checkout from clk-03

**Current State:**
- ✅ **What exists:** `verifyBookingToken` yields conversation id, doctor id, and optional appointment id. Token checkout already sends the DM confirmation and updates conversation state. Reschedule tokens carry an appointment id.
- ❌ **What's missing:** the slug checkout ignores `?c=`.
- ⚠️ **Notes:** Waits on clk-03. A reschedule token is not a bio booking. Keep reschedule on the token `/book` path.

**Scope Guard:**
- Expected files touched: ≤ 4 (checkout service, controller validation, one test, contract note if the query changed)
- Do not change the bot's URL (`clk-07`)
- Do not fail the booking when the token is missing, expired, or for another doctor
- Do not log the token or any patient field

**Reference Documentation:**
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)
- [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — sets `appointments.conversation_id` when the token matches
- [x] **RLS verified?** Y — same service-role write as clk-03, and only after the token's doctor matches the slug's doctor
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N — the DM send is the existing confirmation path, not a new integration
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Attach only a matching token
- [x] 1.1 When the token verifies and its doctor is the slug's doctor, set `conversation_id` and run the DM confirmation the token checkout already runs — 2026-09-23
- [x] 1.2 When the token is missing, expired, or for another doctor, book as clk-03 does: null conversation, no DM, no detail about the other practice — 2026-09-23
- [x] 1.3 A reschedule token does not create a second appointment through this path — 2026-09-23

### 2. Verification
- [x] 2.1 Unit test: matching token attaches and confirms; other-doctor token books unattached; expired token books unattached — 2026-09-23
- [x] 2.2 Typecheck and lint the touched files — 2026-09-23

---

## 📁 Files to Create/Update

- ⚠️ Slug checkout from clk-03 — will EXIST
- ⚠️ `verifyBookingToken` — EXISTS
- ❌ Unit test for the three token cases — MISSING

**When updating existing code:**
- [ ] Audit the token confirmation so this task calls it instead of copying it

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Doctor match is mandatory before attach.
- Failure to verify is not an error response for an otherwise valid booking.
- No token material and no PHI in logs.

---

## ✅ Acceptance & Verification Criteria

- [x] Matching `?c=` sets the conversation and sends the existing DM confirmation — 2026-09-23
- [x] A bad token still books, unattached, and leaks nothing — 2026-09-23
- [x] Reschedule is unchanged — 2026-09-23

---

## 📝 Notes

CLK-DL-1, CLK-DL-5. The confirmation this calls is `recordTokenCheckoutOnConversation`, the same conversation-state write token checkout already runs. `sendPaymentConfirmationToPatient` does not send a Meta DM.

---

## 🔗 Related Tasks

- [`task-clk-03-public-checkout.md`](./task-clk-03-public-checkout.md)
- [`task-clk-05-public-page.md`](./task-clk-05-public-page.md)

**Last Updated:** 2026-09-23
