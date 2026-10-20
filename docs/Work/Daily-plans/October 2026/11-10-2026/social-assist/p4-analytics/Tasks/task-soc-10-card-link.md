# Task soc-10: Durable page link on the card

## 📋 Task Overview

When a card leaves Ready, it carries `/d/:slug` plus a code that still works after a day. The one-hour chat codes stay as they are.

**Program / Phase:** social-assist · Phase 4 (analytics)
**Batch:** [`plan-p4-social-assist-analytics-batch.md`](../plan-p4-social-assist-analytics-batch.md)
**Execution order:** [`EXECUTION-ORDER-p4-social-assist-analytics.md`](./EXECUTION-ORDER-p4-social-assist-analytics.md)
**Estimated Time:** 4 hours
**Status:** ✅ **COMPLETED** — 2026-10-11. Run migration `249_social_card_link.sql`.

**Change Type:**
- [x] **New feature** — a durable code for a card
- [x] **Update existing** — the first comment and the timed card from Phase 3

**Current State:**
- ✅ **What exists:** `/d/:slug`. `visit_page_links` expire in one hour and require `conversation_id` (`245_visit_page_links.sql`, `findVisitPageLink`).
- ❌ **What's missing:** a code owned by the card, shown on the card when it leaves Ready.
- ⚠️ **Notes:** Do not add a column to `visit_page_links` to make those codes last longer. A chat link and a post link are different objects.

**Scope Guard:**
- Expected files touched: ≤ 6
- Do not change chat-link expiry
- Do not increment a visit count (`soc-12`)
- Do not log the code

**Reference Documentation:**
- [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md)
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — a code on the doctor’s card. The code is a capability. It is not PHI. It must not be logged.
- [x] **RLS verified?** Y — same doctor-owned row as the card
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** Y — deleting the card retires the code. A retired code must not count a later booking.

---

## ✅ Task Breakdown

### 1. Code
- [x] ✅ 1.1 Read migrations through `245` before adding the next one - **Completed: 2026-10-11**
- [x] ✅ 1.2 A card that takes a time, or is marked posted, gets one durable code if it does not have one - **Completed: 2026-10-11**
- [x] ✅ 1.3 The code still resolves the next day. An expired chat code still expires. - **Completed: 2026-10-11**
- [x] ✅ 1.4 The first comment on that card shows the public page with that code - **Completed: 2026-10-11**
- [x] ✅ 1.5 The code is not written to logs - **Completed: 2026-10-11**

### 2. Verification
- [x] ✅ 2.1 Tests: a new code survives past one hour; a `visit_page_links` code still expires; a second doctor cannot read the code - **Completed: 2026-10-11**
- [x] ✅ 2.2 Update `CONTRACTS.md` - **Completed: 2026-10-11**
- [x] ✅ 2.3 Typecheck and lint the touched files - **Completed: 2026-10-11**

---

## 📁 Files to Create/Update

- ⚠️ Card record from Phase 2 — a durable code
- ❌ Do not alter `245_visit_page_links.sql` behaviour

**When creating a migration:**
- [x] Read previous migrations in numeric order

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- The public page does not have to book from the code yet. That is `soc-12`.
- No patient id on the code.
- No Instagram call.

---

**Last Updated:** 2026-10-11
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
