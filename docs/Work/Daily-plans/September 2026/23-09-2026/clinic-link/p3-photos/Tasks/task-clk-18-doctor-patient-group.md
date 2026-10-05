# Task clk-18: Doctor group for patient photos

## 📋 Task Overview

Patient photos show beside the desk’s documents, under “From the patient.” Extract is not offered on those rows. Desk files stay in the staff group.

**Program / Phase:** clinic-link · Phase 3 (photos)
**Batch:** [`plan-p3-clinic-link-photos-batch.md`](../plan-p3-clinic-link-photos-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-clinic-link-photos.md`](./EXECUTION-ORDER-p3-clinic-link-photos.md)
**Estimated Time:** 2 hours
**Status:** ✅ **DONE** (2026-09-27)

**Change Type:**
- [x] **Update existing** — `DeskVisitDocumentsStrip`

**Current State:**
- ✅ **What exists:** The strip loads every visit document for the appointment. Each row already has `source`. The only heading is “From staff,” and Extract is shown on extractable pages regardless of source.
- ❌ **What's missing:** a separate group for `source = patient`, with no Extract control.
- ⚠️ **Notes:** Waits on clk-15 so a patient row can exist. Does not wait on the prep page.

**Scope Guard:**
- Expected files touched: ≤ 3 (the strip, one test)
- Do not change desk upload or the desk path
- Do not add an extract call for a patient file
- Do not promote a patient file into the prescription

**Reference Documentation:**
- [FRONTEND_STANDARDS.md](../../../../../../../Reference/engineering/development/FRONTEND_STANDARDS.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N — display of rows the doctor list already returns
- [x] **RLS verified?** Y — the existing doctor JWT read. No new policy.
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N — this task must not call extract
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Two groups
- [x] 1.1 `source = front_desk` stays under “From staff” with the current Extract controls.
- [x] 1.2 `source = patient` is a second group headed “From the patient.” Those rows have no Extract control and no promote control.
- [x] 1.3 Opening a patient page still uses the existing signed-URL read. The path is not rendered.

### 2. Verification
- [x] 2.1 Unit test: a patient row has no Extract button; a desk row still has one when the page is extractable
- [x] 2.2 Typecheck and lint the touched files

---

## 📁 Files to Create/Update

- ⚠️ `frontend/components/cockpit/rx/objective/DeskVisitDocumentsStrip.tsx` — EXISTS
- ❌ Group test — MISSING

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Group by the `source` field already on the payload. Do not fetch a second list.
- Desk behavior for desk rows stays.

---

## ✅ Acceptance & Verification Criteria

- [x] A patient photo is visible in the consult before the note starts
- [x] Extract is absent on that photo and present on a desk lab page
- [x] A desk file’s path prefix is still `…/desk/…`

---

## 📝 Notes

CLK-DL-11. No new document type. The strip test renders both groups. The live consult route was not opened.

---

## 🔗 Related Tasks

- [`task-clk-15-patient-photo-write.md`](./task-clk-15-patient-photo-write.md)
- [`task-clk-19-phase-3-gate.md`](./task-clk-19-phase-3-gate.md)

**Last Updated:** 2026-09-27
