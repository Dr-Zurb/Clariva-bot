# Task 02: Assign MRN when booking completes without payment (₹0 / waived / queue)
## 2026-04-15 — Phase B

---

## Task Overview

Ensure **registration** (MRN assignment) happens when a visit is **fully booked** but **no payment gateway capture** occurs — so those patients **appear** in the doctor list after [task-01](./task-01-patients-list-mrn-filter.md) (MRN-gated). Reuse **`assignMrnAfterPayment`** or introduce a single idempotent **`ensurePatientRegistered`** helper that calls the same RPC as migration 046 when MRN is still null.

**Estimated Time:** 4–6 hours  
**Status:** DONE  
**Completed:** 2026-04-15

**Change Type:**
- [x] **Update existing** — Follow [CODE_CHANGE_RULES.md](../../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- **What exists:** `assignMrnAfterPayment` in `patient-service.ts`; invoked from `webhook-worker.ts` after `processPaymentSuccess` when payment succeeds.
- **What's missing:** A **non-payment** completion path that assigns MRN once (idempotent) for `free_of_cost`, zero amount, or queue flows that skip Razorpay/PayPal.
- **Notes:** Trace `bookAppointment`, public booking routes, and any “confirm slot without pay” logic before editing.

**Scope Guard:**
- Expected files touched: ≤ 6
- Do not duplicate MRN assignment in five places — consolidate to one helper + clear call sites

**Reference Documentation:**
- [15-04-2026 README](./README.md)
- [MIGRATIONS_AND_CHANGE.md](../../../../Reference/MIGRATIONS_AND_CHANGE.md) (046 already defines RPC)
- [UNIFIED_SLOT_PAYMENT_FLOW.md](../../../../Reference/UNIFIED_SLOT_PAYMENT_FLOW.md) if applicable

---

## Task Breakdown

### 1. Trace completion paths
- [x] 1.1 Map flows where appointment is created/confirmed **without** `processPaymentSuccess`
- [x] 1.2 Identify `freeOfCost` / zero-fee flags in validation and services
- [x] 1.3 List every exit point where “booking is done” for the patient

### 2. Implement registration hook
- [x] 2.1 Prefer one function: e.g. `ensurePatientMrnIfEligible(patientId, correlationId)` wrapping existing `assignMrnAfterPayment` (already no-op if MRN set)
- [x] 2.2 Call it from the appropriate **single** or **minimal** set of booking-finalize paths (after appointment persisted + doctor/patient linkage clear)
- [x] 2.3 Ensure idempotency: duplicate webhooks or retries do not error

### 3. Verification
- [x] 3.1 Unit or integration test: free booking path assigns MRN when applicable
- [x] 3.2 Paid path unchanged (still assigns via payment webhook or confirm no double-assign issues)
- [x] 3.3 `tsc --noEmit`; Jest green

---

## Files to Create/Update

- `backend/src/services/patient-service.ts` — MODIFY (helper export if split)
- `backend/src/services/payment-service.ts` / booking services — REVIEW callers
- `backend/src/workers/webhook-worker.ts` — REVIEW (keep payment path)
- Public booking / appointment routes — MODIFY as needed
- Tests under `backend/tests/`

**When updating existing code:** CODE_CHANGE_RULES audit checklist applies.

---

## Design Constraints

- Idempotent MRN assignment (RPC / `assign_patient_mrn` already designed for single assign)
- No PHI in logs
- Align semantics with product: “registered” = MRN for bot; staff manual path deferred ([deferred doc](../../../deferred/deferred-doctor-ui-add-patient-2026-04.md))

---

## Global Safety Gate

- [x] **Data touched?** Yes — patient update via RPC
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** No for MRN assign itself
- [x] **Retention / deletion impact?** No

---

## Acceptance Criteria

- [x] A patient who completes a **zero-fee** (or no-payment) booking gets **MRN** and appears in Patients list (with task-01)
- [x] Paid flow still assigns MRN on payment success
- [x] No duplicate MRNs or constraint violations under retry

---

## Related Tasks

- [Task 01](./task-01-patients-list-mrn-filter.md) — list visibility
- [Task 03](./task-03-reference-docs-registered-patient.md) — document behavior

---

**Last Updated:** 2026-04-15  
**Reference:** [TASK_TEMPLATE.md](../../../../task-management/TASK_TEMPLATE.md)
