# Task clk-13: Prep screen and SMS link

## 📋 Task Overview

After the slot is held, the same session offers prep and an equally visible skip. The booking SMS gains the prep URL and still does not mention the reason.

**Program / Phase:** clinic-link · Phase 2 (visit-prep)
**Batch:** [`plan-p2-clinic-link-visit-prep-batch.md`](../plan-p2-clinic-link-visit-prep-batch.md)
**Execution order:** [`EXECUTION-ORDER-p2-clinic-link-visit-prep.md`](./EXECUTION-ORDER-p2-clinic-link-visit-prep.md)
**Estimated Time:** 4 hours
**Status:** ✅ **DONE** (2026-09-27)

**Change Type:**
- [x] **New feature** — the prep screen
- [x] **Update existing** — the Phase 1 booking SMS

**Current State:**
- ✅ **What exists:** Phase 1 `/d/:slug` and its success URL (clk-05, clk-03). clk-06 sends one SMS of practice and when, with no prep URL, once that task has shipped. clk-10 mints the history-form token.
- ✅ **What's missing:** the skip/continue screen, the form, and the prep URL are in. The live browser walk is clk-14.
- ⚠️ **Notes:** Waits on clk-12. If clk-06 has not shipped, stop and finish Phase 1 before adding a second message.

**Scope Guard:**
- Expected files touched: ≤ 5 (prep page, the post-book handoff, the SMS body, one test)
- Do not send a second SMS
- Do not put the reason, age, sex, or a medicine name in the SMS
- Do not add an Instagram stage
- Collection-notice sentence on the form stays `⟨fill — counsel⟩`

**Reference Documentation:**
- [FRONTEND_STANDARDS.md](../../../../../../../Reference/engineering/development/FRONTEND_STANDARDS.md)
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — the screen calls the Phase 2 write. The SMS adds a URL.
- [x] **RLS verified?** Y — the page uses the history-form token. No new policy.
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** Y — the existing Twilio send, one message
  - [x] **Consent + redaction confirmed?** Y — booking consent already covers the confirmation SMS. The new text is the prep URL only.
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Same session
- [x] 1.1 After a successful slug booking, show continue and skip with the same visual weight
- [x] 1.2 Skip leaves the appointment as Phase 1 booked it
- [x] 1.3 Continue opens the empty form from clk-12 and posts to clk-11. Age, sex, and the chart are not on this screen

### 2. One SMS
- [x] 2.1 Add the history-form URL to the clk-06 body. Practice and when stay. Reason stays out.
- [x] 2.2 A booking that already sent the Phase 1 SMS does not send another

### 3. Verification
- [x] 3.1 Unit test: SMS body has the prep URL and no reason; a second send is not invoked
- [x] 3.2 Browser: book a dummy visit, skip, and confirm the appointment remains; book again, continue, and submit one medicine. Walked 2026-09-27 with the clk-14 gate.
- [x] 3.3 Typecheck and lint the touched files

---

## 📁 Files to Create/Update

- ⚠️ `/d/:slug` success handoff from clk-05 — EXISTS once Phase 1 ships
- ❌ Prep form screen — MISSING
- ⚠️ Booking SMS from clk-06 — EXISTS once Phase 1 ships

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Skip and continue are both obvious. Prep is optional.
- The form posts only with the history-form token.
- One SMS. No clinical text beyond the time already allowed in Phase 1.
- No PHI in logs.

---

## ✅ Acceptance & Verification Criteria

- [x] Skip does not cancel the visit
- [x] Continue can submit one medicine on a dummy patient
- [ ] The patient receives one SMS, and it includes the prep URL. Unit test covers the body. Twilio is not configured, so a live text was not sent.

---

## 📝 Notes

CLK-DL-3, CLK-DL-12. Photos are not on this screen.

---

## 🔗 Related Tasks

- [`task-clk-12-patient-history-read.md`](./task-clk-12-patient-history-read.md)
- [`task-clk-14-phase-2-gate.md`](./task-clk-14-phase-2-gate.md)

**Last Updated:** 2026-09-23
