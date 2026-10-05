# Task clk-19: Phase 3 gate

## 📋 Task Overview

Walk the Phase 3 acceptance gate on a dummy image. Record what passed. Do not add behavior.

**Program / Phase:** clinic-link · Phase 3 (photos)
**Batch:** [`plan-p3-clinic-link-photos-batch.md`](../plan-p3-clinic-link-photos-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-clinic-link-photos.md`](./EXECUTION-ORDER-p3-clinic-link-photos.md)
**Estimated Time:** 3 hours
**Status:** ✅ **DONE** (2026-09-27)

**Change Type:**
- [x] **Update existing** — check the gate and the task boxes

**Current State:**
- ✅ **What exists:** clk-15 through clk-18, once they are done.
- ❌ **What's missing:** a recorded pass of the batch gate.
- ⚠️ **Notes:** Dummy image only. No real patient file in the notes. Cancel the dummy visit afterward.

**Scope Guard:**
- Expected files touched: the batch plan gate checkboxes and a short note of commands
- Do not add a feature to make the gate pass
- If a box fails, stop and name the task that owns the fix

**Reference Documentation:**
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)
- [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — one dummy appointment and one dummy image
- [x] **RLS verified?** Y — same paths as clk-15 and the existing doctor document read
- [x] **Any PHI in logs?** No — confirm the upload log has an appointment id and a count, not a filename
- [x] **External API or AI call?** N — do not run extract
- [x] **Retention / deletion impact?** N — cancel the dummy visit when the walk is done

---

## ✅ Task Breakdown

### 1. Walk the gate
- [x] 1.1 A dummy report image is on the visit before the note starts. `source` is `patient`, `ordered_by` is `outside`, path prefix is `{doctor_id}/patient/{appointment_id}/`.
- [x] 1.2 The doctor group says “From the patient” and has no Extract control. A desk file on another visit, or a desk row on this one, keeps the staff group and a `…/desk/…` path.
- [x] 1.3 The sixth patient file is refused. An oversize body is refused. A booking token and a join token cannot upload.
- [x] 1.4 Public GET omits desk files and `file_path`. Delete succeeds before check-in and returns 409 after `patient_checked_in_at` is set.
- [x] 1.5 Desk upload behavior is unchanged. Logs have no filename and no file bytes.

### 2. Record
- [x] 2.1 Check the batch gate boxes with the date
- [x] 2.2 Note the typecheck, lint, and test commands that ran

---

## 📁 Files to Create/Update

- ⚠️ [`plan-p3-clinic-link-photos-batch.md`](../plan-p3-clinic-link-photos-batch.md) — gate checkboxes

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

Walked 2026-09-27. Dummy visit cancelled afterward. Prep page listed one image and Remove cleared it. Cap 409, oversize 413, booking and join tokens 401, desk id 404, checked-in delete 409. Store log had the appointment id and a count. The consult route was not opened; the strip component test covered the two headings.

Commands are on the batch plan.

Phase 4 (show up ready) stays untasked.

---

## 🔗 Related Tasks

- [`task-clk-17-prep-photo-control.md`](./task-clk-17-prep-photo-control.md)
- [`task-clk-18-doctor-patient-group.md`](./task-clk-18-doctor-patient-group.md)

**Last Updated:** 2026-09-27
