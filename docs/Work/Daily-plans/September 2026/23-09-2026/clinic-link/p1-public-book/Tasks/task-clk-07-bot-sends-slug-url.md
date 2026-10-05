# Task clk-07: Bot sends the slug URL

## 📋 Task Overview

When the practice has a public slug, the booking link in the DM is `/d/:slug?c=` plus the existing booking token. When it has no slug, the bot keeps sending `/book?token=`. Reschedule links stay on `/book`.

**Program / Phase:** clinic-link · Phase 1 (public-book)
**Batch:** [`plan-p1-clinic-link-public-book-batch.md`](../plan-p1-clinic-link-public-book-batch.md)
**Execution order:** [`EXECUTION-ORDER-p1-clinic-link-public-book.md`](./EXECUTION-ORDER-p1-clinic-link-public-book.md)
**Estimated Time:** 2 hours
**Status:** ✅ **DONE** (2026-09-23)

**Change Type:**
- [x] **Update existing** — `buildBookingPageUrl`

**Current State:**
- ✅ **What exists:** `buildBookingPageUrl` and `buildReschedulePageUrl` in `slot-selection-service.ts`. Copy in `booking-link-copy.ts`. Tests lock the English booking-link bytes (`dm-copy-lang-22`).
- ❌ **What's missing:** the slug form of the book URL.
- ⚠️ **Notes:** Start only after clk-05 is green, so this URL has a page. Do not change reschedule. Do not collect intake in the DM.

**Scope Guard:**
- Expected files touched: ≤ 4 (`buildBookingPageUrl` caller path, booking-link copy if the URL is the only change, the lang-22 snapshot, one unit test)
- Fallback to the current URL when the slug is missing
- Do not put the slug in reschedule
- Do not log the token

**Reference Documentation:**
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N — URL shape only. The token is the existing booking token.
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Switch the book URL
- [x] 1.1 When the practice has a slug, the DM book link is `/d/:slug` with the booking token in `c`
- [x] 1.2 When the slug is missing, the link stays `/book?token=`
- [x] 1.3 Reschedule stays on `buildReschedulePageUrl`

### 2. Verification
- [x] 2.1 Unit test: slug present → `/d/:slug?c=`; slug missing → current URL; reschedule unchanged
- [x] 2.2 Update the booking-link snapshot only for the URL change. Surrounding English copy stays byte-identical.
- [x] 2.3 Typecheck and lint the touched files

---

## 📁 Files to Create/Update

- ⚠️ `buildBookingPageUrl` — EXISTS
- ⚠️ `buildReschedulePageUrl` — EXISTS, do not change
- ⚠️ `backend/src/utils/booking-link-copy.ts` — EXISTS
- ⚠️ `backend/tests/unit/utils/dm-copy-lang-22.test.ts` — EXISTS

**When updating existing code:**
- [x] Audit every caller of `buildBookingPageUrl` before changing the string

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Same token as today. Only the path changes.
- Missing slug is a fallback, not an error to the patient.
- No new DM stage and no intake questions in the thread.

---

## ✅ Acceptance & Verification Criteria

- [x] A practice with a slug gets `/d/:slug?c=` in the book DM — 2026-09-23
- [x] A practice without a slug still gets `/book?token=` — 2026-09-23
- [x] Reschedule copy and URL are unchanged — 2026-09-23
- [x] English copy around the URL is byte-identical — 2026-09-23

---

## 📝 Notes

CLK-DL-1. Book-link callers pass `public_slug`. Cancel and reschedule handoffs still call the two-argument form, so those DMs stay on `/book?token=`. The English wrapper in lang-22 is unchanged; a slug-shaped URL only replaces the link.

---

## 🔗 Related Tasks

- [`task-clk-05-public-page.md`](./task-clk-05-public-page.md)
- [`task-clk-08-phase-1-gate.md`](./task-clk-08-phase-1-gate.md)

**Last Updated:** 2026-09-23
