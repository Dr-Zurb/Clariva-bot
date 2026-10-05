# Task clk-11: Patient history write

## 📋 Task Overview

A valid history-form token can insert the sidecar once and save the illness chips. It must not call the desk upsert and must not write the chart.

**Program / Phase:** clinic-link · Phase 2 (visit-prep)
**Batch:** [`plan-p2-clinic-link-visit-prep-batch.md`](../plan-p2-clinic-link-visit-prep-batch.md)
**Execution order:** [`EXECUTION-ORDER-p2-clinic-link-visit-prep.md`](./EXECUTION-ORDER-p2-clinic-link-visit-prep.md)
**Estimated Time:** 6 hours
**Status:** ✅ **DONE** (2026-09-24)

**Change Type:**
- [x] **New feature** — public patient insert
- [x] **Update existing** — chips on the appointment

**Current State:**
- ✅ **What exists:** `upsertHistorySubmission` inserts or updates the sidecar and calls `applyDeskHistoryToChart`. `acceptHistorySubmissionItem` already accepts a medicine onto `patient_medications` with `source = 'self'`. Sources include `patient`. `UNIQUE (appointment_id)`.
- ❌ **What's missing:** a patient insert that does not call that upsert, and a write of `previsit_context`.
- ⚠️ **Notes:** This is the health-data write. Read `COMPLIANCE.md` first. Waits on clk-09 and clk-10.

**Scope Guard:**
- Expected files touched: ≤ 6 (validation, controller, a patient insert beside the desk service, the appointment chip write, `CONTRACTS.md`, one test)
- Do not call `upsertHistorySubmission`
- Do not write `patient_allergies`, `patient_medications`, `patient_chronic_conditions`, or `prescriptions` on this path
- Do not change the doctor accept handler
- Do not log list contents, the reason, or the token

**Reference Documentation:**
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)
- [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — sidecar row and `appointments.previsit_context`. PHI: medicines, allergies, conditions, illness chips.
- [x] **RLS verified?** Y — service-role write, scoped to the appointment the token resolved. No patient JWT insert policy.
- [x] **Any PHI in logs?** No — appointment id and counts only
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N — same sidecar retention as a desk row. Chips follow the appointment.

---

## ✅ Task Breakdown

### 1. Lists
- [x] 1.1 Verify the history-form token before any write. Unknown, wrong kind, expired, or cancelled does not insert.
- [x] 1.2 Insert the sidecar only when that appointment has no row. `source = 'patient'`. `actor_id` is that appointment's `patients.id`. `why_today` is the booking `reason_for_visit` so accept still has a string.
- [x] 1.3 Medicines, allergies, and conditions are each a short list or “none.” Store `notice_version`. The sentence shown later stays `⟨fill — counsel⟩`.
- [x] 1.4 A second patient POST of the lists is 409. A `front_desk` or `assistant` row is not updated.

### 2. Chips
- [x] 2.1 Save the four optional chips on `previsit_context`. They save even when a desk row already exists.
- [x] 2.2 Do not copy the chips into `reason_for_visit`

### 3. Verification
- [x] 3.1 Unit test: first insert does not call the desk upsert and does not write a chart table; second POST is 409; desk row unchanged; chips still save; missing token fails
- [x] 3.2 Typecheck and lint the touched files
- [x] 3.3 Contract note for the patient POST

---

## 📁 Files to Create/Update

- ⚠️ `upsertHistorySubmission` — EXISTS, do not call it from this path
- ⚠️ `acceptHistorySubmissionItem` — EXISTS, leave it
- ✅ Patient insert — `public-clinic-history-service.ts` (2026-09-24)
- ⚠️ `CONTRACTS.md` — EXISTS

**When updating existing code:**
- [x] Audit callers of `upsertHistorySubmission` before touching that function — function not edited; patient path does not call it
- [x] Remove no desk behavior

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Zod before the service. Controller does not touch the database.
- Service-role write. Typed `AppError` only.
- Desk write-through stays on the desk function.
- No PHI in logs. Audit logs get ids only.

---

## ✅ Acceptance & Verification Criteria

- [x] One patient submit stores the lists and the chips
- [x] Chart tables are unchanged until a doctor accept, which already sets medicine `source = 'self'`
- [x] Second submit is 409. A desk row is byte-identical
- [x] Chips still save when the lists are hidden by a desk row

---

## 📝 Notes

CLK-DL-7, CLK-DL-8, CLK-DL-9, CLK-DL-10. The empty GET is `clk-12`.

---

## 🔗 Related Tasks

- [`task-clk-09-prep-columns.md`](./task-clk-09-prep-columns.md)
- [`task-clk-10-history-form-token.md`](./task-clk-10-history-form-token.md)
- [`task-clk-12-patient-history-read.md`](./task-clk-12-patient-history-read.md)

**Last Updated:** 2026-09-23
