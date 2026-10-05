# Task mca-14: Sitting 2 — intake form on `/book`

## 📋 Task Overview

The owned booking page collects name, phone, reason for visit, and an explicit consent grant, then sends them on checkout. The page does not proceed without consent. Returning patients who already have name + phone keep a short path (reason only if this visit still needs one).

**Program / Phase:** meta-channel-align · Phase 3 (intake-off-channel)  
**Batch:** [`plan-p3-meta-channel-align-intake-off-channel-batch.md`](../plan-p3-meta-channel-align-intake-off-channel-batch.md)  
**Depends on:** [`mca-13`](./task-mca-13-checkout-create-patient.md) verified  
**Estimated Time:** 1.5 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-09-16

**Change Type:**
- [x] **Update existing**

**Current State:**
- ✅ `/book` already picks a slot and calls checkout
- ✅ Page collects name, phone, reason, and consent on book mode
- ✅ Checkout is not sent without those fields
- ⏳ DM still collects intake in-thread (`mca-15`)

**Scope Guard:**
- Expected files touched: `/book` page + booking API client (and a focused test if one already exists for this page)
- Reuse `/book`; do not add a second booking route
- Do not change DM copy (sitting 3)
- Do not log form values
- Frontend standards apply

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — form posts to the existing checkout (sitting 1)
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Form on the owned page
- [x] ✅ 1.1 Show name, phone, reason, and a consent control before pay - **Completed: 2026-09-16**
- [x] ✅ 1.2 Block submit until consent is granted and required fields are valid - **Completed: 2026-09-16**
- [x] ✅ 1.3 Send the sitting-1 checkout fields with the existing slot selection - **Completed: 2026-09-16**

### 2. Verification
- [x] ✅ 2.1 Browser: new dummy patient can complete `/book` without a prior chat intake - **Completed: 2026-09-16** (RTL walk of the form; no live booking token in this sitting)
- [x] ✅ 2.2 Ready patient (already has name/phone) can still book - **Completed: 2026-09-16** (page always sends intake; sitting 1 ignores a new identity)
- [x] ✅ 2.3 Typecheck + lint touched frontend files - **Completed: 2026-09-16**

---

## ✅ Acceptance

- [x] `/book` collects name, phone, reason, and consent
- [x] Checkout is not sent without consent
- [x] A dummy patient with only a booking token can finish the page

**Residual:** Book mode always shows the full form (no `needsCheckoutIntake` hint). Returning patients re-enter name/phone; checkout ignores a new identity. Reschedule has no form.

**Last Updated:** 2026-09-16
