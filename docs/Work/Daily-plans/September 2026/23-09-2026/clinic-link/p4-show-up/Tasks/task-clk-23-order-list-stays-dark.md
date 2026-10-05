# Task clk-23: Order list stays dark

## 📋 Task Overview

A follow-up with an open desk test sees no test label on the prep page or the visit hub. A patient upload does not close that order.

**Program / Phase:** clinic-link · Phase 4 (show up ready)
**Batch:** [`plan-p4-clinic-link-show-up-batch.md`](../plan-p4-clinic-link-show-up-batch.md)
**Execution order:** [`EXECUTION-ORDER-p4-clinic-link-show-up.md`](./EXECUTION-ORDER-p4-clinic-link-show-up.md)
**Estimated Time:** 2 hours
**Status:** ✅ **DONE** (2026-09-27)

**Change Type:**
- [x] **Update existing** — a guard, not a new list

**Current State:**
- ✅ **What exists:** `listPendingLabAppointments` in `desk-lab-orders-service.ts` is a staff read. It returns `patient_name` and order labels. Fulfillment rows live on `visit_lab_order_fulfillments`. Desk visit-prep’s order loop is still in progress. Phase 3 already uploads a patient file without writing a fulfillment.
- ❌ **What's missing:** an explicit guard so this phase does not grow a public order list while that staff read is unfinished.
- ⚠️ **Notes:** Does not wait on clk-20. The product plan’s “show the label” line is deferred with this task, not built.

**Scope Guard:**
- Expected files touched: ≤ 3 (a test, and a contract sentence if the public history shape is documented)
- Do not add a public order route
- Do not call `listPendingLabAppointments` from a public controller
- Do not write `visit_lab_order_fulfillments` from the patient photo path
- Do not return `patient_name` or a test label on the prep token or the join token

**Reference Documentation:**
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)
- [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N — this task adds no read of orders on the public path
- [x] **RLS verified?** Y — the staff read stays behind the desk login. No new policy.
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Stay dark
- [ ] 1.1 Public history GET and the patient snapshot do not grow an `orders` field, a test label, or `patient_name`.
- [ ] 1.2 The patient photo service does not import the desk lab-order service and does not insert a fulfillment row.
- [ ] 1.3 The prep page and `/my-visit` do not render a list of tests.

### 2. Verification
- [ ] 2.1 Unit test: the public history source and the photo source do not reference `listPendingLabAppointments` or `visit_lab_order_fulfillments`
- [ ] 2.2 A contract note: patient prep does not return open orders in this phase
- [ ] 2.3 Typecheck and lint the touched files

---

## 📁 Files to Create/Update

- ❌ Guard test — MISSING
- ⚠️ `CONTRACTS.md` — EXISTS, one sentence

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- The desk list is the source that would be wrong to expose: it includes patient names and is not a finished patient-safe read.
- When that list later becomes a patient-safe read, a later task can show labels. This task does not reserve a response field for it.
- No PHI in logs.

---

## ✅ Acceptance & Verification Criteria

- [ ] A follow-up with an open desk order sees no test name on the prep page
- [ ] A patient photo leaves fulfillment rows unchanged

---

## 📝 Notes

DVP-DL-13 and DVP-DL-14 stay on the desk. This phase does not borrow them.

---

## 🔗 Related Tasks

- [`task-clk-24-phase-4-gate.md`](./task-clk-24-phase-4-gate.md)

**Last Updated:** 2026-09-27
