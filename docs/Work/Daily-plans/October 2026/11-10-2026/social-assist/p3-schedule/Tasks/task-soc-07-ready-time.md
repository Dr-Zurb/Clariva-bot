# Task soc-07: A time on a Ready card

## 📋 Task Overview

A Ready card with a file can store a time. The time does not publish anything.

**Program / Phase:** social-assist · Phase 3 (schedule)
**Batch:** [`plan-p3-social-assist-schedule-batch.md`](../plan-p3-social-assist-schedule-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-social-assist-schedule.md`](./EXECUTION-ORDER-p3-social-assist-schedule.md)
**Estimated Time:** 3 hours
**Status:** ✅ **COMPLETED** — time is stored 2026-10-11. Run migration `248_social_card_time.sql`. Schedule list is `soc-08`.

**Change Type:**
- [x] **Update existing** — the card from Phase 2

**Current State:**
- ✅ **What exists:** a Ready card with a file (`soc-05`). Public slug on `doctor_settings`.
- ❌ **What's missing:** a stored time, and a refusal when the file is missing.
- ⚠️ **Notes:** The durable per-card code is `soc-10`. This task may show `/d/:slug` with no code.

**Scope Guard:**
- Expected files touched: ≤ 5
- No Instagram publish call. No paste-URL field. No visit count.
- Do not write to `visit_page_links`

**Reference Documentation:**
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)
- [v1.md](../../../../../../Product%20plans/social-assist/v1.md) DL-8, DL-13

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — a time on the doctor’s card
- [x] **RLS verified?** Y — inherited. The time is on the same doctor-owned row.
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N — the time dies with the card

---

## ✅ Task Breakdown

### 1. Time
- [x] ✅ 1.1 A Ready card with a file accepts a date and time - **Completed: 2026-10-11**
- [x] ✅ 1.2 A card without a file cannot accept a time - **Completed: 2026-10-11**
- [x] ✅ 1.3 Clearing the time returns the card to Ready - **Completed: 2026-10-11**
- [x] ✅ 1.4 The card shows that the doctor posts from the phone at that time. There is no Publish button that calls Instagram. - **Completed: 2026-10-11**

### 2. Verification
- [x] ✅ 2.1 Test: time saved, time rejected without a file, clear returns to Ready, no outbound publish client is invoked - **Completed: 2026-10-11**
- [x] ✅ 2.2 Update `CONTRACTS.md` for the time fields - **Completed: 2026-10-11**
- [x] ✅ 2.3 Typecheck and lint the touched files - **Completed: 2026-10-11**

---

## 📁 Files to Create/Update

- ⚠️ Card record and API from `soc-03` — a time
- ⚠️ Ready card UI from `soc-05` — set and clear the time

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Storing a time is not a publish.
- Do not add Drafts, Approvals, or Sent.
- Zod on the controller. No PHI in logs.

---

**Last Updated:** 2026-10-11
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
