# Task clk-14: Phase 2 gate

## 📋 Task Overview

Walk the Phase 2 acceptance gate on dummy data. Record what passed. Do not add behavior.

**Program / Phase:** clinic-link · Phase 2 (visit-prep)
**Batch:** [`plan-p2-clinic-link-visit-prep-batch.md`](../plan-p2-clinic-link-visit-prep-batch.md)
**Execution order:** [`EXECUTION-ORDER-p2-clinic-link-visit-prep.md`](./EXECUTION-ORDER-p2-clinic-link-visit-prep.md)
**Estimated Time:** 3 hours
**Status:** ✅ **DONE** (2026-09-27)

**Change Type:**
- [x] **Update existing** — check the gate and the task boxes

**Current State:**
- ✅ **What exists:** clk-09 through clk-13, once they are done. Doctor accept already writes a medicine as `source = 'self'`.
- ❌ **What's missing:** a recorded pass of the batch gate.
- ⚠️ **Notes:** Dummy patients only. No real phone numbers in the notes.

**Scope Guard:**
- Expected files touched: the batch plan gate checkboxes and a short note of commands
- Do not add a feature to make the gate pass
- If a box fails, stop and name the task that owns the fix

**Reference Documentation:**
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)
- [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — dummy patient and dummy appointment only
- [x] **RLS verified?** Y — same paths as clk-11 and the existing doctor accept
- [x] **Any PHI in logs?** No — confirm a log line from the submit has ids and counts only
- [x] **External API or AI call?** N — do not send the SMS to a real number; assert the body in the test or a captured dummy send
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Walk the gate
- [x] 1.1 Dummy submit of one medicine and “since 3 days, worse.” Chart unchanged until accept. Accept writes `source = 'self'`.
- [x] 1.2 Second submit is 409. A desk row stays unchanged and hides the three lists. Chips still save.
- [x] 1.3 Public GET does not include chart allergies, medicines, or conditions
- [x] 1.4 Booking token and join token cannot submit. Skip leaves the appointment
- [x] 1.5 Desk history UI unchanged. One SMS, with the prep URL and no reason

### 2. Record
- [x] 2.1 Check the batch gate boxes with the date
- [x] 2.2 Note the typecheck, lint, and test commands that ran

---

## 📁 Files to Create/Update

- ⚠️ [`plan-p2-clinic-link-visit-prep-batch.md`](../plan-p2-clinic-link-visit-prep-batch.md) — gate checkboxes

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- No new routes, columns, or copy in this task.
- Dummy data only.
- No PHI in the gate note.

---

## ✅ Acceptance & Verification Criteria

- [x] Every batch gate box is checked or a blocking task is named
- [x] Commands are recorded

---

## 📝 Notes

Walked 2026-09-27 on dummy visits. Chart stayed empty until doctor accept, which wrote `source = self`. Second submit 409. Desk row hidden and unchanged; chips saved. Public GET omitted a chart allergy. Booking token 401, join token 401, cancelled visit 410. Skip left the visit pending. Browser: Skip and Continue on `/book/success`, then the prep form saved “since” and “worse”. Dummy visits were cancelled. Server log did not contain the medicine, the reason, or the phone. Twilio skipped the live SMS.

Commands: `npx jest` on the five Phase 2 suites (18 tests). `npx eslint` on the Phase 2 backend and frontend files, exit 0. `npx tsc --noEmit` exit 2 only in pre-existing `* 2.ts` duplicates, not in Phase 2 files. Frontend `npx vitest run` on the success page and prep page, 7 tests.

Phase 3 (photos) stays untasked. The gate is green.

---

## 🔗 Related Tasks

- [`task-clk-13-prep-screen-and-sms.md`](./task-clk-13-prep-screen-and-sms.md)

**Last Updated:** 2026-09-23
