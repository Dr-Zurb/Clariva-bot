# Task clk-16: Patient photo read and delete

## 📋 Task Overview

The prep page can list and remove only the photos this patient added. Desk scans never appear on that response. Delete stops once the visit is checked in.

**Program / Phase:** clinic-link · Phase 3 (photos)
**Batch:** [`plan-p3-clinic-link-photos-batch.md`](../plan-p3-clinic-link-photos-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-clinic-link-photos.md`](./EXECUTION-ORDER-p3-clinic-link-photos.md)
**Estimated Time:** 4 hours
**Status:** ✅ **DONE** (2026-09-27)

**Change Type:**
- [x] **New feature** — public list and delete of the patient’s own files

**Current State:**
- ✅ **What exists:** Doctor and desk reads of `visit_documents`, including `source`. Signed URLs last 300 seconds on the desk path. `clk-15` will own the patient write.
- ❌ **What's missing:** a token-scoped list that skips desk rows, and a delete that the patient can use only before check-in.
- ⚠️ **Notes:** Waits on clk-15. Rate-limit these routes the way the other public prep routes are limited.

**Scope Guard:**
- Expected files touched: ≤ 5 (route, controller, the read and delete next to clk-15, `CONTRACTS.md`, one test)
- Do not return desk documents, `file_path`, filenames, or extracted lab rows
- Do not let the patient token delete a `front_desk` row
- Do not change the desk delete function

**Reference Documentation:**
- [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md)
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — read and delete of `source = patient` rows and their storage objects.
- [x] **RLS verified?** Y — service role, scoped to the appointment on the token.
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** Y — a successful delete removes that object. A checked-in visit keeps it.

---

## ✅ Task Breakdown

### 1. Own files only
- [x] 1.1 GET returns the patient’s documents for that appointment: id, document type, and a short-lived signed URL. `file_path` is absent.
- [x] 1.2 A `front_desk` row on the same appointment is not in the payload.
- [x] 1.3 Wrong kind, bad signature, expired, and cancelled return no file list.

### 2. Delete before check-in
- [x] 2.1 The patient may delete their own `source = patient` row while `patient_checked_in_at` is null. The row and the object go away.
- [x] 2.2 After `patient_checked_in_at` is set, delete is 409 and the object stays.
- [x] 2.3 A desk document id on this route does not delete that row.

### 3. Verification
- [x] 3.1 Unit test: desk row omitted, path absent, delete before check-in, 409 after check-in, booking token fails
- [x] 3.2 Typecheck and lint the touched files
- [x] 3.3 Contract note for the list and the delete

---

## 📁 Files to Create/Update

- ⚠️ Public photo route — MISSING until clk-15, then extend
- ⚠️ `CONTRACTS.md` — EXISTS
- ❌ Read and delete test — MISSING

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Zod on the query and the delete id before the service.
- Response uses the canonical success helper.
- HL-DL-8: a leaked link must not dump the desk’s scans.
- No PHI in logs.

---

## ✅ Acceptance & Verification Criteria

- [x] The prep token sees only the patient’s own files
- [x] Delete succeeds before check-in and fails after it
- [x] A desk file is still there after a patient delete call aimed at its id

---

## 📝 Notes

The screen that calls this is `clk-17`. “Opened” is `patient_checked_in_at`, not a new column.

---

## 🔗 Related Tasks

- [`task-clk-15-patient-photo-write.md`](./task-clk-15-patient-photo-write.md)
- [`task-clk-17-prep-photo-control.md`](./task-clk-17-prep-photo-control.md)

**Last Updated:** 2026-09-27
