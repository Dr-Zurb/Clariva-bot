# Task mca-15: Sitting 3 — DM hands the link first

## 📋 Task Overview

A new booking conversation on Instagram sends the Halo Aid booking link instead of collecting name, phone, reason for visit, or consent in the thread. FAQ and emergency copy stay.

**Program / Phase:** meta-channel-align · Phase 3 (intake-off-channel)  
**Batch:** [`plan-p3-meta-channel-align-intake-off-channel-batch.md`](../plan-p3-meta-channel-align-intake-off-channel-batch.md)  
**Depends on:** [`mca-14`](./task-mca-14-book-page-intake.md) verified (`/book` can accept a cold link)  
**Estimated Time:** 1 hour  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-09-16

**Change Type:**
- [x] **Update existing**

**Current State:**
- ✅ Booking token + `/book?token=` link builders already exist
- ✅ New booking intent now hands that link (no in-thread intake)
- ✅ In-flight collecting / consent / confirm steps also hand the link
- ✅ Emergency / non-interpretation rules already exist — kept
- ⏳ Phase 3 dummy-patient walk is `mca-11`

**Scope Guard:**
- Do not strip the emergency gate (MCA-DL-5)
- Do not collect reason, name, phone, or consent in-thread for a new booking
- Do not start Phase 2 opt-out work here
- Keep FAQ answers that are not intake

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N — conversation stage / copy only
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** Y — existing classify/respond, less collection
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Link-first receptionist
- [x] ✅ 1.1 New booking intent goes to the owned-page link, not the intake questions - **Completed: 2026-09-16**
- [x] ✅ 1.2 Emergency copy still fires - **Completed: 2026-09-16** (gate untouched; post-crisis resume now hands the link)
- [x] ✅ 1.3 FAQ paths that are not intake keep working - **Completed: 2026-09-16** (fee-quote-only path kept)

### 2. Verification
- [x] ✅ 2.1 Focused worker / copy tests for the new-booking path - **Completed: 2026-09-16**
- [x] ✅ 2.2 Typecheck + lint touched files - **Completed: 2026-09-16**

---

## ✅ Acceptance

- [x] A new dummy-patient booking thread does not ask for name, phone, reason, or consent
- [x] The thread includes the Halo Aid booking link
- [x] Emergency replies still work

**Residual:** Book-for-someone-else no longer collects the other person in chat; `/book` writes the conversation patient. In-flight patient-match “no” now hands `/book`. Reason-first / medical FAQ now hands `/book` instead of asking clinical follow-ups. Implicit funnel details/confirm/consent now hands `/book`; extract/persist removed from that stage (2026-09-16 follow-up). Reply prompt no longer teaches in-thread intake. Golden preview/corpus aligned.

**Last Updated:** 2026-09-16
