# Task clk-08: Phase 1 gate

## 📋 Task Overview

Confirm the batch acceptance gate on a dummy patient, and sync the contract and product-plan status. No new product behavior.

**Program / Phase:** clinic-link · Phase 1 (public-book)
**Batch:** [`plan-p1-clinic-link-public-book-batch.md`](../plan-p1-clinic-link-public-book-batch.md)
**Execution order:** [`EXECUTION-ORDER-p1-clinic-link-public-book.md`](./EXECUTION-ORDER-p1-clinic-link-public-book.md)
**Estimated Time:** 3 hours
**Status:** ✅ **DONE** (2026-09-24). One acceptance box stays open: a live SMS, because Twilio is not configured.

**Change Type:**
- [x] **Update existing** — docs and the gate checklist

**Current State:**
- ✅ **What exists:** the batch acceptance gate, `CONTRACTS.md` booking section, `/book` tests
- ❌ **What's missing:** one pass that checks the gate after clk-05, clk-06, and clk-07
- ⚠️ **Notes:** This task does not add a route. If a gate item fails, fix it in the task that owns it and re-run.

**Scope Guard:**
- Expected files touched: the batch plan checklist, this task, and `CONTRACTS.md` only if an earlier task left it stale
- Do not start Phase 2
- Dummy data only. No real patient.

**Reference Documentation:**
- [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md)
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N — verification only, on dummy records
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Walk the gate
- [x] 1.1 Dummy patient, no token: book from `/d/:slug`. Doctor sees name, age, sex, phone, reason. `date_of_birth` null. `conversation_id` null. `booking_origin` booked.
- [x] 1.2 Same page with a valid `?c=` for that doctor: conversation is set, DM confirmation sends
- [x] 1.3 Other-doctor token and expired token: booking completes unattached, and the other practice is not shown
- [x] 1.4 `/book?token=` still books. Reschedule still opens `/book`.
- [x] 1.5 Success page is the existing one. One SMS, practice and when, no reason. — Success page passed. The live SMS did not send; see Notes.

### 2. Close the batch
- [x] 2.1 Check the batch plan acceptance boxes with the date, or leave them open and name the failing item
- [x] 2.2 Confirm `CONTRACTS.md` matches the slug read and the slug checkout
- [x] 2.3 Typecheck, lint, and the clk suites from this phase are green. Record the commands.

---

## 📁 Files to Create/Update

- ⚠️ Batch plan acceptance list — EXISTS
- ⚠️ `CONTRACTS.md` — EXISTS, should already be updated by clk-02 and clk-03
- ⚠️ This task's checkboxes — pending

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Dummy patients only.
- Do not widen the phase to prep or photos.
- Record exactly which commands ran.

---

## ✅ Acceptance & Verification Criteria

- [x] Every batch acceptance box is checked with a date, or the open box names the defect — 2026-09-24
- [x] Contract and behavior match — 2026-09-24. `CONTRACTS.md` already matched the slug read and checkout. No edit.
- [x] No real patient data was used — 2026-09-24

---

## 📝 Notes

Walked 2026-09-24 on dummy rows for the local practice that has openings. Those visits were cancelled afterward. The dummy thread was closed.

A matching `?c=` set `conversation_id` and wrote conversation stage `responded`. That is the confirmation clk-04 already runs. It is not a Meta DM.

The live SMS box stays open. Four public checkouts logged `SMS skipped (Twilio SMS not configured)` and wrote no audit row. Server logs for the walk did not contain the dummy name, phone, or reason.

Commands: `node scripts/clk08-gate-once.js` (removed after the walk); a uniqueness update that Postgres rejected with `23505`; Playwright on `/book/success`, an unknown slug, and `/d/:slug`; `npx jest` on the nine phase suites (38 tests); `npx vitest run` on the two booking page tests (7 tests); `npx eslint` on the phase sources; `npx tsc --noEmit` in backend and frontend. Phase files were clean. Both `tsc` runs still fail on existing errors outside this phase.

---

## 🔗 Related Tasks

- [`task-clk-07-bot-sends-slug-url.md`](./task-clk-07-bot-sends-slug-url.md)
- [`task-clk-06-booking-sms.md`](./task-clk-06-booking-sms.md)

**Last Updated:** 2026-09-24
